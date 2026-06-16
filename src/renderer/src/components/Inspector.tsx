import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { AspectPreset, BackgroundKind } from '@shared/types'
import { useEditor } from '../context'
import {
  GRADIENT_PRESETS,
  SOLID_PRESETS,
  WALLPAPER_PRESETS,
  renderWallpaperToDataURL
} from '../lib/presets'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Button } from './ui/button'
import { Field, SliderRow, SwitchRow } from './controls'
import { cn } from '../lib/cn'

type Tab = 'background' | 'frame' | 'camera' | 'cursor' | 'canvas'
const TABS: { value: Tab; label: string }[] = [
  { value: 'background', label: 'BG' },
  { value: 'frame', label: 'Frame' },
  { value: 'camera', label: 'Zoom' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'canvas', label: 'Canvas' }
]

export default function Inspector(): JSX.Element {
  const [tab, setTab] = useState<Tab>('background')
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as Tab)}
      className="flex w-[320px] flex-none flex-col border-l border-border bg-card/30"
    >
      <TabsList className="grid w-full grid-cols-5 gap-1 rounded-none border-b border-border bg-transparent p-2">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div key={tab} className="flex-1 animate-fade-in overflow-y-auto overscroll-contain p-4">
        {tab === 'background' && <BackgroundPanel />}
        {tab === 'frame' && <FramePanel />}
        {tab === 'camera' && <CameraPanel />}
        {tab === 'cursor' && <CursorPanel />}
        {tab === 'canvas' && <CanvasPanel />}
      </div>
    </Tabs>
  )
}

function ColorInput({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
    />
  )
}

function BackgroundPanel(): JSX.Element {
  const { project, setBackground } = useEditor()
  const bg = project.background
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setBackground({ kind: 'image', image: String(reader.result) })
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Type">
        <Select value={bg.kind} onValueChange={(kind) => setBackground({ kind: kind as BackgroundKind })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gradient">Gradient</SelectItem>
            <SelectItem value="wallpaper">Wallpaper</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {bg.kind === 'gradient' && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {GRADIENT_PRESETS.map((g) => (
              <button
                key={g.id}
                title={g.name}
                onClick={() => setBackground({ colors: g.colors, angle: g.angle })}
                className={cn(
                  'h-11 rounded-md ring-1 ring-inset ring-border transition-transform hover:scale-105',
                  bg.colors.join() === g.colors.join() && 'ring-2 ring-foreground'
                )}
                style={{ background: `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})` }}
              />
            ))}
          </div>
          <SliderRow
            label="Angle"
            min={0}
            max={360}
            value={bg.angle}
            onChange={(angle) => setBackground({ angle })}
            format={(v) => `${v}°`}
          />
          <div className="flex gap-2">
            {bg.colors.map((c, i) => (
              <ColorInput
                key={i}
                value={c}
                onChange={(v) => {
                  const colors = bg.colors.slice()
                  colors[i] = v
                  setBackground({ colors })
                }}
              />
            ))}
          </div>
        </>
      )}

      {bg.kind === 'wallpaper' && (
        <div className="grid grid-cols-4 gap-2">
          {WALLPAPER_PRESETS.map((w) => (
            <button
              key={w.id}
              title={w.name}
              onClick={() => setBackground({ image: renderWallpaperToDataURL(w) })}
              className="flex h-11 items-center justify-center rounded-md bg-secondary px-1 text-center text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border transition-transform hover:scale-105 hover:text-foreground"
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      {bg.kind === 'image' && (
        <>
          <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
            Choose image…
          </Button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          {bg.image && <img className="w-full rounded-md border border-border" src={bg.image} alt="" />}
        </>
      )}

      {bg.kind === 'solid' && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {SOLID_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setBackground({ colors: [c] })}
                className={cn(
                  'h-11 rounded-md ring-1 ring-inset ring-border transition-transform hover:scale-105',
                  bg.colors[0] === c && 'ring-2 ring-foreground'
                )}
                style={{ background: c }}
              />
            ))}
          </div>
          <ColorInput value={bg.colors[0] ?? '#0d1117'} onChange={(v) => setBackground({ colors: [v] })} />
        </>
      )}

      {(bg.kind === 'image' || bg.kind === 'wallpaper') && (
        <SliderRow
          label="Background blur"
          min={0}
          max={40}
          value={bg.blur}
          onChange={(blur) => setBackground({ blur })}
          format={(v) => `${v}px`}
        />
      )}
    </div>
  )
}

function FramePanel(): JSX.Element {
  const { project, setFrame } = useEditor()
  const f = project.frame
  return (
    <div className="flex flex-col gap-5">
      <SliderRow label="Padding" min={0} max={0.3} step={0.005} value={f.padding} onChange={(padding) => setFrame({ padding })} format={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="Size" min={0.4} max={1} step={0.01} value={f.scale} onChange={(scale) => setFrame({ scale })} format={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="Corner radius" min={0} max={80} value={f.cornerRadius} onChange={(cornerRadius) => setFrame({ cornerRadius })} format={(v) => `${v}px`} />
      <SliderRow label="Shadow" min={0} max={1} step={0.01} value={f.shadow} onChange={(shadow) => setFrame({ shadow })} format={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="Shadow blur" min={0} max={160} value={f.shadowBlur} onChange={(shadowBlur) => setFrame({ shadowBlur })} format={(v) => `${v}px`} />
      <SliderRow label="Border" min={0} max={12} value={f.borderWidth} onChange={(borderWidth) => setFrame({ borderWidth })} format={(v) => `${v}px`} />
      {f.borderWidth > 0 && (
        <ColorInput value={f.borderColor} onChange={(v) => setFrame({ borderColor: v })} />
      )}
    </div>
  )
}

function CameraPanel(): JSX.Element {
  const {
    project,
    setCamera,
    regenerateAutoZoom,
    selectedZoom,
    setSelectedZoom,
    updateKeyframe,
    removeKeyframe
  } = useEditor()
  const c = project.camera
  const keyframes = c.keyframes.slice().sort((a, b) => a.t - b.t)
  const active = keyframes.find((k) => k.id === selectedZoom) ?? null

  return (
    <div className="flex flex-col gap-5">
      <SwitchRow label="Enable camera zoom" checked={c.enabled} onChange={(enabled) => setCamera({ enabled })} />
      <SwitchRow label="Auto-zoom on activity" checked={c.auto} onChange={(auto) => setCamera({ auto })} />
      <SliderRow label="Default zoom amount" min={1.2} max={3} step={0.1} value={c.autoScale} onChange={(autoScale) => setCamera({ autoScale })} format={(v) => `${v.toFixed(1)}×`} />
      <SliderRow label="Sensitivity" min={0.5} max={2} step={0.05} value={c.autoIntensity} onChange={(autoIntensity) => setCamera({ autoIntensity })} format={(v) => v.toFixed(2)} />
      <SliderRow label="Smoothing" min={0.15} max={1.5} step={0.05} value={c.smoothing} onChange={(smoothing) => setCamera({ smoothing })} format={(v) => `${v.toFixed(2)}s`} />

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          className="w-full"
          onClick={regenerateAutoZoom}
          disabled={!c.enabled || project.recording.cursor.length < 4}
        >
          Regenerate auto-zoom
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setCamera({ keyframes: [] })
            setSelectedZoom(null)
          }}
          disabled={c.keyframes.length === 0}
        >
          Clear all zooms ({c.keyframes.length})
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-4">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Zooms · {keyframes.length}
        </div>
        {keyframes.length === 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            No zooms yet. Use <b className="text-foreground">+ Zoom here</b> on the timeline, or
            enable auto-zoom and regenerate.
          </p>
        )}
        {keyframes.map((k, i) => (
          <button
            key={k.id}
            onClick={() => setSelectedZoom(k.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
              selectedZoom === k.id
                ? 'border-foreground/60 bg-secondary'
                : 'border-border hover:border-foreground/30'
            )}
          >
            <span className="min-w-8 font-mono text-[11px] font-semibold text-foreground">
              {k.scale <= 1.001 ? 'OUT' : `${k.scale.toFixed(1)}×`}
            </span>
            <span className="font-mono text-[11px] tabular text-muted-foreground">{k.t.toFixed(2)}s</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">#{i + 1}</span>
            <span
              role="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation()
                removeKeyframe(k.id)
                if (selectedZoom === k.id) setSelectedZoom(null)
              }}
              title="Delete zoom"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>

      {active && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary/30 p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Edit zoom
          </div>
          <SliderRow label="Zoom level" min={1} max={4} step={0.05} value={active.scale} onChange={(scale) => updateKeyframe(active.id, { scale })} format={(v) => (v <= 1.001 ? 'none (out)' : `${v.toFixed(2)}×`)} />
          <SliderRow label="Time" min={0} max={project.recording.duration} step={0.05} value={active.t} onChange={(t) => updateKeyframe(active.id, { t })} format={(v) => `${v.toFixed(2)}s`} />
          <SliderRow label="Focus X" min={0} max={1} step={0.01} value={active.x} onChange={(x) => updateKeyframe(active.id, { x })} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Focus Y" min={0} max={1} step={0.01} value={active.y} onChange={(y) => updateKeyframe(active.id, { y })} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Transition" min={0.1} max={2} step={0.05} value={active.transition} onChange={(transition) => updateKeyframe(active.id, { transition })} format={(v) => `${v.toFixed(2)}s`} />
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              removeKeyframe(active.id)
              setSelectedZoom(null)
            }}
          >
            Delete this zoom
          </Button>
        </div>
      )}

      {project.recording.cursor.length < 4 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No cursor data was captured for this clip, so auto-zoom is unavailable. You can still add
          manual zooms from the timeline.
        </p>
      )}
    </div>
  )
}

function CursorPanel(): JSX.Element {
  const { project, setCursor } = useEditor()
  const cur = project.cursor
  const hasCursor = project.recording.cursor.length > 0
  return (
    <div className="flex flex-col gap-5">
      <SwitchRow label="Show cursor" checked={cur.show} onChange={(show) => setCursor({ show })} />
      <SliderRow label="Cursor size" min={24} max={96} value={cur.size} onChange={(size) => setCursor({ size })} format={(v) => `${Math.round(v)}px`} />
      <SliderRow label="Motion smoothing" min={0} max={1} step={0.05} value={cur.smoothing} onChange={(smoothing) => setCursor({ smoothing })} format={(v) => `${Math.round(v * 100)}%`} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Rokuga draws its own smooth pointer from the recorded cursor path
        {hasCursor ? '.' : ', but no cursor path was captured for this clip.'} It follows the zoom
        and stays crisp at any size.
      </p>
    </div>
  )
}

function CanvasPanel(): JSX.Element {
  const { project, setCanvas, setTimeline } = useEditor()
  return (
    <div className="flex flex-col gap-5">
      <Field label="Aspect ratio">
        <Select
          value={project.canvas.aspect}
          onValueChange={(aspect) => setCanvas({ aspect: aspect as AspectPreset })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="source">Source</SelectItem>
            <SelectItem value="16:9">16:9 — Landscape</SelectItem>
            <SelectItem value="9:16">9:16 — Portrait</SelectItem>
            <SelectItem value="1:1">1:1 — Square</SelectItem>
            <SelectItem value="4:3">4:3</SelectItem>
            <SelectItem value="3:4">3:4</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Resolution">
        <ToggleGroup
          type="single"
          value={String(project.canvas.outputHeight)}
          onValueChange={(v) => v && setCanvas({ outputHeight: parseInt(v, 10) })}
        >
          <ToggleGroupItem value="720">720p</ToggleGroupItem>
          <ToggleGroupItem value="1080">1080p</ToggleGroupItem>
          <ToggleGroupItem value="1440">1440p</ToggleGroupItem>
          <ToggleGroupItem value="2160">4K</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <SliderRow label="Playback speed" min={0.5} max={3} step={0.1} value={project.timeline.speed} onChange={(speed) => setTimeline({ speed })} format={(v) => `${v.toFixed(1)}×`} />
    </div>
  )
}
