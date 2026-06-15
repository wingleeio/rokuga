import type {
  CameraSettings,
  CanvasSettings,
  CursorSettings,
  FrameStyle,
  ProjectState,
  RecordingMeta,
  TimelineSettings
} from '@shared/types'
import { DEFAULT_BACKGROUND } from './presets'

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const DEFAULT_FRAME: FrameStyle = {
  padding: 0.08,
  cornerRadius: 16,
  shadow: 0.45,
  shadowBlur: 60,
  scale: 1,
  borderWidth: 0,
  borderColor: '#ffffff'
}

export const DEFAULT_CAMERA: CameraSettings = {
  enabled: true,
  auto: true,
  autoIntensity: 1,
  autoScale: 1.8,
  smoothing: 0.5,
  keyframes: []
}

export const DEFAULT_CANVAS: CanvasSettings = {
  aspect: 'source',
  outputHeight: 1080
}

export const DEFAULT_CURSOR: CursorSettings = {
  show: true,
  size: 46,
  smoothing: 0.35
}

export function createDefaultProject(recording: RecordingMeta): ProjectState {
  const timeline: TimelineSettings = {
    segments: [{ id: uid(), start: 0, end: recording.duration }],
    speed: 1
  }
  return {
    version: 1,
    name: 'Untitled',
    recording,
    background: { ...DEFAULT_BACKGROUND },
    frame: { ...DEFAULT_FRAME },
    camera: { ...DEFAULT_CAMERA, keyframes: [] },
    timeline,
    canvas: { ...DEFAULT_CANVAS },
    cursor: { ...DEFAULT_CURSOR }
  }
}

/** Backfill settings that may be missing from older/saved projects. */
export function normalizeProject(state: ProjectState): ProjectState {
  return {
    ...state,
    cursor: { ...DEFAULT_CURSOR, ...(state.cursor ?? {}) },
    camera: { ...DEFAULT_CAMERA, ...state.camera, keyframes: state.camera?.keyframes ?? [] }
  }
}

/** Total kept (post-cut) duration in seconds. */
export function keptDuration(timeline: TimelineSettings): number {
  return timeline.segments.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0)
}

/** Map a position on the edited timeline to a time in the source recording. */
export function timelineToSource(timeline: TimelineSettings, tl: number): number {
  let acc = 0
  for (const s of timeline.segments) {
    const len = Math.max(0, s.end - s.start)
    if (tl <= acc + len) return s.start + (tl - acc)
    acc += len
  }
  const last = timeline.segments[timeline.segments.length - 1]
  return last ? last.end : 0
}

/** Map a source time to its position on the edited timeline (or null if cut out). */
export function sourceToTimeline(timeline: TimelineSettings, src: number): number | null {
  let acc = 0
  for (const s of timeline.segments) {
    const len = Math.max(0, s.end - s.start)
    if (src >= s.start && src <= s.end) return acc + (src - s.start)
    acc += len
  }
  return null
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
