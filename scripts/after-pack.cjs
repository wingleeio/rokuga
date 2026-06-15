// electron-builder afterPack hook: ad-hoc code-sign the macOS app.
// Without a paid Apple Developer ID we can't notarize, but Apple Silicon refuses
// to run an unsigned / incoherently-signed bundle ("app is damaged"). A coherent
// deep ad-hoc signature makes it runnable once the quarantine flag is cleared.
const { execFileSync } = require('child_process')
const { join } = require('path')
const { existsSync } = require('fs')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  const resources = join(appPath, 'Contents', 'Resources')
  const entitlements = join(context.packager.info.projectDir, 'build', 'entitlements.mac.plist')

  const sign = (target, extra = []) =>
    execFileSync('codesign', ['--force', '--sign', '-', ...extra, target], { stdio: 'inherit' })

  // Loose Mach-O binaries (dlopen'd / exec'd) must each be signed to run on arm64.
  for (const p of [
    join(resources, 'rokuga_capture.node'),
    join(resources, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg')
  ]) {
    if (existsSync(p)) sign(p)
  }

  // Deep ad-hoc sign the whole bundle (frameworks, helpers, main executable) so
  // the code seal is coherent.
  const extra = ['--deep']
  if (existsSync(entitlements)) extra.push('--entitlements', entitlements)
  sign(appPath, extra)
  console.log('[after-pack] ad-hoc signed', appPath)
}
