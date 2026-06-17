// electron-builder afterSign hook: notarize the macOS app — but ONLY when Apple
// credentials are present in the environment. With no creds (the default ad-hoc
// build) this is a no-op, so it never interferes with the current release flow.
//
// To enable (needs a paid Apple Developer account, ~$99/yr):
//   1. In electron-builder.yml: add `- zip` to mac.target and point mac.identity
//      at your "Developer ID Application" cert (or remove it and build with
//      CSC_IDENTITY_AUTO_DISCOVERY=true). Remove the ad-hoc sign in after-pack.cjs.
//   2. Export: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD (app-specific password),
//      APPLE_TEAM_ID.
//   3. Build: npm run dist:mac  → the dmg opens with no Gatekeeper prompt and
//      electron-updater can apply silent updates.
exports.default = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('[notarize] no Apple credentials in env — skipping (ad-hoc build)')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`
  // Lazy require so the dependency is only needed when actually notarizing.
  const { notarize } = require('@electron/notarize')
  console.log(`[notarize] submitting ${appName}.app to Apple — this can take a few minutes…`)
  await notarize({ appPath, appleId, appleIdPassword, teamId })
  console.log('[notarize] success — stapled and ready')
}
