import { describe, expect, it } from 'vitest'
import { EXTRA_BTN, SPOT_X, TEPUNG, TRASH, WOK_SLOTS_AT, WRAP_BTN, binRects, hitTest, knobRect, matItem, traySlot } from '../src/layout'
import { dayConfig } from '../src/sim/menu'

const center = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

describe('hit-testing di gerobak', () => {
  it('finds every station at its own centre', () => {
    const menu = dayConfig(6).menu
    WOK_SLOTS_AT.forEach((p, slot) => expect(hitTest(p, menu, 0)).toEqual({ k: 'wok', slot }))
    for (let slot = 0; slot < 8; slot++) expect(hitTest(center(traySlot(slot)), menu, 0)).toEqual({ k: 'tray', slot })
    binRects(menu).forEach((r, i) => expect(hitTest(center(r), menu, 0)).toEqual({ k: 'bin', kind: menu[i] }))
    for (const level of [0, 1, 2] as const) expect(hitTest(center(knobRect(level)), menu, 0)).toEqual({ k: 'knob', level })
    expect(hitTest(center(WRAP_BTN.plastik), menu, 0)).toEqual({ k: 'wrap', wrap: 'plastik' })
    expect(hitTest(center(EXTRA_BTN.saus), menu, 0)).toEqual({ k: 'extra', extra: 'saus' })
    expect(hitTest(TEPUNG, menu, 0)).toEqual({ k: 'tepung' })
    expect(hitTest(center(TRASH), menu, 0)).toEqual({ k: 'trash' })
    SPOT_X.forEach((x, spot) => expect(hitTest({ x, y: 250 }, menu, 0)).toEqual({ k: 'customer', spot }))
  })

  it('tells packed pieces apart from the empty mat', () => {
    const menu = dayConfig(1).menu
    expect(hitTest(matItem(2), menu, 3)).toEqual({ k: 'mat', index: 2 })
    expect(hitTest(matItem(5), menu, 3)).toEqual({ k: 'mat', index: -1 })
  })

  it('keeps touch targets at least 44 units', () => {
    for (const n of [3, 6]) for (const r of binRects(dayConfig(n).menu)) expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(44)
    expect(traySlot(0).w).toBeGreaterThanOrEqual(44)
    expect(knobRect(0).h).toBeGreaterThanOrEqual(44)
  })
})
