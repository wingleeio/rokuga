// Dev-only: verify the native capture addon loads in Electron and its async
// bridge works. Capture itself needs Screen Recording permission + a display.
const { app } = require('electron')
const path = require('path')

app.whenReady().then(async () => {
  try {
    const addon = require(path.join(__dirname, '../build/Release/rokuga_capture.node'))
    console.log('ADDON_LOADED keys=' + Object.keys(addon).join(','))
    try {
      const r = await addon.start(0, 99999, '/tmp/rokuga-nativetest.mov', 30)
      console.log('START_RESOLVED ' + JSON.stringify(r))
      await addon.stop()
      console.log('STOP_OK')
    } catch (e) {
      console.log('START_REJECTED ' + String(e))
    }
  } catch (e) {
    console.log('ADDON_LOAD_FAILED ' + String(e))
  }
  app.quit()
})
