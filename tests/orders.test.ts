import { describe, expect, it } from 'vitest'
import {
  COLD_TIME,
  DRAIN_TIME,
  REP_SERVED,
  REP_TIP,
  WRONG_PENALTY,
  checkOrder,
  orderPrice,
  tipFor,
  type Bungkus,
  type Order,
} from '../src/sim/game'
import { act, addCustomer, quietDay, run } from './helpers'

const order: Order = { lines: [{ kind: 'bakwan', count: 2 }, { kind: 'tahu', count: 1 }], cabe: true, saus: false, wrap: 'kertas' }

function bungkus(over: Partial<Bungkus> = {}): Bungkus {
  return {
    wrap: 'kertas',
    cabe: true,
    saus: false,
    items: [
      { id: 1, kind: 'tahu', age: 5, oily: false },
      { id: 2, kind: 'bakwan', age: 5, oily: false },
      { id: 3, kind: 'bakwan', age: 5, oily: false },
    ],
    ...over,
  }
}

describe('pesanan cocok / tidak', () => {
  it('accepts the exact order in any packing order', () => {
    expect(checkOrder({ order, type: 'biasa' }, bungkus())).toBeNull()
  })

  it('names what is wrong', () => {
    const b = bungkus()
    expect(checkOrder({ order, type: 'biasa' }, { ...b, items: b.items.slice(1) })).toBe('items')
    expect(checkOrder({ order, type: 'biasa' }, { ...b, items: [...b.items, { id: 9, kind: 'tahu', age: 5, oily: false }] })).toBe('items')
    expect(checkOrder({ order, type: 'biasa' }, { ...b, items: b.items.map((it) => ({ ...it, kind: 'pisang' as const })) })).toBe('items')
    expect(checkOrder({ order, type: 'biasa' }, bungkus({ wrap: 'plastik' }))).toBe('wrap')
    expect(checkOrder({ order, type: 'biasa' }, bungkus({ cabe: false }))).toBe('cabe')
    expect(checkOrder({ order, type: 'biasa' }, bungkus({ saus: true }))).toBe('saus')
  })

  it('the rewel ones refuse oily or cold gorengan; others take it', () => {
    const oily = bungkus({ items: bungkus().items.map((it, i) => ({ ...it, oily: i === 0 })) })
    const cold = bungkus({ items: bungkus().items.map((it, i) => ({ ...it, age: i === 0 ? COLD_TIME + 1 : 5 })) })
    expect(checkOrder({ order, type: 'rewel' }, oily)).toBe('oily')
    expect(checkOrder({ order, type: 'rewel' }, cold)).toBe('cold')
    expect(checkOrder({ order, type: 'biasa' }, oily)).toBeNull()
    expect(checkOrder({ order, type: 'ojol' }, cold)).toBeNull()
  })

  it('packing straight off the oil makes it oily; after draining it is not', () => {
    const s = quietDay()
    s.tray[0] = { id: 1, kind: 'bakwan', age: 0 }
    s.tray[1] = { id: 2, kind: 'bakwan', age: DRAIN_TIME + 0.1 }
    act(s, { t: 'pack', slot: 0 }, { t: 'pack', slot: 1 })
    expect(s.bungkus?.wrap).toBe('kertas')
    expect(s.bungkus?.items.map((it) => it.oily)).toEqual([true, false])
  })

  it('kertas holds 4, plastik more; can switch wraps while it fits', () => {
    const s = quietDay(2)
    s.tray = s.tray.map((_, i) => ({ id: 10 + i, kind: 'bakwan' as const, age: 5 }))
    for (let i = 0; i < 4; i++) act(s, { t: 'pack', slot: i })
    expect(act(s, { t: 'pack', slot: 4 })).toContainEqual(expect.objectContaining({ reason: 'wrapFull' }))
    act(s, { t: 'wrap', wrap: 'plastik' })
    act(s, { t: 'pack', slot: 4 })
    expect(s.bungkus).toMatchObject({ wrap: 'plastik' })
    expect(s.bungkus?.items).toHaveLength(5)
    expect(act(s, { t: 'wrap', wrap: 'kertas' })).toContainEqual(expect.objectContaining({ reason: 'wrapFull' }))
    act(s, { t: 'unpack', index: 0 })
    expect(s.bungkus?.items).toHaveLength(4)
    expect(s.tray.filter(Boolean)).toHaveLength(4)
  })

  it('day 1 has no plastik and no saus yet', () => {
    const s = quietDay(1)
    expect(act(s, { t: 'wrap', wrap: 'plastik' })).toContainEqual(expect.objectContaining({ reason: 'notToday' }))
    expect(act(s, { t: 'extra', extra: 'saus' })).toContainEqual(expect.objectContaining({ reason: 'notToday' }))
    act(s, { t: 'extra', extra: 'cabe' })
    expect(s.bungkus).toMatchObject({ wrap: 'kertas', cabe: true })
  })

  it('a wrong bungkus costs patience and stays in hand', () => {
    const s = quietDay()
    const c = addCustomer(s, { order, spot: 2 })
    s.bungkus = bungkus({ cabe: false })
    const ev = act(s, { t: 'serve', spot: 2 })
    expect(ev).toContainEqual({ e: 'wrong', spot: 2, reason: 'cabe' })
    expect(c.patience).toBeCloseTo(40 - WRONG_PENALTY * 40 - 1 / 60)
    expect(c.phase).toBe('waiting')
    expect(s.bungkus).not.toBeNull()
    expect(s.stats.wrong).toBe(1)
  })
})

describe('pendapatan & tip', () => {
  it('prices the order', () => {
    expect(orderPrice(order)).toBe(1500 * 2 + 1500)
  })

  it('tips 25% (rounded up to Rp500) when quick, 10% when so-so, nothing when slow', () => {
    const b = bungkus()
    expect(tipFor({ order, type: 'biasa', patience: 30, maxPatience: 40 }, b)).toBe(1500)
    expect(tipFor({ order, type: 'biasa', patience: 16, maxPatience: 40 }, b)).toBe(500)
    expect(tipFor({ order, type: 'biasa', patience: 5, maxPatience: 40 }, b)).toBe(0)
  })

  it('ojol tips double; oily or cold food gets no tip', () => {
    const b = bungkus()
    expect(tipFor({ order, type: 'ojol', patience: 30, maxPatience: 40 }, b)).toBe(2500)
    expect(tipFor({ order, type: 'biasa', patience: 40, maxPatience: 40 }, bungkus({ items: b.items.map((it) => ({ ...it, oily: true })) }))).toBe(0)
    expect(tipFor({ order, type: 'biasa', patience: 40, maxPatience: 40 }, bungkus({ items: b.items.map((it) => ({ ...it, age: COLD_TIME })) }))).toBe(0)
  })

  it('serving pays, raises the reputation and sends the customer off happy', () => {
    const s = quietDay()
    const c = addCustomer(s, { order, spot: 1, patience: 39 })
    s.bungkus = bungkus()
    const rep = s.rep
    const ev = act(s, { t: 'serve', spot: 1 })
    expect(ev).toContainEqual({ e: 'serve', spot: 1, pay: 4500, tip: 1500, type: 'biasa' })
    expect(s.stats).toMatchObject({ sales: 4500, tips: 1500, served: 1, sold: 3 })
    expect(s.rep).toBeCloseTo(rep + REP_SERVED + REP_TIP)
    expect(s.bungkus).toBeNull()
    expect(c).toMatchObject({ phase: 'leaving', happy: true })
    run(s, 2)
    expect(s.customers).toHaveLength(0)
  })
})
