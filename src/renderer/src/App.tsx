import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ProjectState, RecordingMeta } from '@shared/types'
import { EditorContext, type EditorContextValue } from './context'
import { createDefaultProject, normalizeProject } from './lib/project'
import { generateAutoZoom } from './lib/camera'
import RecordView from './components/RecordView'
import EditView from './components/EditView'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'

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
  const [dirty, setDirty] = useState(false)
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
        setDirty(false)
        setPlayhead(0)
        setPlaying(false)
      } catch (e) {
        toast.error('Could not save the recording', { description: String(e) })
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
      setDirty(false)
      setPlayhead(0)
      setPlaying(false)
    } catch (e) {
      toast.error('Could not open project', { description: String(e) })
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
        if (path) {
          setProjectPath(path)
          setDirty(false)
          toast.success('Project saved', {
            description: path.split('/').pop(),
            action: { label: 'Show', onClick: () => window.rokuga.reveal(path) }
          })
        }
      } catch (e) {
        toast.error('Could not save project', { description: String(e) })
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
    const update = (updater: (p: ProjectState) => ProjectState): void => {
      setProjectState((prev) => (prev ? updater(prev) : prev))
      setDirty(true)
    }
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

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={300}>
      {!project || !ctx || !mediaBlob ? (
        <RecordView onRecorded={onRecorded} onOpen={openProject} busy={busy} />
      ) : (
        <EditorContext.Provider value={ctx}>
          <EditView
            mediaBlob={mediaBlob}
            projectPath={projectPath}
            dirty={dirty}
            busy={busy}
            onSave={() => saveProject(false)}
            onSaveAs={() => saveProject(true)}
            onOpen={openProject}
            onNewRecording={newRecording}
            setBusy={setBusy}
          />
        </EditorContext.Provider>
      )}
      <Toaster />
    </TooltipProvider>
  )
}
