/** Acquire a desktop-capture MediaStream for a given desktopCapturer source id. */
export async function getCaptureStream(
  sourceId: string,
  maxFps: number
): Promise<MediaStream> {
  // Electron supports the legacy chromeMediaSource constraints for getUserMedia.
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxWidth: 3840,
        maxHeight: 2160,
        maxFrameRate: maxFps
      }
    }
  } as unknown as MediaStreamConstraints
  return navigator.mediaDevices.getUserMedia(constraints)
}

/**
 * Capture via getDisplayMedia with `cursor: 'never'`. Runs in the app process
 * (which holds Screen Recording permission) and routes to the pre-selected
 * source through the main process's display-media handler, so the captured
 * video excludes the OS cursor.
 */
export async function getDisplayCaptureStream(
  sourceId: string,
  maxFps: number
): Promise<MediaStream> {
  await window.rokuga.setPendingSource(sourceId)
  return navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'never', frameRate: maxFps },
    audio: false
  } as unknown as DisplayMediaStreamOptions)
}

export function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return 'video/webm'
}

export interface ActiveRecording {
  stop: () => Promise<Blob>
  stream: MediaStream
}

/** Wrap a stream in a MediaRecorder, collecting chunks until stopped.
 * `onStart` fires when capture actually begins, so callers can align the cursor
 * timeline to the video's t=0. */
export function recordStream(stream: MediaStream, onStart?: () => void): ActiveRecording {
  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  if (onStart) recorder.onstart = () => onStart()
  recorder.start(200)

  return {
    stream,
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
          resolve(new Blob(chunks, { type: mimeType }))
        }
        recorder.stop()
      })
  }
}

/**
 * MediaRecorder webm files often lack a seekable duration in their header. We
 * recover the true duration by reading the video element's reported length
 * after a forced seek, returning a blob URL we can play.
 */
export function blobToURL(blob: Blob): string {
  return URL.createObjectURL(blob)
}
