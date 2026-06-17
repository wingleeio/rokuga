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

export interface AVDevice {
  deviceId: string
  label: string
}

/** Enumerate cameras + microphones. Labels are only populated once the user has
 * granted camera/mic access at least once; before that we show generic names. */
export async function listAVDevices(): Promise<{ cameras: AVDevice[]; mics: AVDevice[] }> {
  let devices: MediaDeviceInfo[] = []
  try {
    devices = await navigator.mediaDevices.enumerateDevices()
  } catch {
    return { cameras: [], mics: [] }
  }
  const cameras = devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
  const mics = devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
  return { cameras, mics }
}

/** Open a webcam and/or microphone stream. An id may be null to omit that track,
 * or the string `'default'` to use the system default device (works before the
 * user has granted access, when specific device ids aren't yet exposed). Throws
 * if the OS denies camera/mic permission. */
export async function getWebcamMicStream(opts: {
  cameraId?: string | null
  micId?: string | null
}): Promise<MediaStream> {
  const byId = (id: string): { deviceId: { exact: string } } => ({ deviceId: { exact: id } })
  const constraints: MediaStreamConstraints = {
    video: opts.cameraId
      ? { ...(opts.cameraId === 'default' ? {} : byId(opts.cameraId)), width: { ideal: 1280 }, height: { ideal: 720 } }
      : false,
    audio: opts.micId
      ? { ...(opts.micId === 'default' ? {} : byId(opts.micId)), echoCancellation: true, noiseSuppression: true }
      : false
  }
  return navigator.mediaDevices.getUserMedia(constraints)
}

function pickAVMimeType(hasVideo: boolean): string {
  const candidates = hasVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return hasVideo ? 'video/webm' : 'audio/webm'
}

/** Record a webcam/mic stream (video and/or audio) to a webm blob, picking a
 * codec that matches the present tracks. Aligns to `onStart` like recordStream. */
export function recordAVStream(stream: MediaStream, onStart?: () => void): ActiveRecording {
  const hasVideo = stream.getVideoTracks().length > 0
  const mimeType = pickAVMimeType(hasVideo)
  const options: MediaRecorderOptions = { mimeType, audioBitsPerSecond: 128_000 }
  if (hasVideo) options.videoBitsPerSecond = 6_000_000
  const recorder = new MediaRecorder(stream, options)
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
