import { useState } from 'react'
import type { ExportFormat, ExportOptions } from '@shared/types'
import { useEditor } from '../context'
import { exportProject } from '../lib/export'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Button } from './ui/button'
import { Field, SliderRow } from './controls'

interface Props {
  mediaBlob: Blob
  onClose: () => void
}

export default function ExportPanel({ mediaBlob, onClose }: Props): JSX.Element {
  const { project } = useEditor()
  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [height, setHeight] = useState(project.canvas.outputHeight)
  const [fps, setFps] = useState(Math.min(60, project.recording.fps || 30))
  const [quality, setQuality] = useState(80)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<string>('')
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    setRunning(true)
    setError(null)
    setSavedPath(null)
    setProgress(0)
    setStatus(`Rendering ${format.toUpperCase()}…`)
    const options: ExportOptions = { format, height, fps, quality }
    try {
      const path = await exportProject(project, mediaBlob, options, (r) => setProgress(r))
      if (path) {
        setSavedPath(path)
        setStatus('Done')
        setProgress(1)
      } else {
        setStatus('Cancelled')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
        </DialogHeader>

        <Field label="Format">
          <ToggleGroup type="single" value={format} onValueChange={(v) => v && setFormat(v as ExportFormat)}>
            <ToggleGroupItem value="mp4">MP4</ToggleGroupItem>
            <ToggleGroupItem value="webm">WebM</ToggleGroupItem>
            <ToggleGroupItem value="mov">MOV</ToggleGroupItem>
            <ToggleGroupItem value="gif">GIF</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field label="Resolution">
          <ToggleGroup
            type="single"
            value={String(height)}
            onValueChange={(v) => v && setHeight(parseInt(v, 10))}
          >
            <ToggleGroupItem value="720">720p</ToggleGroupItem>
            <ToggleGroupItem value="1080">1080p</ToggleGroupItem>
            <ToggleGroupItem value="1440">1440p</ToggleGroupItem>
            <ToggleGroupItem value="2160">4K</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <SliderRow label="Frame rate" min={10} max={60} value={fps} onChange={setFps} format={(v) => `${v} fps`} />
        {format !== 'gif' && (
          <SliderRow label="Quality" min={20} max={100} value={quality} onChange={setQuality} format={(v) => `${v}%`} />
        )}

        {(running || progress > 0) && (
          <div className="flex flex-col gap-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-foreground transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {status} {Math.round(progress * 100)}%
            </span>
          </div>
        )}

        {savedPath && (
          <div className="break-all rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-[13px] text-emerald-300">
            Saved to {savedPath}
          </div>
        )}
        {error && (
          <div className="break-all rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-red-300">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            {savedPath ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={run} disabled={running}>
            {running ? 'Exporting…' : 'Export video'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
