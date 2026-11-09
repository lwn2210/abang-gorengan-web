import { describe, expect, it } from 'vitest'
import { dayConfig, rupiah } from '../src/sim/menu'
import { DAY_LENGTH, clockAt, createDay, itemCount, makeOrder, step } from '../src/sim/game'

describe('kesulitan per hari', () => {
  it('gets harder every day: more menu, quicker arrivals, shorter patience, higher setoran', () => {
    for (let d = 1; d < 8; d++) {
      const a = dayConfig(d)
      const b = dayConfig(d + 1)
      expect(b.menu.length).toBeGreaterThanOrEqual(a.menu.length)
      expect(b.arrivalEvery).toBeLessThanOrEqual(a.arrivalEvery)
      expect(b.patience).toBeLessThanOrEqual(a.patience)
      expect(b.target).toBeGreaterThan(a.target)
    }
    expect(dayConfig(1).menu).toEqual(['bakwan', 'tahu', 'pisang'])
    expect(dayConfig(2).menu).toContain('mendoan')
    expect(dayConfig(4).menu).toHaveLength(6)
  })

  it('introduces ojol on day 2 and the rewel ones on day 3', () => {
    expect(Object.keys(dayConfig(1).types)).toEqual(['biasa'])
    expect(dayConfig(2).types.ojol).toBeGreaterThan(0)
    expect(dayConfig(2).types.rewel).toBeUndefined()
    expect(dayConfig(3).types.rewel).toBeGreaterThan(0)
    expect(dayConfig(1).wraps).toEqual(['kertas'])
    expect(dayConfig(3).extras).toContain('saus')
  })

  it('only orders what is on the menu, in a wrap that fits', () => {
    for (let d = 1; d <= 6; d++) {
      const s = createDay(d, 99)
      for (let i = 0; i < 300; i++) {
        for (const type of Object.keys(s.config.types) as ('biasa' | 'ojol' | 'rewel')[]) {
          const o = makeOrder(s, type)
          for (const l of o.lines) expect(s.config.menu).toContain(l.kind)
          expect(o.lines.length).toBeLessThanOrEqual(3)
          expect(s.config.wraps).toContain(o.wrap)
          if (itemCount(o) > 4) expect(o.wrap).toBe('plastik')
          if (type === 'ojol') expect(o.wrap).toBe('plastik')
          if (!s.config.extras.includes('saus')) expect(o.saus).toBe(false)
        }
      }
    }
  })

  it('runs 06:00 → 17:00, stops taking customers, and ends once the queue is gone', () => {
    expect(clockAt(0)).toBe('06:00')
    expect(clockAt(DAY_LENGTH / 2)).toBe('11:30')
    expect(clockAt(DAY_LENGTH)).toBe('17:00')
    const s = createDay(1, 3)
    let closedAt = -1
    let lastArrival = -1
    for (let i = 0; i < 60 * 400 && s.phase !== 'over'; i++) {
      for (const e of step(s)) {
        if (e.e === 'closing') closedAt = s.time
        if (e.e === 'arrive') lastArrival = s.time
      }
      // Keep the reputation up so an idle run reaches closing time.
      s.rep = 3
    }
    expect(closedAt).toBeCloseTo(DAY_LENGTH, 1)
    expect(lastArrival).toBeLessThan(DAY_LENGTH)
    expect(s.phase).toBe('over')
    expect(s.customers).toHaveLength(0)
  })

  it('formats rupiah', () => {
    expect(rupiah(0)).toBe('Rp0')
    expect(rupiah(1500)).toBe('Rp1.500')
    expect(rupiah(1234567)).toBe('Rp1.234.567')
  })
})
