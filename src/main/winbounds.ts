import { app } from 'electron'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Swift helper: prints the on-screen bounds (points, top-left origin — the same
// space as Electron's screen.getCursorScreenPoint) of a window by CGWindowID.
const SWIFT_SRC = `import CoreGraphics
import Foundation
let args = CommandLine.arguments
guard args.count > 1, let target = UInt32(args[1]) else { exit(1) }
guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else { exit(1) }
for w in list {
    guard let num = (w[kCGWindowNumber as String] as? NSNumber)?.uint32Value, num == target else { continue }
    guard let b = w[kCGWindowBounds as String] as? [String: Any] else { continue }
    let x = (b["X"] as? NSNumber)?.doubleValue ?? 0
    let y = (b["Y"] as? NSNumber)?.doubleValue ?? 0
    let width = (b["Width"] as? NSNumber)?.doubleValue ?? 0
    let height = (b["Height"] as? NSNumber)?.doubleValue ?? 0
    print("{\\"x\\":\\(x),\\"y\\":\\(y),\\"width\\":\\(width),\\"height\\":\\(height)}")
    exit(0)
}
exit(1)
`

const SWIFTC = '/usr/bin/swiftc'
const SWIFT = '/usr/bin/swift'
const VERSION = 'v1'

let binaryPath: string | null = null
let srcPath: string | null = null
let prep: Promise<void> | null = null

function helperDir(): string {
  return join(app.getPath('userData'), 'helpers')
}

/** Write + compile the Swift helper once, caching the binary. No-op off macOS. */
export function ensureWindowBoundsHelper(): Promise<void> {
  if (process.platform !== 'darwin') return Promise.resolve()
  if (prep) return prep
  prep = (async () => {
    try {
      const dir = helperDir()
      await fs.mkdir(dir, { recursive: true })
      srcPath = join(dir, `winbounds-${VERSION}.swift`)
      const out = join(dir, `winbounds-${VERSION}`)
      await fs.writeFile(srcPath, SWIFT_SRC)
      try {
        await fs.access(out)
        binaryPath = out
        return
      } catch {
        /* needs compiling */
      }
      await new Promise<void>((resolve, reject) => {
        execFile(SWIFTC, ['-O', '-o', out, srcPath!], { timeout: 60_000 }, (err) =>
          err ? reject(err) : resolve()
        )
      })
      binaryPath = out
    } catch {
      binaryPath = null // toolchain unavailable; caller falls back to display bounds
    }
  })()
  return prep
}

function runHelper(cmd: string, args: string[]): Promise<Rect | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null)
      const out = stdout.trim()
      if (!out) return resolve(null)
      try {
        const r = JSON.parse(out) as Rect
        resolve(r.width > 0 && r.height > 0 ? r : null)
      } catch {
        resolve(null)
      }
    })
  })
}

/** Resolve a window's on-screen bounds by CGWindowID, or null if unavailable. */
export async function getWindowBounds(windowId: number): Promise<Rect | null> {
  if (process.platform !== 'darwin') return null
  await ensureWindowBoundsHelper()
  if (binaryPath) {
    const r = await runHelper(binaryPath, [String(windowId)])
    if (r) return r
  }
  // Fallback: interpret the source directly if compilation wasn't possible.
  if (srcPath) return runHelper(SWIFT, [srcPath, String(windowId)])
  return null
}
