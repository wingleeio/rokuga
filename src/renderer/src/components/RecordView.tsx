import { useCallback, useEffect, useRef, useState } from 'react'
import { Circle, FolderOpen, RefreshCw, Monitor, AppWindow } from 'lucide-react'
import type { CaptureSource } from '@shared/types'
import type { RecordedClip } from '../App'
import {
  getCaptureStream,
  getDisplayCaptureStream,
  recordStream,
  type ActiveRecording
} from '../lib/capture'
import { Button } from './ui/button'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { cn } from '../lib/cn'

interface Props {
  onRecorded: (clip: RecordedClip) => void
  onOpen: () => void
  busy: string | null
}

type Phase = 'idle' | 'countdown' | 'recording'

export default function RecordView({ onRecorded, onOpen, busy }: Props): JSX.Element {
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [fps, setFps] = useState(30)
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nativeMode, setNativeMode] = useState(false)
  const [captureNote, setCaptureNote] = useState('')

  const previewRef = useRef<HTMLVideoElement>(null)
  const recRef = useRef<ActiveRecording | null>(null)
  const nativeRef = useRef<{ width: number; height: number } | null>(null)
  const startTimeRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.rokuga.listSources()
      setSources(list)
      setSelected((prev) => prev ?? list.find((s) => s.type === 'screen')?.id ?? list[0]?.id ?? null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const startTimer = useCallback((source: CaptureSource) => {
    startTimeRef.current = performance.now()
    window.rokuga.startCursor(source.id, source.display_id)
    timerRef.current = window.setInterval(
      () => setElapsed((performance.now() - startTimeRef.current) / 1000),
      100
    )
  }, [])

  const beginRecording = useCallback(async () => {
    const source = sources.find((s) => s.id === selected)
    if (!source) return
    setError(null)
    setElapsed(0)

    const winMatch = /window:(\d+)/.exec(source.id)
    const windowId = winMatch ? parseInt(winMatch[1], 10) : undefined
    let displayId: number | undefined
    if (!windowId) {
      const dm = /screen:(\d+)/.exec(source.id)
      displayId = source.display_id
        ? parseInt(source.display_id, 10)
        : dm
          ? parseInt(dm[1], 10)
          : undefined
    }

    // 1) Native ScreenCaptureKit capture — records WITHOUT the OS cursor (best,
    //    but blocked if the helper lacks Screen Recording permission).
    const native = await window.rokuga.nativeStartRecording({ windowId, displayId, fps })
    if (native.ok) {
      nativeRef.current = { width: native.width ?? 1920, height: native.height ?? 1080 }
      setNativeMode(true)
      setCaptureNote('Cursor hidden · native capture')
      startTimer(source)
      setPhase('recording')
      return
    }

    // Fallback capture (the OS cursor will be present in the video — only the
    // native path above can drop it). getDisplayMedia first, then getUserMedia.
    setNativeMode(false)
    let stream: MediaStream | null = null
    try {
      stream = await getDisplayCaptureStream(source.id, fps)
    } catch {
      stream = null
    }
    if (!stream) {
      try {
        stream = await getCaptureStream(source.id, fps)
      } catch (e) {
        setError(`Could not start capture: ${String(e)}`)
        setPhase('idle')
        return
      }
    }

    setCaptureNote(
      native.reason === 'permission-declined'
        ? 'Real cursor in video — enable the helper in System Settings ▸ Screen Recording'
        : `Real cursor in video — native capture off (${native.reason ?? 'unavailable'})`
    )
    if (previewRef.current) {
      previewRef.current.srcObject = stream
      previewRef.current.play().catch(() => {})
    }
    recRef.current = recordStream(stream, () => startTimer(source))
    setPhase('recording')
  }, [sources, selected, fps, startTimer])

  const startCountdown = useCallback(() => {
    setCount(3)
    setPhase('countdown')
  }, [])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (count <= 0) {
      beginRecording()
      return
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 800)
    return () => clearTimeout(t)
  }, [phase, count, beginRecording])

  const stop = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    const duration = (performance.now() - startTimeRef.current) / 1000
    const cursor = await window.rokuga.stopCursor()
    const source = sources.find((s) => s.id === selected)
    const name = source?.name ?? 'Recording'

    // Native (no-cursor) path: the file was written by ScreenCaptureKit.
    if (nativeRef.current) {
      const dims = nativeRef.current
      nativeRef.current = null
      const res = await window.rokuga.nativeStopRecording()
      setNativeMode(false)
      if (res && res.media) {
        const blob = new Blob([res.media as BlobPart], { type: 'video/mp4' })
        onRecorded({ blob, width: dims.width, height: dims.height, fps, duration, cursor, sourceName: name })
      } else {
        setError('Recording failed to save. Please try again.')
      }
      setPhase('idle')
      return
    }

    // Fallback (MediaRecorder) path.
    if (!recRef.current) {
      setPhase('idle')
      return
    }
    const settings = recRef.current.stream.getVideoTracks()[0].getSettings()
    const blob = await recRef.current.stop()
    recRef.current = null
    onRecorded({
      blob,
      width: settings.width ?? 1920,
      height: settings.height ?? 1080,
      fps: Math.round(settings.frameRate ?? fps),
      duration,
      cursor,
      sourceName: name
    })
    setPhase('idle')
  }, [sources, selected, fps, onRecorded])

  const screens = sources.filter((s) => s.type === 'screen')
  const windows = sources.filter((s) => s.type === 'window')

  if (phase === 'recording' || phase === 'countdown') {
    return (
      <div className="relative grid h-full place-items-center bg-black">
        {nativeMode ? (
          <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-pulse rounded-full bg-red-500 shadow-[0_0_24px] shadow-red-500/70" />
            <span>Recording</span>
          </div>
        ) : (
          <video
            ref={previewRef}
            className="max-h-[68%] max-w-[78%] rounded-xl border border-border shadow-2xl"
            muted
            playsInline
          />
        )}
        {phase === 'countdown' ? (
          <div className="absolute text-[120px] font-semibold tracking-tighter text-foreground">
            {count > 0 ? count : 'GO'}
          </div>
        ) : (
          <div className="absolute bottom-10 flex items-center gap-4 rounded-full border border-border bg-card/85 py-2.5 pl-5 pr-2.5 shadow-xl backdrop-blur-xl">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-[15px] tabular">{formatTime(elapsed)}</span>
            {captureNote && (
              <span className="border-l border-border pl-3.5 text-xs text-muted-foreground">
                {captureNote}
              </span>
            )}
            <Button variant="destructive" onClick={stop} className="rounded-full">
              Stop &amp; Edit
            </Button>
          </div>
        )}
      </div>
    )
  }

  const selectedIsWindow = sources.find((s) => s.id === selected)?.type === 'window'

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] flex-none items-center justify-between border-b border-border pl-[84px] pr-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-sm font-semibold tracking-tight">Rokuga</span>
        </div>
        <div className="no-drag flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onOpen} disabled={!!busy}>
            <FolderOpen /> Open
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn(loading && 'animate-spin')} /> {loading ? 'Scanning…' : 'Refresh'}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-red-300">
            {error}
          </div>
        )}
        {busy && (
          <div className="mb-4 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[13px] text-muted-foreground">
            {busy}
          </div>
        )}

        <SourceGroup title="Screens" icon={Monitor} sources={screens} selected={selected} onSelect={setSelected} />
        <SourceGroup title="Windows" icon={AppWindow} sources={windows} selected={selected} onSelect={setSelected} />
        {!loading && sources.length === 0 && (
          <p className="max-w-lg text-xs leading-relaxed text-muted-foreground">
            No capture sources found. On macOS, grant Screen Recording permission to this app in
            System Settings → Privacy &amp; Security, then Refresh.
          </p>
        )}
      </div>

      <footer className="flex flex-none items-center justify-between gap-4 border-t border-border bg-card/40 px-7 py-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {selectedIsWindow
            ? 'Keep the window still while recording — cursor & zoom lock to its start position.'
            : ''}
        </span>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground">Frame rate</span>
          <ToggleGroup
            type="single"
            value={String(fps)}
            onValueChange={(v) => v && setFps(parseInt(v, 10))}
            className="w-auto"
          >
            <ToggleGroupItem value="30" className="px-3">
              30
            </ToggleGroupItem>
            <ToggleGroupItem value="60" className="px-3">
              60
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Button size="lg" onClick={startCountdown} disabled={!selected}>
          <Circle className="fill-red-500 text-red-500" /> Start Recording
        </Button>
      </footer>
    </div>
  )
}

function SourceGroup({
  title,
  icon: Icon,
  sources,
  selected,
  onSelect
}: {
  title: string
  icon: typeof Monitor
  sources: CaptureSource[]
  selected: string | null
  onSelect: (id: string) => void
}): JSX.Element | null {
  if (sources.length === 0) return null
  return (
    <section className="mb-7">
      <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(216px,1fr))] gap-3">
        {sources.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            title={s.name}
            className={cn(
              'group overflow-hidden rounded-xl border bg-card p-1.5 text-left transition-colors',
              selected === s.id
                ? 'border-foreground/70 ring-1 ring-foreground/50'
                : 'border-border hover:border-foreground/30'
            )}
          >
            <div className="relative">
              <img src={s.thumbnail} alt="" className="h-32 w-full rounded-lg bg-black object-cover" />
              {selected === s.id && (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-foreground text-[11px] text-background">
                  ✓
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 px-1.5 pb-1 pt-2.5 text-[13px] text-muted-foreground">
              {s.appIcon && <img className="h-4 w-4 object-contain" src={s.appIcon} alt="" />}
              <span className="truncate font-medium">{s.name}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
