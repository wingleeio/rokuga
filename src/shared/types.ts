// Shared types between main, preload and renderer.

export interface CaptureSource {
  id: string
  name: string
  thumbnail: string // dataURL
  appIcon: string | null // dataURL
  display_id: string
  type: 'screen' | 'window'
}

/** A single cursor sample captured during recording. */
export interface CursorSample {
  /** ms since recording start */
  t: number
  /** normalized 0..1 position relative to the captured source bounds */
  x: number
  y: number
  /** true on the frame a mouse button went down (best-effort) */
  down?: boolean
}

export interface RecordingMeta {
  width: number
  height: number
  /** duration in seconds (filled after recording) */
  duration: number
  fps: number
  /** absolute path to the raw recorded media on disk (webm) */
  mediaPath: string
  cursor: CursorSample[]
  createdAt: number
  sourceName: string
  /** absolute path to the webcam/mic media on disk (webm), if any was captured */
  cameraPath?: string
  /** the camera/mic track has a webcam video stream */
  hasCamera?: boolean
  /** the camera/mic track has a microphone audio stream */
  hasAudio?: boolean
  /** webcam native pixel dimensions (for the overlay's aspect/cover crop) */
  cameraWidth?: number
  cameraHeight?: number
}

export type BackgroundKind = 'gradient' | 'solid' | 'image' | 'wallpaper' | 'none'

export interface BackgroundSettings {
  kind: BackgroundKind
  /** for gradient: two or more stops; for solid: single color */
  colors: string[]
  angle: number // gradient angle in degrees
  /** for image/wallpaper: dataURL or preset id */
  image: string | null
  /** background blur amount in px (applied to image bg) */
  blur: number
}

export interface FrameStyle {
  /** padding as a fraction of the smaller canvas dimension (0..0.4) */
  padding: number
  cornerRadius: number // px on the source video
  shadow: number // 0..1 strength
  shadowBlur: number // px
  /** scale of the inset content (0.3..1) */
  scale: number
  borderWidth: number
  borderColor: string
}

export interface ZoomKeyframe {
  id: string
  /** time in seconds */
  t: number
  /** target center, normalized 0..1 in source space */
  x: number
  y: number
  /** zoom factor, 1 = no zoom */
  scale: number
  /** seconds to ease into this zoom */
  transition: number
}

export interface CameraSettings {
  /** master toggle — when false, no zoom is ever applied */
  enabled: boolean
  /** auto-generate zoom from cursor activity */
  auto: boolean
  /** how aggressively auto-zoom reacts (1 = default) */
  autoIntensity: number
  /** default zoom factor for auto keyframes */
  autoScale: number
  /** smoothing of camera motion, seconds */
  smoothing: number
  keyframes: ZoomKeyframe[]
}

export interface CursorSettings {
  /** draw a synthetic cursor from the tracked path instead of the captured one */
  show: boolean
  /** pointer size in px, relative to a 1920px-wide canvas */
  size: number
  /** motion smoothing, 0 (raw) .. 1 (very smooth) */
  smoothing: number
}

export type WebcamShape = 'circle' | 'rounded' | 'square'

export interface WebcamSettings {
  /** render the webcam bubble overlay */
  enabled: boolean
  /** bubble center, normalized 0..1 in output (canvas) space */
  x: number
  y: number
  /** bubble size as a fraction of the canvas height */
  size: number
  shape: WebcamShape
  /** corner radius (px) when shape is 'rounded' */
  cornerRadius: number
  borderWidth: number
  borderColor: string
  /** drop-shadow strength, 0..1 */
  shadow: number
  /** mirror horizontally (natural selfie view) */
  mirror: boolean
}

export interface AudioSettings {
  /** include the recorded microphone audio in playback + export */
  enabled: boolean
  /** linear gain, 0..1.5 */
  volume: number
}

/** A kept segment of the timeline after cuts. Times in seconds, source-relative. */
export interface ClipSegment {
  id: string
  start: number
  end: number
}

export interface TimelineSettings {
  /** segments that are kept (cuts remove ranges between them) */
  segments: ClipSegment[]
  /** playback speed multiplier applied to the whole project */
  speed: number
}

export type AspectPreset = 'source' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4'

export interface CanvasSettings {
  aspect: AspectPreset
  /** output resolution height; width derived from aspect */
  outputHeight: number
}

export interface ProjectState {
  version: 1
  name: string
  recording: RecordingMeta
  background: BackgroundSettings
  frame: FrameStyle
  camera: CameraSettings
  timeline: TimelineSettings
  canvas: CanvasSettings
  cursor: CursorSettings
  webcam: WebcamSettings
  audio: AudioSettings
}

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'mov'

export interface ExportOptions {
  format: ExportFormat
  /** target height in px */
  height: number
  fps: number
  /** 0..100 quality hint */
  quality: number
}

export interface ExportProgress {
  stage: 'composite' | 'encode' | 'done' | 'error'
  /** 0..1 */
  progress: number
  message?: string
  outputPath?: string
}

// ---- IPC channel payloads ----

export interface SaveRecordingArgs {
  /** raw webm bytes */
  buffer: ArrayBuffer
  cursor: CursorSample[]
  width: number
  height: number
  fps: number
  duration: number
  sourceName: string
  /** webcam/mic media bytes (webm), if captured */
  camera?: ArrayBuffer | null
  hasCamera?: boolean
  hasAudio?: boolean
  cameraWidth?: number
  cameraHeight?: number
}

/** Audio mux instructions passed to the exporter alongside the frame stream. */
export interface ExportAudio {
  /** absolute path to the source media holding the mic audio */
  path: string
  /** kept source-time segments (post-cut), in seconds */
  segments: { start: number; end: number }[]
  /** global playback speed multiplier */
  speed: number
  /** linear gain 0..1.5 */
  volume: number
}

export interface DefaultProjectArgs {
  recording: RecordingMeta
}
