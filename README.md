# Rokuga 録画

Record a window on your screen, then turn the raw capture into a polished video —
gradient/wallpaper/image backgrounds, automatic cursor-driven zoom, cuts, and
export to MP4 / WebM / MOV / GIF. Save editable projects as `.rokuga` files.

> Built with Electron + React + TypeScript on the **Vite 8** toolchain
> (`electron-vite@6`), with a sleek minimal **shadcn/ui** (Tailwind + Radix) dark
> interface. Video transcoding uses a bundled `ffmpeg-static` binary — no system
> ffmpeg required.

## Features

- **Window / screen recording** — pick any open window or display, 30 or 60 fps,
  with a live preview and countdown. The global cursor path is sampled during the
  recording to drive auto-zoom.
- **Beautiful backgrounds** — gradient presets (with editable stops + angle),
  procedural "wallpaper" meshes, your own image, solid colors, or none.
- **Frame styling** — padding, size, corner radius, drop shadow, and border,
  rendered live on a canvas compositor.
- **Camera / auto-zoom (Screen Studio style)** — zoom automatically follows where
  the cursor dwells, with adjustable amount, sensitivity and smoothing. Fully
  controllable: toggle it off entirely, regenerate it, clear it, or place manual
  zoom keyframes on the timeline.
- **Cutting & trimming** — trim clip edges, split at the playhead, and delete
  segments. Playback and export honor the cuts.
- **Aspect & speed** — reframe to 16:9, 9:16, 1:1, 4:3, 3:4 or source; change
  playback speed; choose output resolution up to 4K.
- **`.rokuga` project files** — a zip container holding the raw recording plus an
  editable `project.json`, so a project is fully self-contained and portable.
- **Export** — MP4 (H.264), MOV (H.264), WebM (VP9) or animated GIF, with quality
  and frame-rate controls, via the bundled ffmpeg.

## Getting started

```bash
npm install      # downloads Electron + ffmpeg-static
npm run dev      # launch the app in development
```

Build distributables:

```bash
npm run build:native                                 # build the cursor-capture addon for Electron
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac   # → release/Rokuga-<version>-arm64.dmg (unsigned)
npm run dist:win                                     # NSIS installer
npm run dist:linux                                   # AppImage
```

The dmg is **ad-hoc signed** (via the `afterPack` hook — required so it runs on
Apple Silicon) but **not notarized** (no Apple Developer ID). After installing, clear
the quarantine flag once so macOS doesn't report it as "damaged":

```sh
xattr -dr com.apple.quarantine /Applications/Rokuga.app
```

The native ScreenCaptureKit addon ships via `extraResources` and the bundled ffmpeg
binary via `asarUnpack`, so cursor-free capture and export work in the packaged app.

Other scripts: `npm run build` (bundle main/preload/renderer), `npm run typecheck`.

### macOS permission

The first time you record, macOS will require **Screen Recording** permission for
the app (System Settings → Privacy & Security → Screen Recording). If the source
list is empty, grant permission and hit **Refresh**.

> `npm run dev` / `npm run start` go through `scripts/launch.cjs`, which strips a
> stray `ELECTRON_RUN_AS_NODE=1` from the environment before spawning Electron
> (that variable, exported by some shells/sandboxes, otherwise makes the Electron
> binary run as plain Node and the window never opens). It's a no-op everywhere
> else.

## How it works

```
src/
  main/          Electron main process
    index.ts       window + IPC wiring, desktop-media handler
    recorder.ts    desktopCapturer sources, 60Hz cursor sampling, save raw webm
    project.ts     .rokuga zip save/open (media + project.json)
    exporter.ts    ffmpeg transcode (mp4/webm/mov/gif) with progress events
  preload/       contextBridge → window.rokuga typed API
  shared/        types shared across processes
  renderer/      React editor UI
    lib/
      compositor.ts  canvas renderer: background + framed window + zoom crop
      camera.ts      keyframe interpolation + auto-zoom from cursor dwell
      export.ts      composite the edited timeline to webm via captureStream
      project.ts     defaults, timeline⇄source time mapping, cut math
      capture.ts     getUserMedia desktop capture + MediaRecorder
      presets.ts     gradient/solid/wallpaper presets
    components/    RecordView, EditView, Preview, Timeline, Inspector, ExportPanel
```

**Recording** uses `desktopCapturer` (main) → `getUserMedia` desktop constraints →
`MediaRecorder` (webm). **Editing** is non-destructive: the raw webm is untouched
and all edits live in the project state. The same `Compositor` renders both the
live preview and the export. **Export** plays the edited timeline in real time
through an offscreen canvas, captures it with `canvas.captureStream()`, and hands
the webm to ffmpeg for final transcoding.

## Editor shortcuts

`Space` play/pause · `←`/`→` seek 1s (`⇧` for one frame) · `Home`/`End` jump to
start/end · `L` toggle loop · `⌘S` save (`⇧⌘S` save as) · `⌘E` export · `⌘O` open.
Drag anywhere on the timeline to scrub; click the preview to play/pause.

## Cursor & zoom

Rokuga draws its **own** macOS-style pointer (black with a white outline) from the
recorded cursor path, and the auto-zoom follows that path. On macOS it records
through **ScreenCaptureKit with `showsCursor = false`** (a small Swift helper,
compiled and cached on first run), so the saved video has **no OS cursor** — only
Rokuga's synthetic one. If ScreenCaptureKit/Swift isn't available it falls back to
`getUserMedia` capture, where the synthetic cursor is sized to cover the real one.

Cursor coordinates are mapped into the captured surface's real on-screen bounds —
a display's bounds for screen capture, or the window's bounds (resolved via
CoreGraphics) for window capture — so the pointer and zoom land in the right place
on multi-monitor setups. For window capture the bounds are read when recording
starts, so avoid moving/resizing the window mid-recording.

## Notes & limitations

- No-cursor native capture needs macOS 15+ and the Swift toolchain (Xcode CLT);
  otherwise Rokuga falls back to cursor-occlusion capture.
- Recording is video-only in this version (no system/mic audio track yet).
