/**
 * webm blobs produced by MediaRecorder frequently report `duration === Infinity`
 * until the element is seeked to the end. This primes the element so seeking and
 * the timeline work, falling back to a known duration when the header is broken.
 */
export function prepareVideo(video: HTMLVideoElement, knownDuration: number): Promise<number> {
  return new Promise((resolve) => {
    const finish = (d: number): void => resolve(Number.isFinite(d) && d > 0 ? d : knownDuration)

    const onMeta = (): void => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        cleanup()
        finish(video.duration)
        return
      }
      // Force the browser to compute the real duration.
      const onTime = (): void => {
        if (video.currentTime > 0) {
          video.removeEventListener('timeupdate', onTime)
          video.currentTime = 0
          cleanup()
          finish(video.duration)
        }
      }
      video.addEventListener('timeupdate', onTime)
      video.currentTime = 1e7
    }

    const cleanup = (): void => video.removeEventListener('loadedmetadata', onMeta)

    if (video.readyState >= 1) onMeta()
    else video.addEventListener('loadedmetadata', onMeta)
  })
}

export { pickMimeType } from './capture'
