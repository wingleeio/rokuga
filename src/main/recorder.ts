import { desktopCapturer, screen, app, type IpcMain, type BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { ensureWindowBoundsHelper, getWindowBounds, type Rect } from './winbounds'
import type { CaptureSource, CursorSample, RecordingMeta, SaveRecordingArgs } from '../shared/types'

interface CursorTracker {
  timer: NodeJS.Timeout | null
  start: number
  samples: CursorSample[]
  bounds: Rect
}

let tracker: CursorTracker | null = null

function workingDir(): string {
  return join(app.getPath('userData'), 'recordings')
}

export function registerRecorderHandlers(
  ipcMain: IpcMain,
  _getWindow: () => BrowserWindow | null
): void {
  // Compile the window-bounds helper in the background so window-capture cursor
  // tracking is ready by the time the user records.
  void ensureWindowBoundsHelper()

  ipcMain.handle('sources:list', async (): Promise<CaptureSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 480, height: 300 },
      fetchWindowIcons: true
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
      display_id: s.display_id,
      type: s.id.startsWith('screen') ? 'screen' : 'window'
    }))
  })

  // Begin sampling the global cursor position at ~60Hz. We normalize against
  // the bounds of the display being recorded so the data maps onto the frame
  // for full-screen capture; for window capture it is a best-effort estimate.
  ipcMain.handle('cursor:start', async (_e, sourceId: string, displayId: string) => {
    // Normalize cursor positions against the bounds of whatever was captured:
    // the window's frame for a window source, otherwise the display's bounds.
    let bounds: Rect | null = null
    const winMatch = /window:(\d+)/.exec(sourceId || '')
    if (winMatch) bounds = await getWindowBounds(parseInt(winMatch[1], 10))
    if (!bounds) {
      const displays = screen.getAllDisplays()
      const display =
        displays.find((d) => String(d.id) === String(displayId)) ??
        screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      bounds = display.bounds
    }
    const rect = bounds
    const samples: CursorSample[] = []
    const start = Date.now()
    const timer = setInterval(() => {
      const p = screen.getCursorScreenPoint()
      // Normalized relative to the captured surface — values can fall outside
      // 0..1 when the cursor is off the captured window (drawn over the
      // background later). Bounded to avoid extreme off-screen values.
      const x = (p.x - rect.x) / Math.max(1, rect.width)
      const y = (p.y - rect.y) / Math.max(1, rect.height)
      samples.push({
        t: Date.now() - start,
        x: Math.min(3, Math.max(-2, x)),
        y: Math.min(3, Math.max(-2, y))
      })
    }, 1000 / 60)
    tracker = { timer, start, samples, bounds: rect }
    return true
  })

  ipcMain.handle('cursor:stop', (): CursorSample[] => {
    if (!tracker) return []
    if (tracker.timer) clearInterval(tracker.timer)
    const samples = tracker.samples
    tracker = null
    return samples
  })

  ipcMain.handle(
    'recording:save',
    async (_e, args: SaveRecordingArgs): Promise<RecordingMeta> => {
      await fs.mkdir(workingDir(), { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const mediaPath = join(workingDir(), `rec-${stamp}.webm`)
      await fs.writeFile(mediaPath, Buffer.from(args.buffer))
      return {
        width: args.width,
        height: args.height,
        duration: args.duration,
        fps: args.fps,
        mediaPath,
        cursor: args.cursor,
        createdAt: Date.now(),
        sourceName: args.sourceName
      }
    }
  )
}
