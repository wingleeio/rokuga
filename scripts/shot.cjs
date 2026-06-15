// Dev-only: load the built renderer and capture it via webContents.capturePage()
// (no OS screen-recording permission needed). Registers fake IPC handlers so the
// record grid renders sample sources. Usage:
//   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/shot.cjs [out.png]
const { app, BrowserWindow, ipcMain } = require('electron')
const { join } = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')

const OUT = process.argv[2] || '/tmp/rokuga-shot.png'
const EDITOR = process.argv.includes('--editor')

function thumb(a, b) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='480' height='300' fill='url(%23g)'/></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/%23/g, '%23')
}

const fakeSources = [
  { id: 'screen:1', name: 'Built-in Retina Display', thumbnail: thumb('#2b1d16', '#5a3a28'), appIcon: null, display_id: '1', type: 'screen' },
  { id: 'screen:2', name: 'Studio Display', thumbnail: thumb('#1a2230', '#33506e'), appIcon: null, display_id: '2', type: 'screen' },
  { id: 'window:1', name: 'Safari — Rokuga', thumbnail: thumb('#3a2a1e', '#caa', '#caa'), appIcon: null, display_id: '', type: 'window' },
  { id: 'window:2', name: 'Visual Studio Code', thumbnail: thumb('#10243a', '#1f6fb2'), appIcon: null, display_id: '', type: 'window' },
  { id: 'window:3', name: 'Figma — Untitled', thumbnail: thumb('#2a1530', '#a23bb0'), appIcon: null, display_id: '', type: 'window' }
]

ipcMain.handle('sources:list', () => fakeSources)
ipcMain.handle('app:displays', () => [{ id: '1', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 2 }])
ipcMain.handle('cursor:start', () => true)
ipcMain.handle('cursor:stop', () => [])
ipcMain.handle('project:open', () => {
  const zip = new AdmZip('/tmp/demo.rokuga')
  const state = JSON.parse(zip.readAsText('project.json'))
  const media = zip.getEntry('media.webm').getData()
  return { state, path: '/tmp/demo.rokuga', media }
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    show: false,
    backgroundColor: '#16100d',
    webPreferences: { preload: join(__dirname, '../out/preload/index.js'), sandbox: false }
  })
  await win.loadFile(join(__dirname, '../out/renderer/index.html'))
  await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)').catch(() => {})
  await new Promise((r) => setTimeout(r, 800))
  if (EDITOR) {
    await win.webContents.executeJavaScript(
      `(${String(() => {
        const btn = [...document.querySelectorAll('header button')].find(
          (b) => b.textContent.trim() === 'Open'
        )
        if (btn) btn.click()
      })})()`
    )
    await new Promise((r) => setTimeout(r, 2600))
    const tabArg = (process.argv.find((a) => a.startsWith('--tab=')) || '').split('=')[1]
    if (tabArg) {
      await win.webContents.executeJavaScript(
        `(${String((label) => {
          const tab = [...document.querySelectorAll('.inspector__tab')].find(
            (b) => b.textContent.trim().toUpperCase() === label
          )
          if (tab) tab.click()
          setTimeout(() => {
            const row = document.querySelector('.zoom-row')
            if (row) row.click()
          }, 60)
        })})(${JSON.stringify(tabArg.toUpperCase())})`
      )
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  const img = await win.webContents.capturePage()
  fs.writeFileSync(OUT, img.toPNG())
  console.log('wrote', OUT)
  app.quit()
})
