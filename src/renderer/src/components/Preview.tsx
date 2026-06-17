import { useCallback, useEffect, useRef } from 'react'
import { Play, Pause, SkipBack, SkipForward, Repeat } from 'lucide-react'
import { useEditor } from '../context'
import { Compositor } from '../lib/compositor'
import { keptDuration, sourceToTimeline, timelineToSource } from '../lib/project'
import { prepareVideo } from '../lib/video'
import { Button } from './ui/button'
import { Hint } from './ui/tooltip'
import { cn } from '../lib/cn'

interface Props {
  mediaURL: string
}

export default function Preview({ mediaURL }: Props): JSX.Element {
  const { project, cameraURL, playhead, setPlayhead, playing, setPlaying, loop, setLoop } =
    useEditor()
  const videoRef = useRef<HTMLVideoElement>(null)
  const camVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const compRef = useRef<Compositor | null>(null)
  const rafRef = useRef<number>(0)
  const readyRef = useRef(false)

  const projectRef = useRef(project)
  projectRef.current = project
  const playheadRef = useRef(playhead)
  playheadRef.current = playhead
  const loopRef = useRef(loop)
  loopRef.current = loop

  const total = keptDuration(project.timeline)
  const hasCam = !!cameraURL

  // Initialize compositor + load media (screen + optional webcam/mic track).
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const camVideo = camVideoRef.current
    if (!video || !canvas) return
    compRef.current = new Compositor(canvas, video, camVideo)
    readyRef.current = false
    video.src = mediaURL

    if (camVideo) {
      if (cameraURL) {
        camVideo.src = cameraURL
        camVideo.playbackRate = projectRef.current.timeline.speed
        // Keep pitch natural when the project is sped up / slowed down.
        ;(camVideo as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true
        prepareVideo(camVideo, projectRef.current.recording.duration).catch(() => {})
      } else {
        camVideo.removeAttribute('src')
        camVideo.load()
      }
    }

    prepareVideo(video, projectRef.current.recording.duration).then(() => {
      readyRef.current = true
      const src = timelineToSource(projectRef.current.timeline, playheadRef.current)
      video.currentTime = src
      if (camVideo && cameraURL) camVideo.currentTime = src
      compRef.current?.preloadAssets(projectRef.current).then(() => renderNow())
    })

    const onSeeked = (): void => renderNow()
    video.addEventListener('seeked', onSeeked)
    camVideo?.addEventListener('seeked', onSeeked)
    return () => {
      video.removeEventListener('seeked', onSeeked)
      camVideo?.removeEventListener('seeked', onSeeked)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaURL, cameraURL])

  const renderNow = useCallback(() => {
    const video = videoRef.current
    if (!video || !compRef.current) return
    compRef.current.render(projectRef.current, video.currentTime)
  }, [])

  // Re-render when project styling changes while paused.
  useEffect(() => {
    if (playing) return
    compRef.current?.preloadAssets(project).then(() => renderNow())
  }, [project, playing, renderNow])

  // Keep mic audio level / mute in sync with the audio settings.
  useEffect(() => {
    const cam = camVideoRef.current
    if (!cam) return
    cam.muted = !project.audio.enabled
    cam.volume = Math.min(1, Math.max(0, project.audio.volume))
  }, [project.audio.enabled, project.audio.volume])

  // Seek to playhead when scrubbing (paused) — both screen + webcam tracks.
  useEffect(() => {
    if (playing || !readyRef.current) return
    const video = videoRef.current
    if (!video) return
    const src = timelineToSource(project.timeline, playhead)
    const cam = camVideoRef.current
    if (cam && hasCam && Math.abs(cam.currentTime - src) > 0.04) cam.currentTime = src
    if (Math.abs(video.currentTime - src) > 0.02) video.currentTime = src
    else renderNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, playing])

  // Playback loop — the screen video plays natively and drives the playhead;
  // segment boundaries (cuts) are jumped across. The webcam/mic track (if any)
  // is played alongside and resynced to the screen's source time.
  useEffect(() => {
    const video = videoRef.current
    const cam = camVideoRef.current
    if (!video || !readyRef.current) {
      if (playing) {
        // media not ready yet; retry shortly
        const t = setTimeout(() => setPlaying(true), 60)
        return () => clearTimeout(t)
      }
      return
    }

    const syncCam = (t: number, force = false): void => {
      if (!cam || !hasCam) return
      if (force || Math.abs(cam.currentTime - t) > 0.3) cam.currentTime = t
    }

    if (!playing) {
      video.pause()
      cam?.pause()
      cancelAnimationFrame(rafRef.current)
      // Snap to the exact (un-smoothed) camera pose so a zoom-out settles
      // perfectly centered instead of freezing mid-ease.
      compRef.current?.resetSmoothing()
      renderNow()
      return
    }

    const proj = projectRef.current
    const segments = proj.timeline.segments.filter((s) => s.end > s.start)
    if (segments.length === 0) return

    // If at the very end, restart from the beginning.
    if (playheadRef.current >= total - 0.05) setPlayhead(0)
    let src = timelineToSource(proj.timeline, playheadRef.current)
    if (Math.abs(video.currentTime - src) > 0.05) video.currentTime = src
    video.playbackRate = proj.timeline.speed
    if (cam && hasCam) {
      cam.playbackRate = proj.timeline.speed
      syncCam(video.currentTime, true)
      cam.play().catch(() => {})
    }
    compRef.current?.resetSmoothing()
    video.play().catch(() => {})

    const tick = (): void => {
      const p = projectRef.current
      const segs = p.timeline.segments.filter((s) => s.end > s.start)
      // Reached the end of playback?
      const ended = (): boolean => {
        if (loopRef.current && segs[0]) {
          video.currentTime = segs[0].start
          syncCam(segs[0].start, true)
          setPlayhead(0)
          compRef.current?.resetSmoothing()
          rafRef.current = requestAnimationFrame(tick)
          return true
        }
        video.pause()
        cam?.pause()
        setPlaying(false)
        setPlayhead(keptDuration(p.timeline))
        return true
      }
      const ct = video.currentTime
      const seg = segs.find((s) => ct >= s.start - 0.01 && ct <= s.end + 0.01)
      if (!seg) {
        const next = segs.find((s) => s.start > ct)
        if (next) {
          video.currentTime = next.start
          syncCam(next.start, true)
        } else {
          ended()
          return
        }
      } else if (ct >= seg.end - 0.02) {
        const next = segs[segs.indexOf(seg) + 1]
        if (next) {
          video.currentTime = next.start
          syncCam(next.start, true)
        } else {
          ended()
          return
        }
      }
      const tl = sourceToTimeline(p.timeline, video.currentTime)
      if (tl != null) setPlayhead(tl)
      syncCam(video.currentTime)
      compRef.current?.render(p, video.currentTime, true)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div
        className="grid flex-1 cursor-pointer place-items-center overflow-hidden p-7"
        onClick={() => readyRef.current && setPlaying(!playing)}
      >
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full rounded-md shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
        />
        <video ref={videoRef} className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0" muted playsInline />
        <video ref={camVideoRef} className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0" playsInline />
      </div>
      <div className="flex items-center justify-center gap-2 py-3">
        <Hint label="Go to start" kbd="Home">
          <Button variant="ghost" size="icon-sm" onClick={() => setPlayhead(0)}>
            <SkipBack className="fill-current" />
          </Button>
        </Hint>
        <Hint label={playing ? 'Pause' : 'Play'} kbd="Space">
          <Button size="icon" onClick={() => setPlaying(!playing)} className="rounded-full">
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </Button>
        </Hint>
        <Hint label="Go to end" kbd="End">
          <Button variant="ghost" size="icon-sm" onClick={() => setPlayhead(total)}>
            <SkipForward className="fill-current" />
          </Button>
        </Hint>
        <Hint label="Loop" kbd="L">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setLoop(!loop)}
            className={cn(loop && 'bg-secondary/60 text-foreground')}
          >
            <Repeat />
          </Button>
        </Hint>
        <span className="ml-2 font-mono text-xs tabular text-muted-foreground">
          {fmt(playhead)} / {fmt(total)}
        </span>
      </div>
    </div>
  )
}

function fmt(s: number): string {
  if (!Number.isFinite(s)) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.floor((s * 100) % 100)
  return `${m}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}
