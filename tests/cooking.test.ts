import { describe, expect, it } from 'vitest'
import { ITEMS } from '../src/sim/menu'
import {
  KNOB_TARGET,
  LOAD_DROP,
  OVERHEAT,
  OVERHEAT_WINDOW,
  REP_BURNT,
  WOK_SLOTS,
  burnPoint,
  cookSpeed,
  zone,
  type GameState,
} from '../src/sim/game'
import { act, quietDay, run, until } from './helpers'

function fryOne(s: GameState, kind: 'bakwan' | 'tahu' = 'bakwan', slot = 0): void {
  act(s, { t: 'take', kind })
  if (kind === 'tahu') act(s, { t: 'dip' })
  act(s, { t: 'fry', slot })
}

describe('kematangan', () => {
  it('cooks at normal speed at 180 °C, slower when cooler, faster when hotter', () => {
    expect(cookSpeed(180)).toBeCloseTo(1)
    expect(cookSpeed(150)).toBeLessThan(1)
    expect(cookSpeed(210)).toBeGreaterThan(1)
    expect(cookSpeed(20)).toBeGreaterThan(0)
  })

  it('goes mentah → pas → gosong, with a ting at pas', () => {
    const s = quietDay()
    fryOne(s)
    const f = s.wok[0]!
    expect(zone(f)).toBe('mentah')
    const toPas = until(s, (ev) => ev.some((e) => e.e === 'ding'))
    expect(zone(f)).toBe('pas')
    // Close to its cook time at around normal heat (the cold piece slows it a bit).
    expect(toPas).toBeGreaterThan(ITEMS.bakwan.cookTime * 0.9)
    expect(toPas).toBeLessThan(ITEMS.bakwan.cookTime * 1.4)
    const repBefore = s.rep
    const toBurn = until(s, (ev) => ev.some((e) => e.e === 'burnt'))
    expect(zone(f)).toBe('gosong')
    expect(toBurn).toBeGreaterThan(ITEMS.bakwan.cookTime * ITEMS.bakwan.window * 0.7)
    expect(s.rep).toBeCloseTo(repBefore - REP_BURNT)
    expect(s.stats.burnt).toBe(1)
  })

  it('will not lift a raw piece; a pas one goes on the rack; a burnt one goes in the bin', () => {
    const s = quietDay()
    fryOne(s, 'bakwan', 0)
    const ev = act(s, { t: 'lift', slot: 0 })
    expect(ev).toContainEqual(expect.objectContaining({ e: 'nope', reason: 'raw' }))
    expect(s.wok[0]).not.toBeNull()

    until(s, (e) => e.some((x) => x.e === 'ding'))
    act(s, { t: 'lift', slot: 0 })
    expect(s.wok[0]).toBeNull()
    expect(s.tray[0]).toMatchObject({ kind: 'bakwan', age: expect.any(Number) })

    fryOne(s, 'bakwan', 1)
    until(s, (e) => e.some((x) => x.e === 'burnt'))
    const binned = act(s, { t: 'lift', slot: 1 })
    expect(binned).toContainEqual({ e: 'trash', what: 'gosong', slot: 1 })
    expect(s.wok[1]).toBeNull()
    expect(s.tray.filter(Boolean)).toHaveLength(1)
  })

  it('needs the flour for tahu isi but not for bakwan', () => {
    const s = quietDay()
    act(s, { t: 'take', kind: 'tahu' })
    const ev = act(s, { t: 'fry', slot: 0 })
    expect(ev).toContainEqual(expect.objectContaining({ e: 'nope', reason: 'needBatter' }))
    expect(s.hand).toEqual({ kind: 'tahu', battered: false })
    act(s, { t: 'dip' })
    act(s, { t: 'fry', slot: 0 })
    expect(s.wok[0]?.kind).toBe('tahu')
    expect(s.hand).toBeNull()

    act(s, { t: 'take', kind: 'bakwan' })
    expect(act(s, { t: 'dip' })).toContainEqual(expect.objectContaining({ e: 'nope', reason: 'noBatter' }))
  })

  it('a cold piece cools the oil', () => {
    const s = quietDay()
    run(s, 20)
    const before = s.oil
    act(s, { t: 'take', kind: 'bakwan' }, { t: 'fry', slot: 0 })
    expect(s.oil).toBeLessThan(before - LOAD_DROP * 0.9)
  })
})

describe('kompor & minyak', () => {
  it('besar overheats the oil, and overheated oil burns things sooner', () => {
    const s = quietDay()
    const ev = run(s, 15, [{ t: 'knob', level: 2 }])
    expect(ev).toContainEqual({ e: 'overheat', on: true })
    expect(s.overheated).toBe(true)
    expect(s.oil).toBeGreaterThanOrEqual(OVERHEAT - 4)
    expect(s.oil).toBeLessThan(KNOB_TARGET[2] + 1)
    expect(burnPoint('bakwan', true)).toBeCloseTo(1 + ITEMS.bakwan.window * OVERHEAT_WINDOW)

    // Same piece, normal vs kepanasan: time from ting to gosong.
    const normal = quietDay()
    fryOne(normal)
    until(normal, (e) => e.some((x) => x.e === 'ding'))
    const calm = until(normal, (e) => e.some((x) => x.e === 'burnt'))

    fryOne(s)
    until(s, (e) => e.some((x) => x.e === 'ding'))
    const hot = until(s, (e) => e.some((x) => x.e === 'burnt'))
    expect(hot).toBeLessThan(calm * 0.6)
  })

  it('kecil cools it back down and the smoke clears', () => {
    const s = quietDay()
    run(s, 15, [{ t: 'knob', level: 2 }])
    const ev = run(s, 15, [{ t: 'knob', level: 0 }])
    expect(ev).toContainEqual({ e: 'overheat', on: false })
    expect(s.oil).toBeLessThan(170)
  })
})

describe('slot wajan', () => {
  it(`holds ${WOK_SLOTS} pieces and refuses a busy slot`, () => {
    const s = quietDay()
    for (let i = 0; i < WOK_SLOTS; i++) fryOne(s, 'bakwan', i)
    expect(s.wok.every(Boolean)).toBe(true)
    act(s, { t: 'take', kind: 'bakwan' })
    const ev = act(s, { t: 'fry', slot: 0 })
    expect(ev).toContainEqual(expect.objectContaining({ e: 'nope', reason: 'wokBusy', slot: 0 }))
    expect(act(s, { t: 'fry', slot: WOK_SLOTS })).toContainEqual(expect.objectContaining({ reason: 'wokBusy' }))
    expect(s.hand).not.toBeNull()
  })

  it('cannot lift onto a full rack, so the piece keeps frying', () => {
    const s = quietDay()
    s.tray = s.tray.map((_, i) => ({ id: 500 + i, kind: 'bakwan' as const, age: 0 }))
    fryOne(s)
    until(s, (e) => e.some((x) => x.e === 'ding'))
    expect(act(s, { t: 'lift', slot: 0 })).toContainEqual(expect.objectContaining({ reason: 'trayFull' }))
    expect(s.wok[0]).not.toBeNull()
    act(s, { t: 'discard', slot: 3 })
    act(s, { t: 'lift', slot: 0 })
    expect(s.tray[3]?.kind).toBe('bakwan')
    expect(s.wok[0]).toBeNull()
  })
})
