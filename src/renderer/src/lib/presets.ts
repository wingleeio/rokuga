import type { BackgroundSettings } from '@shared/types'

export interface GradientPreset {
  id: string
  name: string
  colors: string[]
  angle: number
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: 'sunset', name: 'Sunset', colors: ['#ff7e5f', '#feb47b'], angle: 120 },
  { id: 'grape', name: 'Grape', colors: ['#7028e4', '#e5b2ca'], angle: 135 },
  { id: 'ocean', name: 'Ocean', colors: ['#2193b0', '#6dd5ed'], angle: 120 },
  { id: 'midnight', name: 'Midnight', colors: ['#0f2027', '#203a43', '#2c5364'], angle: 135 },
  { id: 'candy', name: 'Candy', colors: ['#ff9a9e', '#fecfef'], angle: 110 },
  { id: 'forest', name: 'Forest', colors: ['#134e5e', '#71b280'], angle: 130 },
  { id: 'aurora', name: 'Aurora', colors: ['#00c9ff', '#92fe9d'], angle: 120 },
  { id: 'mono', name: 'Slate', colors: ['#232526', '#414345'], angle: 135 },
  { id: 'flare', name: 'Flare', colors: ['#f12711', '#f5af19'], angle: 120 },
  { id: 'lavender', name: 'Lavender', colors: ['#c471f5', '#fa71cd'], angle: 130 },
  { id: 'sky', name: 'Sky', colors: ['#2980b9', '#6dd5fa', '#ffffff'], angle: 120 },
  { id: 'ink', name: 'Ink', colors: ['#000428', '#004e92'], angle: 135 }
]

export const SOLID_PRESETS = [
  '#0d1117',
  '#1e1e2e',
  '#ffffff',
  '#f5f5f7',
  '#e3e8ef',
  '#0a84ff',
  '#ff375f',
  '#34c759'
]

/** Built-in procedural "wallpaper" backgrounds rendered to a dataURL on demand. */
export interface WallpaperPreset {
  id: string
  name: string
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'mesh-violet',
    name: 'Mesh Violet',
    draw: (ctx, w, h) => meshGradient(ctx, w, h, ['#6a11cb', '#2575fc', '#ff5edf', '#12c2e9'])
  },
  {
    id: 'mesh-warm',
    name: 'Mesh Warm',
    draw: (ctx, w, h) => meshGradient(ctx, w, h, ['#f6d365', '#fda085', '#fb5d8c', '#ff9472'])
  },
  {
    id: 'mesh-cool',
    name: 'Mesh Cool',
    draw: (ctx, w, h) => meshGradient(ctx, w, h, ['#13547a', '#80d0c7', '#3a7bd5', '#00d2ff'])
  },
  {
    id: 'dots',
    name: 'Dot Grid',
    draw: (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#1b1b2f')
      g.addColorStop(1, '#162447')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      const step = Math.round(w / 36)
      for (let y = step; y < h; y += step)
        for (let x = step; x < w; x += step) {
          ctx.beginPath()
          ctx.arc(x, y, Math.max(1, step * 0.05), 0, Math.PI * 2)
          ctx.fill()
        }
    }
  }
]

function meshGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colors: string[]
): void {
  ctx.fillStyle = colors[0]
  ctx.fillRect(0, 0, w, h)
  const blobs = [
    { x: 0.2, y: 0.25, c: colors[1] },
    { x: 0.8, y: 0.3, c: colors[2] },
    { x: 0.5, y: 0.8, c: colors[3] ?? colors[1] }
  ]
  for (const b of blobs) {
    const r = Math.max(w, h) * 0.7
    const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, r)
    g.addColorStop(0, b.c)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}

export function renderWallpaperToDataURL(preset: WallpaperPreset): string {
  const c = document.createElement('canvas')
  c.width = 1920
  c.height = 1080
  const ctx = c.getContext('2d')!
  preset.draw(ctx, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.9)
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  kind: 'gradient',
  colors: GRADIENT_PRESETS[1].colors,
  angle: GRADIENT_PRESETS[1].angle,
  image: null,
  blur: 0
}
