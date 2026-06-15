import type { ExportOptions, ProjectState } from '@shared/types'
import { Compositor } from './compositor'
import { keptDuration, timelineToSource } from './project'
import { prepareVideo } from './video'

/**
 * Export by deterministic frame-stepping: for each output frame we seek the
 * source to the exact time, render the composite, and stream the frame to ffmpeg
 * (image2pipe at a fixed fps). This yields an exact duration with no dropped or
 * frozen frames — unlike real-time MediaRecorder capture. Returns the saved path
 * (or null if the user cancelled the save dialog).
 */
export async function exportProject(
  project: ProjectState,
  mediaBlob: Blob,
  options: ExportOptions,
  onProgress: (ratio: number) => void
): Promise<string | null> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  // Attached (but invisible) so Chromium reliably decodes frames on seek.
  video.style.cssText =
    'position:absolute;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
  video.src = URL.createObjectURL(mediaBlob)
  document.body.appendChild(video)

  try {
    await prepareVideo(video, project.recording.duration)

    const canvas = document.createElement('canvas')
    const exportProj: ProjectState = {
      ...project,
      canvas: { ...project.canvas, outputHeight: options.height }
    }
    const compositor = new Compositor(canvas, video)
    const { w, h } = compositor.outputSize(exportProj)
    canvas.width = w
    canvas.height = h
    await compositor.preloadAssets(exportProj)

    const total = Math.max(0.0001, keptDuration(project.timeline))
    const speed = Math.max(0.1, project.timeline.speed)
    const fps = options.fps
    const totalFrames = Math.max(1, Math.round((total / speed) * fps))

    const begin = await window.rokuga.exportBegin(options, project.name)
    if (!begin.ok) return null

    try {
      compositor.resetSmoothing()
      const dt = 1 / fps
      for (let i = 0; i < totalFrames; i++) {
        const tlTime = Math.min(total - 1e-4, Math.max(0, (i / fps) * speed))
        const srcTime = timelineToSource(project.timeline, tlTime)
        await seekTo(video, srcTime)
        compositor.render(exportProj, srcTime, true, dt)
        await window.rokuga.exportFrame(await canvasToJpeg(canvas))
        onProgress(Math.min(0.99, (i + 1) / totalFrames))
      }
      return await window.rokuga.exportEnd()
    } catch (e) {
      window.rokuga.exportCancel()
      throw e
    }
  } finally {
    URL.revokeObjectURL(video.src)
    video.remove()
  }
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.0005) {
      resolve()
      return
    }
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      video.removeEventListener('seeked', finish)
      resolve()
    }
    video.addEventListener('seeked', finish)
    video.currentTime = t
    setTimeout(finish, 1000) // safety: never hang if 'seeked' doesn't fire
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('frame encode failed'))
          return
        }
        blob.arrayBuffer().then(resolve, reject)
      },
      'image/jpeg',
      0.92
    )
  })
}
