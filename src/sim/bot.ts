import { ITEMS, type ItemKind } from './menu'
import {
  COLD_TIME,
  checkOrder,
  firstFree,
  isDrained,
  step,
  type Action,
  type Customer,
  type GameState,
  type Knob,
  type PackedItem,
  type TrayItem,
} from './game'

// A greedy abang that plays through the same actions a player taps. It backs
// the menu's background demo and the balance tests. One action per call; the
// caller decides how often it gets to act (that's its "tap speed").

/** Would this customer take this piece? Undrained ones never; cold ones not for the rewel. */
function acceptable(c: Customer, it: TrayItem | PackedItem): boolean {
  if ('oily' in it ? it.oily : !isDrained(it)) return false
  return c.type !== 'rewel' || it.age < COLD_TIME - 3
}

function waitingByUrgency(s: GameState): Customer[] {
  return s.customers.filter((c) => c.phase === 'waiting').sort((a, b) => a.patience - b.patience)
}

function canFill(s: GameState, c: Customer): boolean {
  for (const line of c.order.lines) {
    let have = 0
    for (const it of s.tray) if (it && it.kind === line.kind && acceptable(c, it)) have++
    for (const it of s.bungkus?.items ?? []) if (it.kind === line.kind && acceptable(c, it)) have++
    if (have < line.count) return false
  }
  return true
}

/** Next action towards a bungkus that's exactly this customer's order. */
function fillFor(s: GameState, c: Customer): Action {
  const need = new Map<ItemKind, number>()
  for (const l of c.order.lines) need.set(l.kind, l.count)
  const b = s.bungkus
  if (b) {
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i]
      const left = need.get(it.kind) ?? 0
      if (left <= 0 || !acceptable(c, it)) return firstFree(s.tray) >= 0 ? { t: 'unpack', index: i } : { t: 'trashBungkus' }
      need.set(it.kind, left - 1)
    }
  }
  if (!b || b.wrap !== c.order.wrap) return { t: 'wrap', wrap: c.order.wrap }
  for (const [kind, left] of need) {
    if (left <= 0) continue
    let best = -1
    s.tray.forEach((it, i) => {
      if (!it || it.kind !== kind || !acceptable(c, it)) return
      const cur = s.tray[best]
      // Sell the oldest first, except to the fussy ones.
      if (best < 0 || (c.type === 'rewel' ? it.age < cur!.age : it.age > cur!.age)) best = i
    })
    if (best >= 0) return { t: 'pack', slot: best }
  }
  if (b.cabe !== c.order.cabe) return { t: 'extra', extra: 'cabe' }
  if (b.saus !== c.order.saus) return { t: 'extra', extra: 'saus' }
  return { t: 'serve', spot: c.spot }
}

function wantKnob(s: GameState): Knob {
  const raw = s.wok.filter((f) => f && !f.dinged).length
  if (s.oil >= 199) return 0
  if (s.knob === 0 && s.oil < 184) return 1
  if (s.knob === 2 && s.oil >= 192) return 1
  if (s.knob === 1 && raw >= 2 && s.oil < 168) return 2
  return s.knob
}

/** The kind the most impatient unmet order is still short of, after counting everything already in the works. */
function mostUrgentShortfall(s: GameState): ItemKind | null {
  const supply = new Map<ItemKind, number>()
  const add = (k: ItemKind) => supply.set(k, (supply.get(k) ?? 0) + 1)
  for (const it of s.tray) if (it) add(it.kind)
  for (const f of s.wok) if (f && !f.burnt) add(f.kind)
  for (const it of s.bungkus?.items ?? []) add(it.kind)
  if (s.hand) add(s.hand.kind)
  const queue = s.customers.filter((c) => c.phase !== 'leaving').sort((a, b) => a.patience - b.patience)
  for (const c of queue) {
    for (const l of c.order.lines) {
      const have = supply.get(l.kind) ?? 0
      if (have < l.count) return l.kind
      supply.set(l.kind, have - l.count)
    }
  }
  return null
}

export function botAct(s: GameState): Action | null {
  if (s.phase === 'over') return null

  // Out of the oil the moment it's pas; burnt ones go in the bin.
  for (let i = 0; i < s.wok.length; i++) if (s.wok[i]?.burnt) return { t: 'lift', slot: i }
  const trayFree = firstFree(s.tray) >= 0
  for (let i = 0; i < s.wok.length; i++) if (s.wok[i]?.dinged && trayFree) return { t: 'lift', slot: i }

  const knob = wantKnob(s)
  if (knob !== s.knob) return { t: 'knob', level: knob }

  const waiting = waitingByUrgency(s)
  if (s.bungkus && s.bungkus.items.length > 0) {
    const match = waiting.find((c) => checkOrder(c, s.bungkus!) === null)
    if (match) return { t: 'serve', spot: match.spot }
  }
  const target = waiting.find((c) => canFill(s, c))
  if (target) return fillFor(s, target)
  if (s.bungkus && s.bungkus.items.length > 0 && firstFree(s.tray) >= 0) return { t: 'unpack', index: 0 }

  // Nothing to hand over yet: keep the wok busy with what the queue is short of.
  const empty = firstFree(s.wok)
  if (s.hand) {
    if (ITEMS[s.hand.kind].needsBatter && !s.hand.battered) return { t: 'dip' }
    if (empty >= 0) return { t: 'fry', slot: empty }
    return null
  }
  if (empty >= 0) {
    const kind = mostUrgentShortfall(s)
    if (kind) return { t: 'take', kind }
  }
  // Rack clogged with things nobody wants: bin the coldest.
  if (!trayFree && s.wok.some((f) => f?.dinged)) {
    let coldest = 0
    s.tray.forEach((it, i) => {
      if (it && it.age > s.tray[coldest]!.age) coldest = i
    })
    return { t: 'discard', slot: coldest }
  }
  return null
}

/** Plays a whole day with the bot acting every `every` ticks. Returns the final state. */
export function botDay(s: GameState, every: number, maxTicks = 60 * 60 * 6): GameState {
  for (let i = 0; i < maxTicks && s.phase !== 'over'; i++) {
    const a = i % every === 0 ? botAct(s) : null
    step(s, a ? [a] : [])
  }
  return s
}
