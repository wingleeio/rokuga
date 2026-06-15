import { app, type IpcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

// In-process ScreenCaptureKit recorder (native addon). Because it runs inside
// the Electron process, it uses the app's own Screen Recording permission — no
// separate-executable TCC problem — and records with the OS cursor excluded.

interface CaptureAddon {
  start(windowId: number, displayId: number, outPath: string, fps: number): Promise<{
    width: number
    height: number
  }>
  stop(): Promise<void>
}

let addon: CaptureAddon | null = null
let triedLoad = false
let outPath: string | null = null
let recording = false

function loadAddon(): CaptureAddon | null {
  if (triedLoad) return addon
  triedLoad = true
  if (process.platform !== 'darwin') return null
  const candidates = [
    // packaged (electron-builder extraResources → Contents/Resources)
    join(process.resourcesPath || '', 'rokuga_capture.node'),
    // dev (node-gyp output)
    join(__dirname, '../../build/Release/rokuga_capture.node'),
    join(app.getAppPath(), 'build/Release/rokuga_capture.node')
  ]
  for (const p of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      addon = require(p) as CaptureAddon
      return addon
    } catch {
      /* try next */
    }
  }
  return null
}

export interface NativeStartResult {
  ok: boolean
  width?: number
  height?: number
  reason?: string
}

async function startNative(opts: {
  windowId?: number
  displayId?: number
  fps: number
}): Promise<NativeStartResult> {
  const a = loadAddon()
  if (!a) return { ok: false, reason: 'addon-unavailable' }
  if (recording) return { ok: false, reason: 'busy' }

  const out = join(app.getPath('temp'), `rokuga-native-${Date.now()}.mov`)
  try {
    const dims = await a.start(opts.windowId ?? 0, opts.displayId ?? 0, out, opts.fps)
    outPath = out
    recording = true
    return { ok: true, width: dims.width, height: dims.height }
  } catch (e) {
    const msg = String(e)
    const reason = /-3801|declined|TCC/i.test(msg) ? 'permission-declined' : msg.slice(0, 120)
    return { ok: false, reason }
  }
}

async function stopNative(): Promise<{ media: Buffer } | null> {
  const a = loadAddon()
  if (!a || !recording || !outPath) return null
  const out = outPath
  outPath = null
  recording = false
  try {
    await a.stop()
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 300)) // let the file finish flushing
  try {
    const media = await fs.readFile(out)
    fs.unlink(out).catch(() => {})
    return media.length > 1024 ? { media } : null
  } catch {
    return null
  }
}

export function registerNativeRecordingHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'recording:nativeStart',
    (_e, opts: { windowId?: number; displayId?: number; fps: number }) => startNative(opts)
  )
  ipcMain.handle('recording:nativeStop', () => stopNative())
}
