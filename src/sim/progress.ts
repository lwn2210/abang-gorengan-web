import { REP_START, earnings, type GameState } from './game'

// Between days: the summary, what carries over, and the records. Pure; the app
// does the localStorage part.

export interface DayResult {
  day: number
  earnings: number
  sales: number
  tips: number
  served: number
  walkouts: number
  burnt: number
  wrong: number
  sold: number
  target: number
  rep: number
  repDelta: number
  passed: boolean
  /** Why it didn't pass. */
  fail: 'rep' | 'target' | null
}

export function dayResult(s: GameState): DayResult {
  const total = earnings(s)
  const fail = s.failed ? 'rep' : total < s.config.target ? 'target' : null
  return {
    day: s.day,
    earnings: total,
    sales: s.stats.sales,
    tips: s.stats.tips,
    served: s.stats.served,
    walkouts: s.stats.walkouts,
    burnt: s.stats.burnt,
    wrong: s.stats.wrong,
    sold: s.stats.sold,
    target: s.config.target,
    rep: s.rep,
    repDelta: s.rep - s.repStart,
    passed: fail === null,
    fail,
  }
}

export interface Upgrades {
  turboStove: number
  cabeSetan: number
  esTeh: number
  minyakEmas: number
}

export const DEFAULT_UPGRADES: Upgrades = {
  turboStove: 0,
  cabeSetan: 0,
  esTeh: 0,
  minyakEmas: 0,
}

export interface Progress {
  /** The day to play next. */
  day: number
  /** Reputation going into it. */
  rep: number
  /** Accumulated savings for the upgrade shop. */
  savings?: number
  /** Purchased shop upgrades. */
  upgrades?: Upgrades
}

export const NEW_GAME: Progress = { day: 1, rep: REP_START, savings: 0, upgrades: { ...DEFAULT_UPGRADES } }

/** Passing moves on with the reputation earned; failing replays the day as it started. */
export function nextProgress(s: GameState, current?: Progress): Progress {
  const r = dayResult(s)
  const base = r.passed ? { day: s.day + 1, rep: s.rep } : { day: s.day, rep: s.repStart }
  if (current) {
    const savings = (current.savings ?? 0) + (r.passed ? r.earnings : 0)
    const upgrades = current.upgrades ?? { ...DEFAULT_UPGRADES }
    return { ...base, savings, upgrades }
  }
  return base
}

export interface Records {
  /** Best single-day takings and the day it happened. */
  bestEarnings: number
  bestEarningsDay: number
  /** Highest day cleared. */
  bestDay: number
  totalServed: number
}

export const NO_RECORDS: Records = { bestEarnings: 0, bestEarningsDay: 0, bestDay: 0, totalServed: 0 }

export function updateRecords(r: Records, res: DayResult): { records: Records; newBest: boolean } {
  const newBest = res.earnings > r.bestEarnings
  return {
    newBest,
    records: {
      bestEarnings: newBest ? res.earnings : r.bestEarnings,
      bestEarningsDay: newBest ? res.day : r.bestEarningsDay,
      bestDay: res.passed ? Math.max(r.bestDay, res.day) : r.bestDay,
      totalServed: r.totalServed + res.served,
    },
  }
}

/** Reads untrusted JSON (localStorage) back into a record, falling back field by field. */
export function parseRecords(raw: string | null): Records {
  try {
    const o = JSON.parse(raw ?? '{}') as Partial<Records>
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
    return {
      bestEarnings: num(o.bestEarnings, 0),
      bestEarningsDay: num(o.bestEarningsDay, 0),
      bestDay: num(o.bestDay, 0),
      totalServed: num(o.totalServed, 0),
    }
  } catch {
    return { ...NO_RECORDS }
  }
}

export function parseProgress(raw: string | null): Progress {
  try {
    const o = JSON.parse(raw ?? '{}') as Partial<Progress>
    const day = typeof o.day === 'number' && o.day >= 1 ? Math.floor(o.day) : 1
    const rep = typeof o.rep === 'number' && o.rep > 0 && o.rep <= 5 ? o.rep : REP_START
    const res: Progress = { day, rep }
    if (typeof o.savings === 'number' && o.savings >= 0) res.savings = o.savings
    if (o.upgrades && typeof o.upgrades === 'object') res.upgrades = { ...DEFAULT_UPGRADES, ...o.upgrades }
    return res
  } catch {
    return { ...NEW_GAME }
  }
}
