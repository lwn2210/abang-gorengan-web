import { createDay, step, type Action, type Customer, type GameState, type SimEvent } from '../src/sim/game'

/** A day with no customers coming, for poking at the wok and the rack. */
export function quietDay(day = 1, seed = 1): GameState {
  const s = createDay(day, seed)
  s.nextArrival = 1e9
  return s
}

/** Steps `seconds` worth of ticks, applying `actions` on the first one. Returns every event. */
export function run(s: GameState, seconds: number, actions: Action[] = []): SimEvent[] {
  const ev: SimEvent[] = []
  const ticks = Math.round(seconds * 60)
  for (let i = 0; i < ticks; i++) ev.push(...step(s, i === 0 ? actions : []))
  return ev
}

/** Applies actions in a single tick. */
export function act(s: GameState, ...actions: Action[]): SimEvent[] {
  return step(s, actions)
}

/** Steps until `pred` holds; returns the seconds it took (throws past `limit`). */
export function until(s: GameState, pred: (ev: SimEvent[]) => boolean, limit = 60): number {
  for (let i = 0; i < limit * 60; i++) if (pred(step(s, []))) return (i + 1) / 60
  throw new Error('condition never met')
}

let nextId = 1000
export function addCustomer(s: GameState, c: Partial<Customer> & Pick<Customer, 'order'>): Customer {
  const full: Customer = {
    id: nextId++,
    type: 'biasa',
    spot: 0,
    patience: 40,
    maxPatience: 40,
    phase: 'waiting',
    timer: 0,
    happy: false,
    look: 1,
    ...c,
  }
  s.customers.push(full)
  return full
}
