import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectState, RecordingMeta } from '@shared/types'
import { EditorContext, type EditorContextValue } from './context'
import { createDefaultProject, normalizeProject } from './lib/project'
import { generateAutoZoom } from './lib/camera'
import RecordView from './components/RecordView'
import EditView from './components/EditView'

export interface RecordedClip {
  blob: Blob
  width: number
  height: number
  duration: number
  fps: number
  cursor: RecordingMeta['cursor']
  sourceName: string
}

export default function App(): JSX.Element {
  const [project, setProjectState] = useState<ProjectState | null>(null)
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null)
  const [mediaURL, setMediaURL] = useState<string>('')
  const [projectPath, setProjectPath] = useState<string | undefined>(undefined)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [selectedZoom, setSelectedZoom] = useState<string | null>(null)
  const urlRef = useRef<string>('')

  const setMedia = useCallback((blob: Blob) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    setMediaBlob(blob)
    setMediaURL(url)
  }, [])

  useEffect(() => () => void (urlRef.current && URL.revokeObjectURL(urlRef.current)), [])

  const onRecorded = useCallback(
    async (clip: RecordedClip) => {
      setBusy('Saving recording…')
      try {
        const buffer = await clip.blob.arrayBuffer()
        const meta = await window.rokuga.saveRecording({
          buffer,
          cursor: clip.cursor,
          width: clip.width,
          height: clip.height,
          fps: clip.fps,
          duration: clip.duration,
          sourceName: clip.sourceName
        })
        const proj = createDefaultProject(meta)
        if (proj.camera.auto && meta.cursor.length > 3) {
          proj.camera.keyframes = generateAutoZoom(meta.cursor, meta.duration, proj.camera)
        }
        setMedia(clip.blob)
        setProjectState(proj)
        setProjectPath(undefined)
        setPlayhead(0)
        setPlaying(false)
      } finally {
        setBusy(null)
      }
    },
    [setMedia]
  )

  const openProject = useCallback(async () => {
    setBusy('Opening…')
    try {
      const res = await window.rokuga.openProject()
      if (!res) return
      const blob = new Blob([res.media as BlobPart], { type: 'video/webm' })
      setMedia(blob)
      setProjectState(normalizeProject(res.state))
      setProjectPath(res.path)
      setPlayhead(0)
      setPlaying(false)
    } finally {
      setBusy(null)
    }
  }, [setMedia])

  const saveProject = useCallback(
    async (saveAs = false) => {
      if (!project) return
      setBusy('Saving…')
      try {
        const path = await window.rokuga.saveProject(project, saveAs ? undefined : projectPath)
        if (path) setProjectPath(path)
      } finally {
        setBusy(null)
      }
    },
    [project, projectPath]
  )

  const newRecording = useCallback(() => {
    setProjectState(null)
    setMediaBlob(null)
    setProjectPath(undefined)
    setPlaying(false)
    setPlayhead(0)
  }, [])

  const ctx = useMemo<EditorContextValue | null>(() => {
    if (!project) return null
    const update = (updater: (p: ProjectState) => ProjectState): void =>
      setProjectState((prev) => (prev ? updater(prev) : prev))
    return {
      project,
      mediaURL,
      playhead,
      setPlayhead,
      playing,
      setPlaying,
      loop,
      setLoop,
      setProject: update,
      setName: (name) => update((p) => ({ ...p, name })),
      setBackground: (patch) => update((p) => ({ ...p, background: { ...p.background, ...patch } })),
      setFrame: (patch) => update((p) => ({ ...p, frame: { ...p.frame, ...patch } })),
      setCamera: (patch) => update((p) => ({ ...p, camera: { ...p.camera, ...patch } })),
      setTimeline: (patch) => update((p) => ({ ...p, timeline: { ...p.timeline, ...patch } })),
      setCanvas: (patch) => update((p) => ({ ...p, canvas: { ...p.canvas, ...patch } })),
      setCursor: (patch) => update((p) => ({ ...p, cursor: { ...p.cursor, ...patch } })),
      regenerateAutoZoom: () =>
        update((p) => ({
          ...p,
          camera: {
            ...p.camera,
            keyframes: generateAutoZoom(p.recording.cursor, p.recording.duration, p.camera)
          }
        })),
      selectedZoom,
      setSelectedZoom,
      addKeyframe: (kf) =>
        update((p) => ({
          ...p,
          camera: {
            ...p.camera,
            keyframes: [...p.camera.keyframes, kf].sort((a, b) => a.t - b.t)
          }
        })),
      updateKeyframe: (id, patch) =>
        update((p) => ({
          ...p,
          camera: {
            ...p.camera,
            keyframes: p.camera.keyframes
              .map((k) => (k.id === id ? { ...k, ...patch } : k))
              .sort((a, b) => a.t - b.t)
          }
        })),
      removeKeyframe: (id) =>
        update((p) => ({
          ...p,
          camera: { ...p.camera, keyframes: p.camera.keyframes.filter((k) => k.id !== id) }
        }))
    }
  }, [project, mediaURL, playhead, playing, loop, selectedZoom])

  if (!project || !ctx || !mediaBlob) {
    return <RecordView onRecorded={onRecorded} onOpen={openProject} busy={busy} />
  }

  return (
    <EditorContext.Provider value={ctx}>
      <EditView
        mediaBlob={mediaBlob}
        projectPath={projectPath}
        busy={busy}
        onSave={() => saveProject(false)}
        onSaveAs={() => saveProject(true)}
        onOpen={openProject}
        onNewRecording={newRecording}
        setBusy={setBusy}
      />
    </EditorContext.Provider>
  )
}
