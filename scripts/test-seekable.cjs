// Validates exporter.ts `media:makeSeekable`: a cue-less webm (like MediaRecorder
// output) transcodes to a faststart H.264 mp4 that browsers can seek frame-by-frame.
const ffmpeg = require('fluent-ffmpeg')
const FF = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
const { execFileSync } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')
ffmpeg.setFfmpegPath(FF)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-seek-'))
const webm = path.join(tmp, 'cam.webm'), out = path.join(tmp, 'cam.seek.mp4')

execFileSync(FF, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=4',
  '-c:v', 'libvpx', '-b:v', '500k', webm], { stdio: 'ignore' })

new Promise((res, rej) =>
  ffmpeg(webm)
    .outputOptions(['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    .on('end', res).on('error', rej).save(out)
).then(() => {
  let info = ''
  try { execFileSync(FF, ['-i', out], { stdio: ['ignore', 'ignore', 'pipe'] }) } catch (e) { info = e.stderr ? e.stderr.toString() : '' }
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(info)
  const d = m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : NaN
  const h264 = /Video:\s*h264/.test(info)
  const head = fs.readFileSync(out).slice(0, 200000).toString('latin1')
  const moov = head.indexOf('moov'), mdat = head.indexOf('mdat')
  const faststart = moov >= 0 && (mdat < 0 || moov < mdat)
  const verdict = Math.abs(d - 4) < 0.3 && h264 && faststart ? 'SEEK_OK' : 'SEEK_FAIL'
  fs.writeFileSync('/tmp/rk-seek-result.txt', `dur=${isNaN(d) ? '?' : d.toFixed(2)} h264=${h264} faststart=${faststart}\n${verdict}\n`)
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(verdict)
}).catch((e) => {
  fs.writeFileSync('/tmp/rk-seek-result.txt', 'ERR ' + (e && e.message || e) + '\n')
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
})
