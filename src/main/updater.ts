import { app, shell, type BrowserWindow, type IpcMain } from 'electron'

// Notify-only update check. The app is ad-hoc signed (not notarized), so we
// can't silently apply updates — Squirrel.Mac would reject the unsigned bundle,
// and shipping the zip it needs would bloat every release. Instead we do a
// lightweight GitHub Releases check, tell the renderer when a newer version is
// out, and let the user grab it from the releases page. Once the app is
// notarized, swap this for electron-updater (+ a `zip` target) for silent updates.

const REPO = 'wingleeio/rokuga'
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // re-check every 4h

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}

function isNewer(remote: string, local: string): boolean {
  const a = parseVersion(remote)
  const b = parseVersion(local)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

async function check(getWindow: () => BrowserWindow | null): Promise<void> {
  try {
    const res = await fetch(API_URL, {
      headers: { 'User-Agent': 'Rokuga', Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const tag = data.tag_name
    if (!tag || !isNewer(tag, app.getVersion())) return
    getWindow()?.webContents.send('update:available', {
      version: tag.replace(/^v/, ''),
      url: data.html_url ?? RELEASES_URL
    })
  } catch {
    // Offline, rate-limited, or no release yet — stay quiet. A notifier that
    // nags on failure is worse than none.
  }
}

export function registerUpdater(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle('update:openReleases', () => {
    shell.openExternal(RELEASES_URL)
    return true
  })

  // Only check in packaged builds — no point pinging GitHub during development.
  if (!app.isPackaged) return

  // Defer the first check so launch isn't gated on a network round-trip.
  setTimeout(() => check(getWindow), 4000)
  setInterval(() => check(getWindow), CHECK_INTERVAL_MS)
}
