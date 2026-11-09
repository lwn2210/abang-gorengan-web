import { describe, expect, it } from 'vitest'
import { botAct } from '../src/sim/bot'
import { createDay, step, type GameState } from '../src/sim/game'

function play(s: GameState, ticks: number): string[] {
  const log: string[] = []
  for (let i = 0; i < ticks && s.phase !== 'over'; i++) {
    const a = i % 27 === 0 ? botAct(s) : null
    for (const e of step(s, a ? [a] : [])) log.push(`${s.tick}:${JSON.stringify(e)}`)
  }
  return log
}

describe('determinisme', () => {
  it('same seed and actions → same day, event for event', () => {
    const a = createDay(3, 1234)
    const b = createDay(3, 1234)
    expect(play(a, 60 * 200)).toEqual(play(b, 60 * 200))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('a different seed → a different queue', () => {
    const a = createDay(2, 1)
    const b = createDay(2, 2)
    play(a, 60 * 60)
    play(b, 60 * 60)
    expect(JSON.stringify(a.customers)).not.toBe(JSON.stringify(b.customers))
  })

  it('the state survives JSON mid-day and carries on identically', () => {
    const a = createDay(4, 77)
    play(a, 60 * 70)
    const b = JSON.parse(JSON.stringify(a)) as GameState
    expect(play(a, 60 * 90)).toEqual(play(b, 60 * 90))
    expect(b).toEqual(a)
  })
})
