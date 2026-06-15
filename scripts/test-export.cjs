// Dev-only: drive a real export of the demo project (no save dialog) and verify
// the output mp4's duration/frame count via ffprobe.
const { app, BrowserWindow, ipcMain } = require('electron')
const { join } = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const AdmZip = require('adm-zip')
const { PassThrough } = require('stream')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegStatic = require('ffmpeg-static')
ffmpeg.setFfmpegPath(ffmpegStatic)

const OUT = '/tmp/rokuga-export-test.mp4'

ipcMain.handle('sources:list', () => [])
ipcMain.handle('app:displays', () => [])
ipcMain.handle('cursor:start', () => true)
ipcMain.handle('cursor:stop', () => [])
ipcMain.handle('recording:nativeStart', () => ({ ok: false, reason: 'test' }))
ipcMain.handle('recording:setPendingSource', () => true)
ipcMain.handle('project:open', () => {
  const zip = new AdmZip('/tmp/demo.rokuga')
  return {
    state: JSON.parse(zip.readAsText('project.json')),
    path: '/tmp/demo.rokuga',
    media: zip.getEntry('media.webm').getData()
  }
})

let input = null
let donePromise = null
ipcMain.handle('export:begin', (_e, options) => {
  try { fs.unlinkSync(OUT) } catch {}
  input = new PassThrough({ highWaterMark: 1 << 24 })
  const cmd = ffmpeg(input)
    .inputFormat('image2pipe')
    .inputFPS(options.fps)
    .videoCodec('libx264')
    .outputOptions(['-crf 20', '-preset veryfast', '-pix_fmt yuv420p', `-r ${options.fps}`, '-fps_mode cfr'])
    .videoFilters(`scale=-2:${options.height}`)
  donePromise = new Promise((res, rej) => cmd.on('end', () => res()).on('error', (e) => rej(e)).save(OUT))
  donePromise.catch(() => {})
  return { ok: true }
})
ipcMain.handle('export:frame', async (_e, buf) => {
  if (!input) return false
  const ok = input.write(Buffer.from(buf))
  if (!ok) await new Promise((r) => input.once('drain', () => r()))
  return true
})
ipcMain.handle('export:end', async () => {
  if (!input) return null
  input.end()
  input = null
  try { await donePromise; return OUT } catch (e) { console.log('FFMPEG_ERR ' + e); return null }
})
ipcMain.handle('export:cancel', () => { if (input) { input.destroy(); input = null } return true })

const clickJs = (fn, arg) => `(${String(fn)})(${JSON.stringify(arg)})`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360, height: 880, show: false,
    webPreferences: { preload: join(__dirname, '../out/preload/index.js'), sandbox: false }
  })
  await win.loadFile(join(__dirname, '../out/renderer/index.html'))
  await new Promise((r) => setTimeout(r, 1000))
  await win.webContents.executeJavaScript(clickJs(() => {
    const b = [...document.querySelectorAll('.record__actions button')].find((x) => x.textContent.trim() === 'Open')
    if (b) b.click()
  }))
  await new Promise((r) => setTimeout(r, 2500))
  await win.webContents.executeJavaScript(clickJs(() => {
    const b = [...document.querySelectorAll('.topbar__right button')].find((x) => x.textContent.trim() === 'Export')
    if (b) b.click()
  }))
  await new Promise((r) => setTimeout(r, 400))
  await win.webContents.executeJavaScript(clickJs(() => {
    const b = [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === 'Export video')
    if (b) b.click()
  }))

  // wait for the saved banner or done status
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const done = await win.webContents
      .executeJavaScript(`(()=>{const e=document.querySelector('.banner--ok');return e?'1':''})()`)
      .catch(() => '')
    if (done) break
  }
  await new Promise((r) => setTimeout(r, 500))

  if (fs.existsSync(OUT)) {
    execFile(
      ffmpegStatic.replace('ffmpeg-static/ffmpeg', 'ffmpeg-static/ffmpeg'),
      ['-i', OUT],
      (err, _so, se) => {
        const m = /Duration: ([0-9:.]+)/.exec(se || '')
        const fr = /([0-9.]+) fps/.exec(se || '')
        console.log('OUTPUT_EXISTS size=' + fs.statSync(OUT).size + ' duration=' + (m ? m[1] : '?') + ' fps=' + (fr ? fr[1] : '?'))
        app.quit()
      }
    )
  } else {
    console.log('NO_OUTPUT')
    app.quit()
  }
})
