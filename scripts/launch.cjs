// Launch electron-vite with a GUI-capable environment.
//
// Some shells/sandboxes export ELECTRON_RUN_AS_NODE=1, which makes the Electron
// binary run as plain Node.js — so `app`/`BrowserWindow` are undefined and the
// window never opens (`TypeError: Cannot read properties of undefined (reading
// 'whenReady')`). We strip it before spawning so the GUI launches. On machines
// where it isn't set, this is a harmless no-op.
const { spawn } = require('child_process')
const { join } = require('path')

delete process.env.ELECTRON_RUN_AS_NODE

const command = process.argv[2] || 'dev'
// electron-vite restricts package subpaths via "exports", so reference the bin
// file by path rather than require.resolve().
const bin = join(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

const child = spawn(process.execPath, [bin, command, ...process.argv.slice(3)], {
  stdio: 'inherit',
  env: process.env
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
