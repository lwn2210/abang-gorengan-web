import { describe, expect, it } from 'vitest'
import { QUEUE_SPOTS, REP_START, REP_WALKOUT, SMOKE_IMPATIENCE, createDay, step } from '../src/sim/game'
import { act, addCustomer, quietDay, run } from './helpers'

const order = { lines: [{ kind: 'bakwan' as const, count: 1 }], cabe: false, saus: false, wrap: 'kertas' as const }

describe('kesabaran & pembeli kabur', () => {
  it('patience runs down one per second, then they walk off and the reputation drops', () => {
    const s = quietDay()
    const c = addCustomer(s, { order, patience: 5, maxPatience: 30 })
    run(s, 2)
    expect(c.patience).toBeCloseTo(3, 1)
    const ev = run(s, 3.5)
    expect(ev).toContainEqual({ e: 'walkout', spot: 0 })
    expect(s.stats.walkouts).toBe(1)
    expect(s.rep).toBeCloseTo(REP_START - REP_WALKOUT)
    expect(act(s, { t: 'serve', spot: 0 })).toContainEqual(expect.objectContaining({ reason: 'noCustomer' }))
    run(s, 2)
    expect(s.customers).toHaveLength(0)
  })

  it('smoking oil makes them impatient faster', () => {
    const s = quietDay()
    const c = addCustomer(s, { order, patience: 30, maxPatience: 30 })
    s.overheated = true
    s.oil = 220
    s.knob = 2
    run(s, 2)
    expect(30 - c.patience).toBeCloseTo(2 * SMOKE_IMPATIENCE, 1)
  })

  it(`never queues more than ${QUEUE_SPOTS}, each in their own spot`, () => {
    const s = createDay(5, 42)
    for (let i = 0; i < 60 * 120; i++) {
      step(s)
      const spots = s.customers.map((c) => c.spot)
      expect(spots.length).toBeLessThanOrEqual(QUEUE_SPOTS)
      expect(new Set(spots).size).toBe(spots.length)
    }
  })

  it('an abang who does nothing loses the day: everyone walks off', () => {
    const s = createDay(1, 7)
    for (let i = 0; i < 60 * 400 && s.phase !== 'over'; i++) step(s)
    expect(s.phase).toBe('over')
    expect(s.failed).toBe(true)
    expect(s.stats.served).toBe(0)
    expect(s.stats.walkouts).toBeGreaterThan(5)
  })
})
