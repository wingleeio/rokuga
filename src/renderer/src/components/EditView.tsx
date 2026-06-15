import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../context'
import { clamp, keptDuration } from '../lib/project'
import { cn } from '../lib/cn'
import { Button } from './ui/button'
import Preview from './Preview'
import Timeline from './Timeline'
import Inspector from './Inspector'
import ExportPanel from './ExportPanel'

interface Props {
  mediaBlob: Blob
  projectPath?: string
  busy: string | null
  onSave: () => void
  onSaveAs: () => void
  onOpen: () => void
  onNewRecording: () => void
  setBusy: (s: string | null) => void
}

export default function EditView({
  mediaBlob,
  projectPath,
  busy,
  onSave,
  onSaveAs,
  onOpen,
  onNewRecording
}: Props): JSX.Element {
  const { project, mediaURL, setName, playhead, setPlayhead, playing, setPlaying, loop, setLoop } =
    useEditor()
  const [showExport, setShowExport] = useState(false)

  // Keep latest values for the (stable) keyboard handler.
  const kb = useRef({ project, playhead, playing, loop })
  kb.current = { project, playhead, playing, loop }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (meta) {
        if (key === 's') {
          e.preventDefault()
          e.shiftKey ? onSaveAs() : onSave()
        } else if (key === 'e') {
          e.preventDefault()
          setShowExport(true)
        } else if (key === 'o') {
          e.preventDefault()
          onOpen()
        }
        return
      }
      const { project: p, playhead: ph, playing: pl, loop: lp } = kb.current
      const total = keptDuration(p.timeline)
      const frame = 1 / Math.max(1, p.recording.fps || 30)
      const step = e.shiftKey ? frame : 1
      switch (e.key) {
        case ' ':
          e.preventDefault()
          setPlaying(!pl)
          break
        case 'ArrowLeft':
          e.preventDefault()
          setPlayhead(clamp(ph - step, 0, total))
          break
        case 'ArrowRight':
          e.preventDefault()
          setPlayhead(clamp(ph + step, 0, total))
          break
        case 'Home':
          e.preventDefault()
          setPlayhead(0)
          break
        case 'End':
          e.preventDefault()
          setPlayhead(total)
          break
        case 'l':
          if (!e.shiftKey) {
            e.preventDefault()
            setLoop(!lp)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave, onSaveAs, onOpen, setPlaying, setPlayhead, setLoop])

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] flex-none items-center justify-between border-b border-border bg-card/30 pl-[84px] pr-3.5">
        <div className="no-drag flex items-center gap-2">
          <input
            className="field-content min-w-14 max-w-[320px] rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-medium outline-none hover:bg-secondary/50 focus:border-ring focus:bg-secondary/50"
            value={project.name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
          />
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              projectPath ? 'bg-emerald-500/12 text-emerald-400' : 'bg-secondary text-muted-foreground'
            )}
          >
            {projectPath ? 'Saved' : 'Unsaved'}
          </span>
        </div>
        <div className="no-drag flex items-center gap-1">
          {busy && <span className="mr-1 text-xs text-muted-foreground">{busy}</span>}
          <Button variant="ghost" size="sm" onClick={onNewRecording}>
            New
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpen}>
            Open
          </Button>
          <Button variant="ghost" size="sm" onClick={onSave}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onSaveAs}>
            Save As
          </Button>
          <Button size="sm" onClick={() => setShowExport(true)}>
            Export
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <Preview mediaURL={mediaURL} />
          <Timeline />
        </div>
        <Inspector />
      </div>

      {showExport && <ExportPanel mediaBlob={mediaBlob} onClose={() => setShowExport(false)} />}
    </div>
  )
}
