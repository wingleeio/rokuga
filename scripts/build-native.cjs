// Build the in-process ScreenCaptureKit recorder addon against Electron's ABI.
// Best-effort: on non-macOS or when the toolchain is missing, it warns and exits
// 0 so `npm install` doesn't fail (the app falls back to cursor-visible capture).
const { execFileSync } = require('child_process')

if (process.platform !== 'darwin') {
  console.log('[build-native] skipping (macOS only)')
  process.exit(0)
}

let electronVersion
try {
  electronVersion = require('electron/package.json').version
} catch {
  console.log('[build-native] electron not installed yet, skipping')
  process.exit(0)
}

try {
  execFileSync(
    'npx',
    [
      'node-gyp',
      'rebuild',
      `--target=${electronVersion}`,
      '--dist-url=https://electronjs.org/headers',
      `--arch=${process.arch}`
    ],
    { stdio: 'inherit' }
  )
  console.log('[build-native] built rokuga_capture.node for Electron', electronVersion)
} catch (e) {
  console.warn('[build-native] native capture addon failed to build; the app will',
    'fall back to cursor-visible capture.', String(e))
  process.exit(0)
}
