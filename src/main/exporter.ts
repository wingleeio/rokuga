import { dialog, type IpcMain, type BrowserWindow } from 'electron'
import { PassThrough } from 'stream'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import type { ExportOptions } from '../shared/types'

// ffmpeg-static ships the binary inside the asar in production; point at the
// unpacked copy so the child process can actually exec it.
const ffmpegPath = (ffmpegStatic as unknown as string)?.replace('app.asar', 'app.asar.unpacked')
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

const EXT: Record<ExportOptions['format'], string> = {
  mp4: 'mp4',
  webm: 'webm',
  gif: 'gif',
  mov: 'mov'
}

// The renderer streams composited frames (JPEG) here; ffmpeg reads them as an
// image2pipe at a fixed input frame rate, so the output is exactly
// frameCount / fps long — no MediaRecorder wall-clock timing, no freezes.
let input: PassThrough | null = null
let outPath: string | null = null
let donePromise: Promise<void> | null = null

function applyOutput(cmd: ffmpeg.FfmpegCommand, options: ExportOptions): void {
  const quality = Math.min(100, Math.max(0, options.quality))
  const scaleFilter = `scale=-2:${options.height}:flags=lanczos`

  if (options.format === 'gif') {
    const fps = Math.min(30, Math.max(5, options.fps))
    cmd
      .complexFilter([
        `[0:v] fps=${fps},${scaleFilter},split [a][b]`,
        `[a] palettegen=stats_mode=diff [p]`,
        `[b][p] paletteuse=dither=bayer:bayer_scale=3`
      ])
      .noAudio()
  } else if (options.format === 'webm') {
    const crf = Math.round(36 - (quality / 100) * 22)
    cmd
      .videoCodec('libvpx-vp9')
      .outputOptions([`-crf ${crf}`, '-b:v 0', `-r ${options.fps}`])
      .videoFilters(scaleFilter)
      .noAudio()
  } else {
    const crf = Math.round(28 - (quality / 100) * 16)
    cmd
      .videoCodec('libx264')
      .outputOptions([
        `-crf ${crf}`,
        '-preset medium',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        `-r ${options.fps}`,
        '-fps_mode cfr'
      ])
      .videoFilters(scaleFilter)
      .noAudio()
  }
}

export function registerExportHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(
    'export:begin',
    async (_e, options: ExportOptions, projectName: string): Promise<{ ok: boolean }> => {
      const win = getWindow()
      if (!win) return { ok: false }
      const ext = EXT[options.format]
      const res = await dialog.showSaveDialog(win, {
        title: 'Export video',
        defaultPath: `${projectName || 'rokuga-export'}.${ext}`,
        filters: [{ name: options.format.toUpperCase(), extensions: [ext] }]
      })
      if (res.canceled || !res.filePath) return { ok: false }
      outPath = res.filePath

      input = new PassThrough({ highWaterMark: 1 << 24 })
      const cmd = ffmpeg(input).inputFormat('image2pipe').inputFPS(options.fps)
      applyOutput(cmd, options)
      donePromise = new Promise<void>((resolve, reject) => {
        cmd.on('end', () => resolve()).on('error', (err) => reject(err)).save(outPath as string)
      })
      // Surface async ffmpeg failure without crashing.
      donePromise.catch(() => {})
      return { ok: true }
    }
  )

  ipcMain.handle('export:frame', async (_e, buf: ArrayBuffer): Promise<boolean> => {
    if (!input) return false
    const ok = input.write(Buffer.from(buf))
    if (!ok) await new Promise<void>((r) => input?.once('drain', () => r()))
    return true
  })

  ipcMain.handle('export:end', async (): Promise<string | null> => {
    if (!input) return null
    input.end()
    input = null
    try {
      await donePromise
      const p = outPath
      outPath = null
      return p
    } catch {
      outPath = null
      return null
    }
  })

  ipcMain.handle('export:cancel', () => {
    if (input) {
      input.destroy()
      input = null
    }
    outPath = null
    return true
  })
}
