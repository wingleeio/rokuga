import type { AspectPreset, BackgroundSettings, ProjectState } from '@shared/types'
import { cameraAt, cursorAt, type CameraPose } from './camera'
import { clamp } from './project'

const ASPECT_RATIO: Record<Exclude<AspectPreset, 'source'>, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

interface WindowRect {
  fx: number
  fy: number
  fw: number
  fh: number
}

/**
 * Renders the composited frame onto a canvas. The full composition (styled
 * background + the recorded window with padding, rounded corners, shadow,
 * border) is drawn to an offscreen "scene" canvas at 1× and treated as a single
 * image — like a desktop. The camera/zoom then crops and scales that whole scene
 * around the focus point, so the background scales together with the window
 * (the window never looks "cut out" with a static border around it). A synthetic
 * cursor is drawn on top at constant size. The same renderer drives the live
 * preview and export.
 */
export class Compositor {
  private ctx: CanvasRenderingContext2D
  private scene: HTMLCanvasElement
  private sctx: CanvasRenderingContext2D
  private imgCache = new Map<string, HTMLImageElement>()
  private smoothed: CameraPose | null = null
  private lastT = 0
  private smoothedCursor: { x: number; y: number } | null = null
  private lastCursorT = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private video: HTMLVideoElement,
    private camVideo: HTMLVideoElement | null = null
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.scene = document.createElement('canvas')
    this.sctx = this.scene.getContext('2d', { alpha: false })!
  }

  outputSize(project: ProjectState): { w: number; h: number } {
    const h = project.canvas.outputHeight
    const rec = project.recording
    const ratio =
      project.canvas.aspect === 'source'
        ? rec.width / rec.height
        : ASPECT_RATIO[project.canvas.aspect]
    return { w: even(h * ratio), h: even(h) }
  }

  async preloadAssets(project: ProjectState): Promise<void> {
    const src = project.background.image
    if (src && (project.background.kind === 'image' || project.background.kind === 'wallpaper')) {
      await this.loadImage(src)
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    const cached = this.imgCache.get(src)
    if (cached && cached.complete && cached.naturalWidth) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        this.imgCache.set(src, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
  }

  /** Base (un-zoomed) placement of the recorded window within the canvas. */
  private windowRect(project: ProjectState, outW: number, outH: number): WindowRect {
    const rec = project.recording
    const f = project.frame
    const pad = f.padding * Math.min(outW, outH)
    const availW = outW - 2 * pad
    const availH = outH - 2 * pad
    const vAspect = rec.width / rec.height
    let fw = availW
    let fh = availW / vAspect
    if (fh > availH) {
      fh = availH
      fw = availH * vAspect
    }
    fw *= f.scale
    fh *= f.scale
    return { fx: (outW - fw) / 2, fy: (outH - fh) / 2, fw, fh }
  }

  /** Reset the smoothing state (call when seeking/scrubbing to snap instantly). */
  resetSmoothing(): void {
    this.smoothed = null
    this.smoothedCursor = null
  }

  /** Critically-damped easing of the camera toward its keyframe target, for
   * smooth Screen-Studio-style pan/zoom during playback and export. When
   * `dtOverride` is given (frame-stepped export) it's used instead of wall time. */
  private smoothCamera(target: CameraPose, smooth: boolean, dtOverride?: number): CameraPose {
    if (!smooth || !this.smoothed) {
      this.smoothed = { ...target }
      this.lastT = performance.now()
      return this.smoothed
    }
    let dt: number
    if (dtOverride != null) {
      dt = dtOverride
    } else {
      const now = performance.now()
      dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000))
      this.lastT = now
    }
    const a = 1 - Math.exp(-dt / 0.16) // ~0.16s time constant
    this.smoothed = {
      scale: this.smoothed.scale + (target.scale - this.smoothed.scale) * a,
      x: this.smoothed.x + (target.x - this.smoothed.x) * a,
      y: this.smoothed.y + (target.y - this.smoothed.y) * a
    }
    return this.smoothed
  }

  /** Exponentially smooth the cursor so jitter/shake reads as smooth motion.
   * The `amount` (0..1) maps to the smoothing time constant. */
  private smoothCursor(
    target: { x: number; y: number } | null,
    amount: number,
    smooth: boolean,
    dtOverride?: number
  ): { x: number; y: number } | null {
    if (!target) {
      this.smoothedCursor = null
      return null
    }
    if (!smooth || !this.smoothedCursor) {
      this.smoothedCursor = { x: target.x, y: target.y }
      this.lastCursorT = performance.now()
      return this.smoothedCursor
    }
    let dt: number
    if (dtOverride != null) {
      dt = dtOverride
    } else {
      const now = performance.now()
      dt = Math.min(0.1, Math.max(0, (now - this.lastCursorT) / 1000))
      this.lastCursorT = now
    }
    const tau = 0.03 + amount * 0.17 // 0.03s (snappy) .. 0.2s (very smooth)
    const a = 1 - Math.exp(-dt / tau)
    this.smoothedCursor = {
      x: this.smoothedCursor.x + (target.x - this.smoothedCursor.x) * a,
      y: this.smoothedCursor.y + (target.y - this.smoothedCursor.y) * a
    }
    return this.smoothedCursor
  }

  render(project: ProjectState, sourceTime: number, smooth = false, dtOverride?: number): void {
    const { w: outW, h: outH } = this.outputSize(project)
    if (this.canvas.width !== outW) this.canvas.width = outW
    if (this.canvas.height !== outH) this.canvas.height = outH
    if (this.scene.width !== outW) this.scene.width = outW
    if (this.scene.height !== outH) this.scene.height = outH

    const rect = this.windowRect(project, outW, outH)
    this.drawScene(project, outW, outH, rect, sourceTime, smooth, dtOverride)

    // Camera: crop a region of the whole scene around the focus and scale it up.
    const cam = this.smoothCamera(cameraAt(project.camera, sourceTime), smooth, dtOverride)
    const focusX = rect.fx + cam.x * rect.fw
    const focusY = rect.fy + cam.y * rect.fh
    const cropW = outW / cam.scale
    const cropH = outH / cam.scale
    const cropX = clamp(focusX - cropW / 2, 0, outW - cropW)
    const cropY = clamp(focusY - cropH / 2, 0, outH - cropH)

    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.scene, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

    // The webcam bubble sits in output space (fixed) so it does NOT move or
    // scale with the zoom — exactly like Screen Studio's camera overlay.
    this.drawWebcam(project, outW, outH)
  }

  /** Draw the webcam overlay bubble at its configured position/size/style. */
  private drawWebcam(project: ProjectState, outW: number, outH: number): void {
    const wc = project.webcam
    const cam = this.camVideo
    if (!wc?.enabled || !cam || cam.readyState < 2 || !cam.videoWidth) return

    const ctx = this.ctx
    const vw = cam.videoWidth
    const vh = cam.videoHeight
    const aspect = vw / vh
    const bh = clamp(wc.size, 0.05, 0.9) * outH
    const bw = wc.shape === 'circle' ? bh : bh * aspect
    const x = clamp(wc.x, 0, 1) * outW - bw / 2
    const y = clamp(wc.y, 0, 1) * outH - bh / 2
    const radius =
      wc.shape === 'circle'
        ? Math.min(bw, bh) / 2
        : wc.shape === 'rounded'
          ? Math.min(wc.cornerRadius, Math.min(bw, bh) / 2)
          : 0

    // Drop shadow behind the bubble.
    if (wc.shadow > 0) {
      ctx.save()
      ctx.shadowColor = `rgba(0,0,0,${wc.shadow})`
      ctx.shadowBlur = bh * 0.14
      ctx.shadowOffsetY = bh * 0.05
      ctx.fillStyle = '#000'
      this.roundRectPath(ctx, x, y, bw, bh, radius)
      ctx.fill()
      ctx.restore()
    }

    // Clip to the bubble, then draw the webcam frame object-fit:cover.
    ctx.save()
    this.roundRectPath(ctx, x, y, bw, bh, radius)
    ctx.clip()
    if (wc.mirror) {
      ctx.translate(x + bw, y)
      ctx.scale(-1, 1)
      ctx.translate(-x, -y)
    }
    const scale = Math.max(bw / vw, bh / vh)
    const dw = vw * scale
    const dh = vh * scale
    ctx.drawImage(cam, x + (bw - dw) / 2, y + (bh - dh) / 2, dw, dh)
    ctx.restore()

    // Border.
    if (wc.borderWidth > 0) {
      ctx.save()
      ctx.lineWidth = wc.borderWidth
      ctx.strokeStyle = wc.borderColor
      this.roundRectPath(ctx, x, y, bw, bh, radius)
      ctx.stroke()
      ctx.restore()
    }
  }

  /** Draw the full 1× composition (background + framed window + cursor) into the
   * scene. The cursor lives in the scene so it scales with the zoom and sits
   * exactly over the captured (real) cursor, hiding it. */
  private drawScene(
    project: ProjectState,
    outW: number,
    outH: number,
    rect: WindowRect,
    sourceTime: number,
    smooth: boolean,
    dtOverride?: number
  ): void {
    const ctx = this.sctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.drawBackground(ctx, project.background, outW, outH)

    const { fx, fy, fw, fh } = rect
    const f = project.frame
    const radius = Math.min(f.cornerRadius, Math.min(fw, fh) / 2)

    if (f.shadow > 0) {
      ctx.save()
      ctx.shadowColor = `rgba(0,0,0,${f.shadow})`
      ctx.shadowBlur = f.shadowBlur
      ctx.shadowOffsetY = f.shadowBlur * 0.35
      ctx.fillStyle = '#000'
      this.roundRectPath(ctx, fx, fy, fw, fh, radius)
      ctx.fill()
      ctx.restore()
    }

    ctx.save()
    this.roundRectPath(ctx, fx, fy, fw, fh, radius)
    ctx.clip()
    if (this.video.readyState >= 2) {
      ctx.drawImage(this.video, fx, fy, fw, fh)
    } else {
      ctx.fillStyle = '#111318'
      ctx.fillRect(fx, fy, fw, fh)
    }
    ctx.restore()

    if (f.borderWidth > 0) {
      ctx.save()
      ctx.lineWidth = f.borderWidth
      ctx.strokeStyle = f.borderColor
      this.roundRectPath(ctx, fx, fy, fw, fh, radius)
      ctx.stroke()
      ctx.restore()
    }

    // Synthetic cursor — drawn into the scene (NOT clipped to the window) so it
    // can travel over the background when the real cursor was outside the
    // captured window, scales with the zoom, and covers the captured cursor.
    if (project.cursor?.show && project.recording.cursor.length > 0) {
      const raw = cursorAt(project.recording.cursor, sourceTime * 1000, project.cursor.smoothing * 80)
      const c = this.smoothCursor(raw, project.cursor.smoothing, smooth, dtOverride)
      if (c) {
        // Size in source-video pixels so it matches the real cursor's apparent
        // size (covering it in the fallback path) and looks natural at any zoom.
        const px = project.cursor.size * (fw / project.recording.width)
        const sx = fx + c.x * fw
        const sy = fy + c.y * fh
        if (sx >= -px && sx <= outW + px && sy >= -px && sy <= outH + px) {
          this.drawCursor(ctx, sx, sy, px)
        }
      }
    }
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    bg: BackgroundSettings,
    w: number,
    h: number
  ): void {
    ctx.filter = 'none'
    if (bg.kind === 'none') {
      ctx.fillStyle = '#0c0d12'
      ctx.fillRect(0, 0, w, h)
      return
    }
    if (bg.kind === 'solid') {
      ctx.fillStyle = bg.colors[0] ?? '#0d1117'
      ctx.fillRect(0, 0, w, h)
      return
    }
    if (bg.kind === 'gradient') {
      const a = (bg.angle * Math.PI) / 180
      const cx = w / 2
      const cy = h / 2
      const half = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2
      const dx = Math.cos(a) * half
      const dy = Math.sin(a) * half
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
      const stops = bg.colors.length >= 2 ? bg.colors : [bg.colors[0] ?? '#222', '#000']
      stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c))
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      return
    }
    // image / wallpaper
    ctx.fillStyle = '#0c0d12'
    ctx.fillRect(0, 0, w, h)
    const img = bg.image ? this.imgCache.get(bg.image) : null
    if (img && img.complete && img.naturalWidth) {
      if (bg.blur > 0) ctx.filter = `blur(${bg.blur}px)`
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
      const iw = img.naturalWidth * scale
      const ih = img.naturalHeight * scale
      ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih)
      ctx.filter = 'none'
    } else if (bg.image) {
      this.loadImage(bg.image).catch(() => {})
    }
  }

  /**
   * macOS-style arrow pointer: black fill with a white outline, hotspot (tip) at
   * (x, y). Authored on a 24px-tall grid and scaled to `size`.
   */
  private drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const s = size / 24
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 19.2)
    ctx.lineTo(4.6, 15)
    ctx.lineTo(7.5, 21.6)
    ctx.lineTo(10.4, 20.3)
    ctx.lineTo(7.5, 13.9)
    ctx.lineTo(13.6, 13.4)
    ctx.closePath()
    // soft contact shadow for depth
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 0.5
    ctx.shadowOffsetY = 1.5
    // white outline
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.shadowColor = 'transparent'
    // black body on top, leaving the outer half of the stroke as the white outline
    ctx.fillStyle = '#0a0a0a'
    ctx.fill()
    ctx.restore()
  }

  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
  }
}
