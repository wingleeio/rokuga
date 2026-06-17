// Validates the audio-mux filtergraph used by src/main/exporter.ts:
// trim-per-segment -> concat -> atempo(speed) -> volume -> apad, muxed with the
// frame stream and clamped by -shortest. Uses synthetic media so it needs no
// camera/mic permission. Mirrors the real pipeline where input 0 is the
// already-cut-and-sped frame stream and input 1 is the original mic media.
const ffmpeg = require('fluent-ffmpeg')
const ffmpegStatic = require('ffmpeg-static')
const ffprobeStatic = require('ffmpeg-static') // probe via the same binary's sibling
const { execFileSync } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')

const FF = ffmpegStatic.replace('app.asar', 'app.asar.unpacked')
ffmpeg.setFfmpegPath(FF)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rokuga-audtest-'))
const framesPath = path.join(tmp, 'frames.mp4')
const camPath = path.join(tmp, 'camera.webm')
const outPath = path.join(tmp, 'out.mp4')

// ---- copied verbatim from src/main/exporter.ts ----
function atempoChain(speed) {
  let s = Math.min(4, Math.max(0.25, speed))
  const factors = []
  while (s > 2.0) { factors.push(2.0); s /= 2.0 }
  while (s < 0.5) { factors.push(0.5); s /= 0.5 }
  factors.push(s)
  return factors.map((f) => `atempo=${f.toFixed(5)}`).join(',')
}
function audioFilterParts(audio) {
  const parts = []
  const segs = audio.segments.filter((s) => s.end > s.start)
  if (segs.length) {
    const labels = []
    segs.forEach((s, i) => {
      parts.push(`[1:a]atrim=start=${s.start.toFixed(4)}:end=${s.end.toFixed(4)},asetpts=PTS-STARTPTS[a${i}]`)
      labels.push(`[a${i}]`)
    })
    parts.push(`${labels.join('')}concat=n=${segs.length}:v=0:a=1[ac]`)
  } else {
    parts.push('[1:a]anull[ac]')
  }
  parts.push(`[ac]${atempoChain(audio.speed)},volume=${audio.volume.toFixed(3)}[outa]`)
  return parts
}
// ---------------------------------------------------

function run(cmd) {
  return new Promise((resolve, reject) => {
    cmd.on('end', resolve).on('error', reject)
  })
}
function gen(args) {
  execFileSync(FF, args, { stdio: 'ignore' })
}

;(async () => {
  // segments keep 0-2s and 3-6s (a 1s cut) = 5s of source; speed 1.5 -> 3.333s.
  const segments = [{ start: 0, end: 2 }, { start: 3, end: 6 }]
  const speed = 1.5
  const keptSrc = segments.reduce((a, s) => a + (s.end - s.start), 0) // 5
  const expected = keptSrc / speed // 3.333s

  // input 0 = the rendered frame stream (already cut + sped) -> ~expected length.
  gen(['-y', '-f', 'lavfi', '-i', `testsrc=size=320x180:rate=30:duration=${expected.toFixed(3)}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', framesPath])
  // input 1 = original mic media (6s of audio), untrimmed — only [1:a] is used.
  gen(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'libopus', camPath])

  const audio = { path: camPath, segments, speed, volume: 1.0 }
  const cmd = ffmpeg(framesPath).input(audio.path)
  const scaleV = `[0:v]scale=-2:180:flags=lanczos[outv]`
  cmd.complexFilter([scaleV, ...audioFilterParts(audio)])
  cmd.outputOptions([
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-r', '30', '-fps_mode', 'cfr',
    '-c:a', 'aac', '-b:a', '192k'
  ])
  await run(cmd.save(outPath))

  // ffmpeg-static doesn't ship ffprobe; parse `ffmpeg -i` stderr instead.
  let info = ''
  try {
    execFileSync(FF, ['-i', outPath], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (e) {
    info = e.stderr ? e.stderr.toString() : ''
  }
  const durM = info.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
  const dur = durM ? (+durM[1] * 3600 + +durM[2] * 60 + +durM[3]) : NaN
  const hasAudio = /Stream #\d+:\d+.*Audio:\s*aac/.test(info)
  const hasVideo = /Stream #\d+:\d+.*Video:\s*h264/.test(info)

  const okDur = Math.abs(dur - expected) < 0.35
  const line = `expected≈${expected.toFixed(3)}s  got=${isNaN(dur) ? '?' : dur.toFixed(3)}s  dur_ok=${okDur}  audio=${hasAudio}  video=${hasVideo}`
  const verdict = okDur && hasAudio && hasVideo ? 'AUDIO_EXPORT_OK' : 'AUDIO_EXPORT_FAIL'
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.writeFileSync('/tmp/rk-audtest-result.txt', `${line}\n${verdict}\n`)
  console.log(line)
  console.log(verdict)
  // Use exitCode (not exit()) so piped stdout flushes before the process ends.
  process.exitCode = verdict === 'AUDIO_EXPORT_OK' ? 0 : 1
})().catch((e) => {
  const msg = 'ERR ' + (e && e.message ? e.message : e)
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  fs.writeFileSync('/tmp/rk-audtest-result.txt', msg + '\n')
  console.error(msg)
  process.exitCode = 1
})
