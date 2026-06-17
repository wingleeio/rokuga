import { app, shell, BrowserWindow, ipcMain, dialog, desktopCapturer, screen } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerRecorderHandlers } from './recorder'
import { registerProjectHandlers } from './project'
import { registerExportHandlers } from './exporter'
import { registerNativeRecordingHandlers } from './sckrecorder'
import { registerUpdater } from './updater'

// `__dirname` is injected by electron-vite for the main-process bundle.

let mainWindow: BrowserWindow | null = null
let pendingSourceId: string | null = null

const iconPath = join(__dirname, '../../build/icon.png')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    // Vertically center the traffic lights within the 52px top bar.
    trafficLightPosition: process.platform === 'darwin' ? { x: 19, y: 19 } : undefined,
    title: 'Rokuga',
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Allow getUserMedia desktop capture requests from the renderer.
  // Route getDisplayMedia to the source the renderer selected. getDisplayMedia
  // runs in-process (with the app's Screen Recording permission) and honors the
  // `cursor: 'never'` track constraint, so the captured video has no OS cursor.
  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        const src = sources.find((s) => s.id === pendingSourceId) ?? sources[0]
        callback({ video: src })
      })
    },
    { useSystemPicker: false }
  )

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Dev dock icon (packaged builds use the bundled .icns via electron-builder).
  if (process.platform === 'darwin' && app.dock && existsSync(iconPath)) {
    app.dock.setIcon(iconPath)
  }

  registerRecorderHandlers(ipcMain, () => mainWindow)
  registerProjectHandlers(ipcMain, () => mainWindow)
  registerExportHandlers(ipcMain, () => mainWindow)
  registerNativeRecordingHandlers(ipcMain)
  registerUpdater(ipcMain, () => mainWindow)

  // Generic helpers used by the renderer.
  ipcMain.handle('app:displays', () => {
    return screen.getAllDisplays().map((d) => ({
      id: String(d.id),
      bounds: d.bounds,
      scaleFactor: d.scaleFactor
    }))
  })

  ipcMain.handle('recording:setPendingSource', (_e, id: string) => {
    pendingSourceId = id
    return true
  })

  ipcMain.handle('shell:reveal', (_e, p: string) => {
    if (p) shell.showItemInFolder(p)
    return true
  })

  ipcMain.handle('dialog:openFile', async (_e, filters: Electron.FileFilter[]) => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters })
    return res.canceled ? null : res.filePaths[0]
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
