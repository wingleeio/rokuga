import { dialog, type IpcMain, type BrowserWindow } from 'electron'
import { PassThrough } from 'stream'
import { promises as fs, existsSync } from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import type { ExportAudio, ExportOptions } from '../shared/types'

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

// ffmpeg's atempo filter only spans 0.5..2.0 per instance; chain instances to
// cover the project's full speed range while preserving pitch.
function atempoChain(speed: number): string {
  let s = Math.min(4, Math.max(0.25, speed))
  const factors: number[] = []
  while (s > 2.0) {
    factors.push(2.0)
    s /= 2.0
  }
  while (s < 0.5) {
    factors.push(0.5)
    s /= 0.5
  }
  factors.push(s)
  return factors.map((f) => `atempo=${f.toFixed(5)}`).join(',')
}

// Build the [1:a] audio graph: trim each kept segment, concat them (so the audio
// follows the same cuts as the video), then apply speed + gain, and pad with
// silence so `-shortest` can clamp to the authoritative video length.
function audioFilterParts(audio: ExportAudio): string[] {
  const parts: string[] = []
  const segs = audio.segments.filter((s) => s.end > s.start)
  if (segs.length) {
    const labels: string[] = []
    segs.forEach((s, i) => {
      parts.push(
        `[1:a]atrim=start=${s.start.toFixed(4)}:end=${s.end.toFixed(4)},asetpts=PTS-STARTPTS[a${i}]`
      )
      labels.push(`[a${i}]`)
    })
    parts.push(`${labels.join('')}concat=n=${segs.length}:v=0:a=1[ac]`)
  } else {
    parts.push('[1:a]anull[ac]')
  }
  // No apad here: the trimmed+concat+tempo audio is already ~the video length,
  // and apad produces an *infinite* stream that deadlocks with `-shortest`.
  parts.push(`[ac]${atempoChain(audio.speed)},volume=${audio.volume.toFixed(3)}[outa]`)
  return parts
}

// Output for a video+audio mux: video scaled in the filtergraph (so it composes
// with the audio graph), audio mapped from [outa].
function applyWithAudio(
  cmd: ffmpeg.FfmpegCommand,
  options: ExportOptions,
  audio: ExportAudio
): void {
  const quality = Math.min(100, Math.max(0, options.quality))
  const scaleV = `[0:v]scale=-2:${options.height}:flags=lanczos[outv]`
  cmd.complexFilter([scaleV, ...audioFilterParts(audio)])

  if (options.format === 'webm') {
    const crf = Math.round(36 - (quality / 100) * 22)
    cmd.outputOptions([
      '-map', '[outv]', '-map', '[outa]',
      '-c:v', 'libvpx-vp9', `-crf`, `${crf}`, '-b:v', '0', `-r`, `${options.fps}`,
      '-c:a', 'libopus', '-b:a', '160k'
    ])
  } else {
    const crf = Math.round(28 - (quality / 100) * 16)
    cmd.outputOptions([
      '-map', '[outv]', '-map', '[outa]',
      '-c:v', 'libx264', `-crf`, `${crf}`, '-preset', 'medium', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', `-r`, `${options.fps}`, '-fps_mode', 'cfr',
      '-c:a', 'aac', '-b:a', '192k'
    ])
  }
}

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
    async (
      _e,
      options: ExportOptions,
      projectName: string,
      audio?: ExportAudio | null
    ): Promise<{ ok: boolean }> => {
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
      // GIF is always silent; otherwise mux the mic audio when present.
      if (audio && options.format !== 'gif') {
        cmd.input(audio.path)
        applyWithAudio(cmd, options, audio)
      } else {
        applyOutput(cmd, options)
      }
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

  // MediaRecorder webm has no seek cues, so frame-stepped export (which seeks
  // the webcam to each frame's time) would freeze on a single frame. Transcode
  // to a seekable H.264 mp4 once and hand the bytes back for the export's hidden
  // <video>. Cached next to the source; audio is dropped (only video is needed —
  // the mic audio is muxed separately from the original file).
  ipcMain.handle('media:makeSeekable', async (_e, srcPath: string): Promise<Buffer | null> => {
    if (!srcPath || !existsSync(srcPath)) return null
    const out = `${srcPath.replace(/\.[^.]+$/, '')}.seek.mp4`
    if (!existsSync(out)) {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(srcPath)
          .outputOptions([
            '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart'
          ])
          .on('end', () => resolve())
          .on('error', (e) => reject(e))
          .save(out)
      })
    }
    return fs.readFile(out)
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
