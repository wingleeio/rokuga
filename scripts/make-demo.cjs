// Dev-only: build a demo .rokuga (test-pattern video + project.json) for visual QA.
const { execFileSync } = require('child_process')
const fs = require('fs')
const ffmpegPath = require('ffmpeg-static')
const AdmZip = require('adm-zip')

const webm = '/tmp/demo.webm'
execFileSync(ffmpegPath, [
  '-y',
  '-f', 'lavfi',
  '-i', 'testsrc=duration=4:size=1280x720:rate=30',
  '-c:v', 'libvpx-vp9',
  '-pix_fmt', 'yuv420p',
  '-b:v', '2M',
  webm
])

const media = fs.readFileSync(webm)

// Synthetic cursor path: starts just OUTSIDE the window (negative x → over the
// background), then drifts into the content.
const cursor = []
for (let i = 0; i <= 120; i++) {
  const t = (i / 30) * 1000
  const phase = i / 120
  cursor.push({
    t,
    x: -0.07 + phase * 0.55 + Math.sin(phase * 6) * 0.03,
    y: 0.32 + Math.cos(phase * 5) * 0.03 + phase * 0.1
  })
}

const project = {
  version: 1,
  name: 'Product Demo',
  recording: {
    width: 1280,
    height: 720,
    duration: 4,
    fps: 30,
    mediaPath: 'media.webm',
    cursor,
    createdAt: Date.now(),
    sourceName: 'Built-in Retina Display'
  },
  background: { kind: 'gradient', colors: ['#7028e4', '#e5b2ca'], angle: 135, image: null, blur: 0 },
  frame: { padding: 0.09, cornerRadius: 18, shadow: 0.5, shadowBlur: 70, scale: 1, borderWidth: 0, borderColor: '#ffffff' },
  camera: {
    enabled: true,
    auto: true,
    autoIntensity: 1,
    autoScale: 1.8,
    smoothing: 0.5,
    keyframes: [
      { id: 'k1', t: 0, x: 0.5, y: 0.5, scale: 1, transition: 0.5 },
      { id: 'k2', t: 2.6, x: 0.5, y: 0.5, scale: 1, transition: 0.5 }
    ]
  },
  timeline: { segments: [{ id: 's1', start: 0, end: 4 }], speed: 1 },
  canvas: { aspect: '16:9', outputHeight: 1080 },
  cursor: { show: true, size: 46, smoothing: 0.4 }
}

const zip = new AdmZip()
zip.addFile('project.json', Buffer.from(JSON.stringify(project, null, 2)))
zip.addFile('media.webm', media)
zip.writeZip('/tmp/demo.rokuga')
console.log('wrote /tmp/demo.rokuga', media.length, 'bytes media')
