import { createContext, useContext } from 'react'
import type {
  BackgroundSettings,
  CameraSettings,
  CanvasSettings,
  CursorSettings,
  FrameStyle,
  ProjectState,
  TimelineSettings,
  ZoomKeyframe
} from '@shared/types'

export interface EditorContextValue {
  project: ProjectState
  mediaURL: string
  /** current playhead in timeline-time seconds */
  playhead: number
  setPlayhead: (t: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  loop: boolean
  setLoop: (l: boolean) => void

  setName: (name: string) => void
  setBackground: (patch: Partial<BackgroundSettings>) => void
  setFrame: (patch: Partial<FrameStyle>) => void
  setCamera: (patch: Partial<CameraSettings>) => void
  setTimeline: (patch: Partial<TimelineSettings>) => void
  setCanvas: (patch: Partial<CanvasSettings>) => void
  setCursor: (patch: Partial<CursorSettings>) => void
  setProject: (updater: (prev: ProjectState) => ProjectState) => void

  regenerateAutoZoom: () => void

  /** currently selected zoom keyframe id (for editing on the timeline/inspector) */
  selectedZoom: string | null
  setSelectedZoom: (id: string | null) => void
  addKeyframe: (kf: ZoomKeyframe) => void
  updateKeyframe: (id: string, patch: Partial<ZoomKeyframe>) => void
  removeKeyframe: (id: string) => void
}

export const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within EditorContext')
  return ctx
}
