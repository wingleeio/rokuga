import type { CameraSettings, CursorSample, ZoomKeyframe } from '@shared/types'
import { uid } from './project'

export interface CameraPose {
  scale: number
  x: number
  y: number
}

const BASE: CameraPose = { scale: 1, x: 0.5, y: 0.5 }

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
}

interface PoseState extends CameraPose {
  t: number
  transition: number
}

/**
 * Evaluate the camera pose at a given source time. Keyframes are treated as
 * targets that the camera "holds" until `transition` seconds before the next
 * keyframe, then smoothly eases into — giving the hold-then-zoom feel.
 */
export function cameraAt(camera: CameraSettings, t: number): CameraPose {
  if (!camera.enabled) return BASE

  const states: PoseState[] = camera.keyframes
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((k) => ({ t: k.t, scale: k.scale, x: k.x, y: k.y, transition: k.transition }))

  if (states.length === 0) return BASE
  if (states[0].t > 0) states.unshift({ ...BASE, t: 0, transition: states[0].transition })

  if (t <= states[0].t) return pose(states[0])

  let i = 0
  while (i < states.length - 1 && states[i + 1].t <= t) i++
  const a = states[i]
  const b = states[i + 1]
  if (!b) return pose(a)

  const gap = b.t - a.t
  const trans = Math.min(Math.max(0.05, b.transition), gap || b.transition)
  const moveStart = b.t - trans
  if (t <= moveStart) return pose(a)
  const p = easeInOut((t - moveStart) / (b.t - moveStart))
  return {
    scale: a.scale + (b.scale - a.scale) * p,
    x: a.x + (b.x - a.x) * p,
    y: a.y + (b.y - a.y) * p
  }
}

function pose(s: PoseState): CameraPose {
  return { scale: s.scale, x: s.x, y: s.y }
}

/** Interpolate the cursor position (normalized 0..1) at a given time in ms,
 * averaging nearby samples for smoothing. */
export function cursorAt(
  cursor: CursorSample[],
  ms: number,
  windowMs = 0
): { x: number; y: number } | null {
  if (cursor.length === 0) return null
  if (ms <= cursor[0].t) return { x: cursor[0].x, y: cursor[0].y }
  const last = cursor[cursor.length - 1]
  if (ms >= last.t) return { x: last.x, y: last.y }

  if (windowMs > 0) {
    let wx = 0
    let wy = 0
    let wsum = 0
    for (const c of cursor) {
      const d = Math.abs(c.t - ms)
      if (d > windowMs) continue
      const w = 1 - d / windowMs
      wx += c.x * w
      wy += c.y * w
      wsum += w
    }
    if (wsum > 0) return { x: wx / wsum, y: wy / wsum }
  }

  // linear interpolation between the surrounding samples
  let i = 1
  while (i < cursor.length && cursor[i].t < ms) i++
  const a = cursor[i - 1]
  const b = cursor[i]
  const p = (ms - a.t) / Math.max(1, b.t - a.t)
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p }
}

/**
 * Generate auto-zoom keyframes from the cursor path: zoom IN while the cursor is
 * active (moving), following the area of activity, and zoom OUT to full frame
 * after a sustained period of inactivity.
 */
export function generateAutoZoom(
  cursor: CursorSample[],
  duration: number,
  settings: Pick<CameraSettings, 'autoIntensity' | 'autoScale' | 'smoothing'>
): ZoomKeyframe[] {
  if (cursor.length < 4) return []

  const intensity = Math.max(0.25, settings.autoIntensity)
  const moveThresh = 0.05 / intensity // speed (norm units/s) that counts as active
  const idleThresh = 0.012 * intensity // below this is "idle"
  const activateTime = 0.3 // s of activity before zooming in
  const idleTimeout = 1.4 // s of inactivity before zooming out
  const followDist = 0.16 // re-center if the cursor wanders this far (normalized)
  const followGap = 0.9 // min seconds between follow keyframes
  const trans = Math.max(0.3, settings.smoothing)

  const keyframes: ZoomKeyframe[] = []
  let ema = 0
  let zoomed = false
  let movingFor = 0
  let idleFor = 0
  let focusX = 0.5
  let focusY = 0.5
  let lastKeyT = -Infinity

  for (let i = 1; i < cursor.length; i++) {
    const prev = cursor[i - 1]
    const cur = cursor[i]
    const dt = Math.max(0.001, (cur.t - prev.t) / 1000)
    const speed = Math.hypot(cur.x - prev.x, cur.y - prev.y) / dt
    ema = ema * 0.85 + speed * 0.15
    const tSec = cur.t / 1000

    if (ema > moveThresh) {
      idleFor = 0
      movingFor += dt
      const fx = Math.min(1, Math.max(0, cur.x))
      const fy = Math.min(1, Math.max(0, cur.y))
      if (!zoomed && movingFor >= activateTime) {
        keyframes.push({
          id: uid(),
          t: Math.max(0, tSec - activateTime),
          x: fx,
          y: fy,
          scale: settings.autoScale,
          transition: trans
        })
        zoomed = true
        focusX = fx
        focusY = fy
        lastKeyT = tSec
      } else if (zoomed) {
        const moved = Math.hypot(fx - focusX, fy - focusY)
        if (moved > followDist && tSec - lastKeyT > followGap) {
          keyframes.push({
            id: uid(),
            t: tSec,
            x: fx,
            y: fy,
            scale: settings.autoScale,
            transition: Math.max(0.4, trans)
          })
          focusX = fx
          focusY = fy
          lastKeyT = tSec
        }
      }
    } else if (ema < idleThresh) {
      movingFor = 0
      idleFor += dt
      if (zoomed && idleFor >= idleTimeout) {
        keyframes.push({ id: uid(), t: tSec, x: 0.5, y: 0.5, scale: 1, transition: trans })
        zoomed = false
        lastKeyT = tSec
      }
    } else {
      movingFor = Math.max(0, movingFor - dt * 0.5)
    }
  }

  if (zoomed) {
    keyframes.push({
      id: uid(),
      t: Math.max(0, duration - 0.2),
      x: 0.5,
      y: 0.5,
      scale: 1,
      transition: trans
    })
  }

  return keyframes
}
