import type { ItemKind } from '../sim/menu'

// Every gorengan is drawn from a few shapes, so there are no images to ship.
// `cook` runs 0 (fresh into the oil) → 1 (pas, golden) → 2 (gosong).

type RGB = readonly [number, number, number]

interface Look {
  /** Straight from the bin, before flour and oil. */
  raw: RGB
  /** Just into the oil (battered pieces are flour-white here). */
  start: RGB
  gold: RGB
}

const LOOKS: Record<ItemKind, Look> = {
  bakwan: { raw: [222, 196, 140], start: [236, 214, 160], gold: [214, 148, 52] },
  tahu: { raw: [246, 238, 214], start: [248, 242, 222], gold: [222, 160, 66] },
  pisang: { raw: [246, 214, 92], start: [248, 238, 210], gold: [220, 150, 50] },
  mendoan: { raw: [214, 192, 140], start: [240, 230, 196], gold: [196, 160, 80] },
  cireng: { raw: [246, 244, 236], start: [248, 246, 238], gold: [236, 206, 150] },
  combro: { raw: [236, 220, 170], start: [236, 220, 170], gold: [204, 132, 48] },
}

const BURNT: RGB = [46, 30, 20]
const DARK: RGB = [150, 86, 30]
export const BATTER: RGB = [250, 244, 226]

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

function css(c: RGB, shade = 0): string {
  const f = 1 + shade
  return `rgb(${Math.round(Math.min(255, c[0] * f))},${Math.round(Math.min(255, c[1] * f))},${Math.round(Math.min(255, c[2] * f))})`
}

export function cookColor(kind: ItemKind, cook: number): RGB {
  const l = LOOKS[kind]
  if (cook <= 1) return mix(l.start, l.gold, cook ** 0.8)
  if (cook < 1.95) return mix(l.gold, DARK, (cook - 1) / 0.95)
  return BURNT
}

export interface FoodOpts {
  /** 0..2, see above. Omit for a raw piece from the bin. */
  cook?: number
  battered?: boolean
  rot?: number
  alpha?: number
}

/** Deterministic wobble so blobs look hand-made but don't flicker. */
function wobble(i: number, seed: number): number {
  return Math.sin(i * 2.3 + seed * 1.7) * 0.5 + Math.sin(i * 5.1 + seed) * 0.5
}

function blob(ctx: CanvasRenderingContext2D, rx: number, ry: number, jag: number, seed: number, n = 14): void {
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 1 + jag * wobble(i % n, seed)
    const x = Math.cos(a) * rx * r
    const y = Math.sin(a) * ry * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.quadraticCurveTo(Math.cos(a - Math.PI / n) * rx * (r + jag * 0.6), Math.sin(a - Math.PI / n) * ry * (r + jag * 0.6), x, y)
  }
  ctx.closePath()
}

function specks(ctx: CanvasRenderingContext2D, colors: string[], count: number, rx: number, ry: number, size: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996 + seed
    const d = Math.sqrt((i + 0.5) / count) * 0.8
    ctx.fillStyle = colors[i % colors.length]
    ctx.beginPath()
    ctx.ellipse(Math.cos(a) * rx * d, Math.sin(a) * ry * d, size, size * 0.6, a, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Real sprite loader with fallback to procedural drawing
const foodSprites: Partial<Record<ItemKind, HTMLImageElement>> = {}

function getFoodSprite(kind: ItemKind): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  if (!foodSprites[kind]) {
    const img = new Image()
    const base = (import.meta as any).env?.BASE_URL || './'
    img.src = `${base}assets/${kind}.png`
    foodSprites[kind] = img
  }
  const spr = foodSprites[kind]!
  return spr.complete && spr.naturalWidth > 0 ? spr : null
}

/** Draws one piece centred on (x, y), about `s` wide. */
export function drawFood(ctx: CanvasRenderingContext2D, kind: ItemKind, x: number, y: number, s: number, o: FoodOpts = {}): void {
  const cooked = o.cook !== undefined
  const cook = o.cook ?? 0
  const base: RGB = cooked ? cookColor(kind, cook) : o.battered ? BATTER : LOOKS[kind].raw
  const burnt = cook >= 1.95
  const fill = css(base)
  const edge = css(base, -0.28)
  const hi = css(base, 0.14)
  ctx.save()
  ctx.translate(x, y)
  if (o.rot) ctx.rotate(o.rot)
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha
  const k = s / 40
  ctx.scale(k, k)
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2

  const sprite = getFoodSprite(kind)
  if (sprite) {
    const sw = 38
    const sh = 38 * (sprite.naturalHeight / sprite.naturalWidth)
    if (burnt) {
      ctx.filter = 'brightness(0.25) contrast(1.3)'
    } else if (cooked && cook > 0) {
      const sat = 1 + Math.min(cook, 1.2) * 0.25
      const bri = 0.95 + Math.min(cook, 1.0) * 0.1
      ctx.filter = `saturate(${sat}) brightness(${bri})`
    } else if (o.battered) {
      ctx.filter = 'brightness(1.15) saturate(0.6)'
    }
    ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh)
    ctx.filter = 'none'
    ctx.restore()
    return
  }

  const coat = cooked || o.battered
  switch (kind) {
    case 'bakwan': {
      blob(ctx, 19, 16, 0.14, 1.3, 16)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = edge
      ctx.stroke()
      if (!burnt) specks(ctx, ['#e8792b', '#5f9e3a', '#f2c94c', '#7cb84a'], 9, 14, 11, 2.6, 0.7)
      ctx.save()
      ctx.globalAlpha *= 0.45
      ctx.fillStyle = hi
      ctx.translate(-5, -6)
      blob(ctx, 8, 5, 0.3, 4, 8)
      ctx.fill()
      ctx.restore()
      break
    }
    case 'tahu': {
      ctx.beginPath()
      ctx.moveTo(0, -17)
      ctx.quadraticCurveTo(4, -15, 19, 12)
      ctx.quadraticCurveTo(20, 17, 14, 17)
      ctx.lineTo(-14, 17)
      ctx.quadraticCurveTo(-20, 17, -19, 12)
      ctx.quadraticCurveTo(-4, -15, 0, -17)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = edge
      ctx.stroke()
      // The stuffing peeking out of the slit.
      ctx.fillStyle = burnt ? '#2a1a10' : coat ? '#c98a3a' : '#f3e8c6'
      ctx.beginPath()
      ctx.ellipse(0, 6, 9, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      if (!burnt) specks(ctx, ['#e8792b', '#6fae45'], 5, 7, 3, 1.8, 2)
      break
    }
    case 'pisang': {
      // Pisang kipas: a fan of slices.
      ctx.fillStyle = fill
      ctx.strokeStyle = edge
      ctx.beginPath()
      ctx.moveTo(-6, 16)
      ctx.quadraticCurveTo(-22, 2, -14, -14)
      ctx.quadraticCurveTo(0, -22, 14, -14)
      ctx.quadraticCurveTo(22, 2, 6, 16)
      ctx.quadraticCurveTo(0, 19, -6, 16)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = css(base, -0.18)
      ctx.lineWidth = 1.6
      for (const dx of [-7, 0, 7]) {
        ctx.beginPath()
        ctx.moveTo(dx * 0.4, 13)
        ctx.quadraticCurveTo(dx * 1.1, -2, dx * 1.5, -15)
        ctx.stroke()
      }
      if (!cooked && !o.battered) {
        ctx.fillStyle = '#7a5a2a'
        ctx.fillRect(-3, 14, 6, 4)
      }
      break
    }
    case 'mendoan': {
      ctx.beginPath()
      const w = 21
      const h = 15
      ctx.moveTo(-w, -h)
      for (let i = 0; i <= 6; i++) ctx.lineTo(-w + (i * 2 * w) / 6, -h + (i % 2 ? -2.5 : 1.5))
      for (let i = 0; i <= 4; i++) ctx.lineTo(w + (i % 2 ? 2.5 : -1), -h + (i * 2 * h) / 4)
      for (let i = 0; i <= 6; i++) ctx.lineTo(w - (i * 2 * w) / 6, h + (i % 2 ? 2.5 : -1.5))
      for (let i = 0; i <= 4; i++) ctx.lineTo(-w + (i % 2 ? -2.5 : 1), h - (i * 2 * h) / 4)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = edge
      ctx.stroke()
      if (!burnt) {
        // Tempe beans under the batter, daun bawang on top.
        ctx.fillStyle = coat ? 'rgba(120,80,30,0.18)' : 'rgba(140,110,60,0.5)'
        specks(ctx, [ctx.fillStyle as string], 14, 17, 12, 2.4, 5)
        if (coat) specks(ctx, ['#3f8f3a', '#5fae4a'], 7, 15, 10, 2.2, 3)
      }
      break
    }
    case 'cireng': {
      ctx.beginPath()
      ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = edge
      ctx.stroke()
      ctx.fillStyle = css(base, -0.08)
      for (const [dx, dy] of [
        [-8, -3],
        [6, 4],
        [2, -6],
        [-3, 6],
      ])
        ctx.fillRect(dx, dy, 3, 2)
      break
    }
    case 'combro': {
      blob(ctx, 19, 14, 0.06, 7, 12)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = edge
      ctx.stroke()
      ctx.fillStyle = css(base, -0.15)
      specks(ctx, [css(base, -0.15)], 12, 15, 10, 1.4, 9)
      break
    }
  }
  if (cooked && cook > 0.85 && !burnt) {
    // A bit of shine on golden fried things.
    ctx.globalAlpha *= 0.35
    ctx.fillStyle = '#fff6d8'
    ctx.beginPath()
    ctx.ellipse(-6, -6, 6, 3, -0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function drawChili(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot = -0.5): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.scale(s / 20, s / 20)
  ctx.fillStyle = '#e0261c'
  ctx.beginPath()
  ctx.moveTo(-8, -2)
  ctx.quadraticCurveTo(2, -6, 10, 4)
  ctx.quadraticCurveTo(2, 2, -8, 3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#3c8d2f'
  ctx.fillRect(-11, -2, 4, 4)
  ctx.restore()
}

export function drawSauce(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s / 24, s / 24)
  ctx.fillStyle = '#c7361f'
  ctx.beginPath()
  ctx.roundRect(-6, -6, 12, 16, 3)
  ctx.fill()
  ctx.fillStyle = '#f4f0e6'
  ctx.fillRect(-5, -1, 10, 5)
  ctx.fillStyle = '#c7361f'
  ctx.beginPath()
  ctx.moveTo(-3, -6)
  ctx.lineTo(-1, -12)
  ctx.lineTo(1, -12)
  ctx.lineTo(3, -6)
  ctx.fill()
  ctx.restore()
}

export function drawWrapIcon(ctx: CanvasRenderingContext2D, wrap: 'kertas' | 'plastik', x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s / 24, s / 24)
  if (wrap === 'kertas') {
    ctx.fillStyle = '#efe4c8'
    ctx.strokeStyle = '#a89470'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(-10, -9)
    ctx.lineTo(10, -9)
    ctx.lineTo(0, 11)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = '#b9a988'
    ctx.beginPath()
    ctx.moveTo(-6, -5)
    ctx.lineTo(6, -5)
    ctx.moveTo(-4, -1)
    ctx.lineTo(4, -1)
    ctx.stroke()
  } else {
    ctx.fillStyle = 'rgba(214, 64, 64, 0.85)'
    ctx.strokeStyle = '#8f2020'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(-9, -5)
    ctx.lineTo(9, -5)
    ctx.lineTo(10, 10)
    ctx.lineTo(-10, 10)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(-4, -6, 4, Math.PI, 0)
    ctx.moveTo(8, -6)
    ctx.arc(4, -6, 4, 0, Math.PI, true)
    ctx.stroke()
  }
  ctx.restore()
}
