import type { Extra, ItemKind, Wrap } from './sim/menu'
import type { Knob } from './sim/game'

// Where everything sits on the cart, in stage units. The stage is a portrait
// 400×760 board scaled to fit the screen; the render draws with these numbers
// and the input hit-tests with the same ones.

export const STAGE_W = 400
export const STAGE_H = 760

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Pt {
  x: number
  y: number
}

export const COUNTER_Y = 318
export const PLANK_H = 26
export const SPOT_X = [56, 152, 248, 344] as const
export const SPOT_W = 94
export const BUBBLE_TOP = 70

export const TRAY: Rect = { x: 8, y: 352, w: 206, h: 140 }
export const TRAY_COLS = 4
export function traySlot(i: number): Rect {
  const col = i % TRAY_COLS
  const row = Math.floor(i / TRAY_COLS)
  return { x: TRAY.x + 3 + col * 50, y: TRAY.y + 4 + row * 68, w: 50, h: 64 }
}

export const MAT: Rect = { x: 220, y: 352, w: 118, h: 92 }
export function matItem(i: number): Pt {
  return { x: MAT.x + 22 + (i % 4) * 25, y: MAT.y + 40 + Math.floor(i / 4) * 27 }
}

export const WRAP_BTN: Record<Wrap, Rect> = {
  kertas: { x: 220, y: 448, w: 57, h: 46 },
  plastik: { x: 281, y: 448, w: 57, h: 46 },
}

export const EXTRA_BTN: Record<Extra, Rect> = {
  cabe: { x: 344, y: 352, w: 50, h: 68 },
  saus: { x: 344, y: 426, w: 50, h: 68 },
}

export const WOK = { x: 140, y: 598, r: 98 }
export const WOK_SLOT_R = 36
export const WOK_SLOTS_AT: readonly Pt[] = [
  { x: 101, y: 560 },
  { x: 179, y: 560 },
  { x: 101, y: 636 },
  { x: 179, y: 636 },
]

export const KNOB: Rect = { x: 256, y: 510, w: 138, h: 44 }
export function knobRect(level: Knob): Rect {
  const w = KNOB.w / 3
  return { x: KNOB.x + level * w, y: KNOB.y, w, h: KNOB.h }
}
export const THERMO: Rect = { x: 258, y: 562, w: 134, h: 12 }

export const TEPUNG = { x: 325, y: 644, r: 48 }

export const BIN_ROW: Rect = { x: 54, y: 700, w: 342, h: 56 }
export const TRASH: Rect = { x: 4, y: 702, w: 44, h: 54 }

export function binRects(menu: readonly ItemKind[]): Rect[] {
  const gap = 4
  const w = Math.min(84, (BIN_ROW.w - gap * (menu.length - 1)) / menu.length)
  const total = w * menu.length + gap * (menu.length - 1)
  const x0 = BIN_ROW.x + (BIN_ROW.w - total) / 2
  return menu.map((_, i) => ({ x: x0 + i * (w + gap), y: BIN_ROW.y, w, h: BIN_ROW.h }))
}

/** Where the held piece hovers when it isn't being dragged. */
export function handRest(menu: readonly ItemKind[], kind: ItemKind): Pt {
  const r = binRects(menu)[Math.max(0, menu.indexOf(kind))]
  return { x: r.x + r.w / 2, y: r.y + 18 }
}

export function inRect(p: Pt, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad
}

export function inCircle(p: Pt, c: Pt, r: number): boolean {
  return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= r * r
}

export type Target =
  | { k: 'bin'; kind: ItemKind }
  | { k: 'tepung' }
  | { k: 'wok'; slot: number }
  | { k: 'wokArea' }
  | { k: 'tray'; slot: number }
  | { k: 'trayArea' }
  | { k: 'mat'; index: number }
  | { k: 'wrap'; wrap: Wrap }
  | { k: 'extra'; extra: Extra }
  | { k: 'knob'; level: Knob }
  | { k: 'customer'; spot: number }
  | { k: 'trash' }

export function hitTest(p: Pt, menu: readonly ItemKind[], matCount: number): Target | null {
  if (p.y < COUNTER_Y + 4) {
    if (p.y < BUBBLE_TOP - 10) return null
    const spot = SPOT_X.findIndex((x) => Math.abs(p.x - x) <= SPOT_W / 2 + 1)
    return spot >= 0 ? { k: 'customer', spot } : null
  }
  for (let i = 0; i < 8; i++) if (inRect(p, traySlot(i))) return { k: 'tray', slot: i }
  if (inRect(p, TRAY)) return { k: 'trayArea' }
  if (inRect(p, MAT, 2)) {
    for (let i = matCount - 1; i >= 0; i--) if (inCircle(p, matItem(i), 13)) return { k: 'mat', index: i }
    return { k: 'mat', index: -1 }
  }
  for (const w of ['kertas', 'plastik'] as const) if (inRect(p, WRAP_BTN[w], 2)) return { k: 'wrap', wrap: w }
  for (const e of ['cabe', 'saus'] as const) if (inRect(p, EXTRA_BTN[e], 2)) return { k: 'extra', extra: e }
  for (const level of [0, 1, 2] as const) if (inRect(p, knobRect(level), 3)) return { k: 'knob', level }
  if (inRect(p, TRASH, 3)) return { k: 'trash' }
  const bins = binRects(menu)
  for (let i = 0; i < bins.length; i++) if (inRect(p, bins[i], 2)) return { k: 'bin', kind: menu[i] }
  if (inCircle(p, TEPUNG, TEPUNG.r + 8)) return { k: 'tepung' }
  let best = -1
  let bestD = Infinity
  WOK_SLOTS_AT.forEach((c, i) => {
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  if (bestD <= (WOK_SLOT_R + 6) ** 2) return { k: 'wok', slot: best }
  if (inCircle(p, WOK, WOK.r + 4)) return { k: 'wokArea' }
  return null
}
