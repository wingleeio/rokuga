import { useCallback, useRef, useState } from 'react'
import { Scissors, Trash2, Plus } from 'lucide-react'
import type { ClipSegment } from '@shared/types'
import { useEditor } from '../context'
import { sourceToTimeline, timelineToSource, uid } from '../lib/project'
import { Button } from './ui/button'
import { cn } from '../lib/cn'

export default function Timeline(): JSX.Element {
  const {
    project,
    setTimeline,
    setCamera,
    playhead,
    setPlayhead,
    setPlaying,
    selectedZoom,
    setSelectedZoom,
    addKeyframe,
    removeKeyframe
  } = useEditor()
  const dur = Math.max(0.001, project.recording.duration)
  const trackRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(
    project.timeline.segments[0]?.id ?? null
  )
  const drag = useRef<{ id: string; edge: 'start' | 'end' } | null>(null)

  const pct = (t: number): number => (t / dur) * 100
  const timeAt = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return 0
      const r = (clientX - rect.left) / rect.width
      return Math.min(dur, Math.max(0, r * dur))
    },
    [dur]
  )

  const playheadSrc = timelineToSource(project.timeline, playhead)

  const seekToSource = useCallback(
    (ts: number) => {
      const tl = sourceToTimeline(project.timeline, ts)
      if (tl != null) {
        setPlayhead(tl)
        return
      }
      // Inside a cut: jump to nearest kept boundary.
      let best = 0
      let bestDist = Infinity
      let acc = 0
      for (const s of project.timeline.segments) {
        for (const edge of [s.start, s.end]) {
          const d = Math.abs(edge - ts)
          if (d < bestDist) {
            bestDist = d
            best = edge === s.start ? acc : acc + (s.end - s.start)
          }
        }
        acc += s.end - s.start
      }
      setPlayhead(best)
    },
    [project.timeline, setPlayhead]
  )

  // Drag anywhere on the track to scrub continuously (pauses playback).
  const startScrub = (clientX: number): void => {
    setPlaying(false)
    seekToSource(timeAt(clientX))
    const move = (ev: PointerEvent): void => seekToSource(timeAt(ev.clientX))
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onTrackPointerDown = (e: React.PointerEvent): void => {
    if (drag.current) return
    startScrub(e.clientX)
  }

  const startTrim = (e: React.PointerEvent, id: string, edge: 'start' | 'end'): void => {
    e.stopPropagation()
    drag.current = { id, edge }
    const move = (ev: PointerEvent): void => {
      if (!drag.current) return
      const t = timeAt(ev.clientX)
      setTimeline({
        segments: project.timeline.segments.map((s) => {
          if (s.id !== drag.current!.id) return s
          if (drag.current!.edge === 'start') return { ...s, start: Math.min(t, s.end - 0.1) }
          return { ...s, end: Math.max(t, s.start + 0.1) }
        })
      })
    }
    const up = (): void => {
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const splitAtPlayhead = (): void => {
    const ts = playheadSrc
    const segs = project.timeline.segments
    const idx = segs.findIndex((s) => ts > s.start + 0.05 && ts < s.end - 0.05)
    if (idx < 0) return
    const s = segs[idx]
    const a: ClipSegment = { id: uid(), start: s.start, end: ts }
    const b: ClipSegment = { id: uid(), start: ts, end: s.end }
    setTimeline({ segments: [...segs.slice(0, idx), a, b, ...segs.slice(idx + 1)] })
    setSelected(a.id)
  }

  const deleteSelected = (): void => {
    if (!selected || project.timeline.segments.length <= 1) return
    setTimeline({ segments: project.timeline.segments.filter((s) => s.id !== selected) })
    setSelected(project.timeline.segments.find((s) => s.id !== selected)?.id ?? null)
  }

  const addZoomAtPlayhead = (): void => {
    const cursor = nearestCursor(project.recording.cursor, playheadSrc * 1000)
    const id = uid()
    if (!project.camera.enabled) setCamera({ enabled: true })
    addKeyframe({
      id,
      t: playheadSrc,
      x: Math.min(1, Math.max(0, cursor?.x ?? 0.5)),
      y: Math.min(1, Math.max(0, cursor?.y ?? 0.5)),
      scale: project.camera.autoScale,
      transition: Math.max(0.25, project.camera.smoothing)
    })
    setSelectedZoom(id)
  }

  return (
    <div className="flex-none border-t border-border bg-card/30 px-5 pb-4 pt-3">
      <div className="mb-3 flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={splitAtPlayhead}>
          <Scissors /> Split
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={deleteSelected}
          disabled={!selected || project.timeline.segments.length <= 1}
        >
          <Trash2 /> Delete clip
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          onClick={addZoomAtPlayhead}
          disabled={!project.camera.enabled}
        >
          <Plus /> Zoom here
        </Button>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {project.timeline.segments.length} clip
          {project.timeline.segments.length > 1 ? 's' : ''} · {project.camera.keyframes.length} zoom
          {project.camera.keyframes.length === 1 ? '' : 's'}
        </span>
      </div>

      <div
        className="relative h-16 cursor-pointer overflow-hidden rounded-lg border border-border bg-background"
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
      >
        {/* zoom keyframe band */}
        <div className="absolute inset-x-0 top-0 h-5 border-b border-border bg-black/20">
          {project.camera.keyframes.map((k) => (
            <div
              key={k.id}
              className={cn(
                'absolute top-0.5 z-[3] -translate-x-1/2 cursor-pointer whitespace-nowrap rounded px-1.5 font-mono text-[9.5px] font-semibold',
                k.scale <= 1.001 ? 'bg-secondary text-muted-foreground' : 'bg-foreground text-background',
                selectedZoom === k.id && 'z-[5] outline outline-2 outline-offset-1 outline-foreground'
              )}
              style={{ left: `${pct(k.t)}%` }}
              title={`Zoom ${k.scale.toFixed(1)}× @ ${k.t.toFixed(1)}s — click to edit, double-click to delete`}
              onPointerDown={(e) => {
                e.stopPropagation()
                setSelectedZoom(k.id)
                seekToSource(k.t)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                removeKeyframe(k.id)
                if (selectedZoom === k.id) setSelectedZoom(null)
              }}
            >
              {k.scale <= 1.001 ? '⤢' : `${k.scale.toFixed(1)}×`}
            </div>
          ))}
        </div>

        {/* kept segments */}
        {project.timeline.segments.map((s) => (
          <div
            key={s.id}
            className={cn(
              'absolute bottom-1.5 top-6 overflow-hidden rounded-md border',
              selected === s.id
                ? 'border-foreground bg-foreground/15 ring-1 ring-inset ring-foreground/60'
                : 'border-foreground/25 bg-foreground/[0.08]'
            )}
            style={{ left: `${pct(s.start)}%`, width: `${pct(s.end - s.start)}%` }}
            onPointerDown={(e) => {
              e.stopPropagation()
              setSelected(s.id)
              startScrub(e.clientX)
            }}
          >
            <span
              className="absolute inset-y-0 left-0 z-[2] w-2 cursor-ew-resize rounded-l-md bg-foreground/60"
              onPointerDown={(e) => startTrim(e, s.id, 'start')}
            />
            <span
              className="absolute inset-y-0 right-0 z-[2] w-2 cursor-ew-resize rounded-r-md bg-foreground/60"
              onPointerDown={(e) => startTrim(e, s.id, 'end')}
            />
          </div>
        ))}

        <div
          className="pointer-events-none absolute inset-y-0 z-[4] w-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
          style={{ left: `${pct(playheadSrc)}%` }}
        >
          <span className="absolute -left-[3px] top-0 h-0 w-0 border-x-[3.5px] border-t-[5px] border-x-transparent border-t-white" />
        </div>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] tabular text-muted-foreground">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i}>{((dur * i) / 5).toFixed(1)}s</span>
        ))}
      </div>
    </div>
  )
}

function nearestCursor(
  cursor: { t: number; x: number; y: number }[],
  ms: number
): { x: number; y: number } | null {
  if (cursor.length === 0) return null
  let best = cursor[0]
  let bestD = Infinity
  for (const c of cursor) {
    const d = Math.abs(c.t - ms)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}
