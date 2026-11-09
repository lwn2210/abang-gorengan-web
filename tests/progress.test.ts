import { describe, expect, it } from 'vitest'
import { botDay } from '../src/sim/bot'
import { createDay } from '../src/sim/game'
import { NO_RECORDS, dayResult, nextProgress, parseProgress, parseRecords, updateRecords } from '../src/sim/progress'

// Balance: a bot tapping every half second (a decent player) should clear the
// early days; tapping every 0.8 s (still learning) should clear day 1.
const SEEDS = [11, 222, 3333]

describe('balancing', () => {
  it('a decent player clears days 1–4', () => {
    for (let day = 1; day <= 4; day++) {
      for (const seed of SEEDS) {
        const r = dayResult(botDay(createDay(day, seed), 30))
        expect(r.passed, `day ${day} seed ${seed}: ${r.earnings} / ${r.target}`).toBe(true)
      }
    }
  })

  it('a slow beginner still clears day 1, but not day 4', () => {
    for (const seed of SEEDS) {
      expect(dayResult(botDay(createDay(1, seed), 48)).passed).toBe(true)
      expect(dayResult(botDay(createDay(4, seed), 48)).passed).toBe(false)
    }
  })
})

describe('akhir hari & rekor', () => {
  it('passing carries the reputation to the next day; failing replays the day as it began', () => {
    const won = botDay(createDay(1, 5, 3), 30)
    expect(nextProgress(won)).toEqual({ day: 2, rep: won.rep })
    const idle = createDay(2, 5, 4)
    botDay(idle, 1e9)
    expect(dayResult(idle).passed).toBe(false)
    expect(nextProgress(idle)).toEqual({ day: 2, rep: 4 })
  })

  it('keeps the best takings and the furthest day cleared', () => {
    const base = { day: 2, sales: 0, tips: 0, served: 10, walkouts: 0, burnt: 0, wrong: 0, sold: 0, target: 1, rep: 3, repDelta: 0, fail: null }
    const a = updateRecords(NO_RECORDS, { ...base, earnings: 50000, passed: true })
    expect(a).toEqual({ newBest: true, records: { bestEarnings: 50000, bestEarningsDay: 2, bestDay: 2, totalServed: 10 } })
    const b = updateRecords(a.records, { ...base, day: 3, earnings: 40000, passed: false, fail: 'target' })
    expect(b).toEqual({ newBest: false, records: { bestEarnings: 50000, bestEarningsDay: 2, bestDay: 2, totalServed: 20 } })
  })

  it('reads junk from localStorage safely', () => {
    expect(parseRecords(null)).toEqual(NO_RECORDS)
    expect(parseRecords('{"bestEarnings":"lots","bestDay":4}')).toEqual({ ...NO_RECORDS, bestDay: 4 })
    expect(parseRecords('not json')).toEqual(NO_RECORDS)
    expect(parseProgress('{"day":3.7,"rep":9}')).toEqual({ day: 3, rep: 3 })
    expect(parseProgress('{"day":-1}')).toEqual({ day: 1, rep: 3 })
  })
})
