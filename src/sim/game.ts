import { ITEMS, UNLOCK_ORDER, WRAP_CAPACITY, dayConfig, type CustomerType, type DayConfig, type Extra, type ItemKind, type Wrap } from './menu'
import { pick, pickWeighted, rand, randInt, randRange, seedRng } from './rng'

// One trading day as plain data and one step function. No DOM, no clocks, no
// Math.random: the same seed and the same actions always give the same day,
// and the state survives JSON, so the browser, the bot and the tests all run
// it unchanged.

export const TICK_HZ = 60
export const DT = 1 / TICK_HZ
/** Seconds of trading, 06:00 → 17:00. */
export const DAY_LENGTH = 180
export const OPEN_HOUR = 6
export const CLOSE_HOUR = 17

export const WOK_SLOTS = 4
export const TRAY_SLOTS = 8
export const QUEUE_SPOTS = 4

/** Oil temperature each stove setting heads towards (kecil, sedang, besar). */
export const KNOB_TARGET = [150, 180, 228] as const
export type Knob = 0 | 1 | 2
export const OIL_START = 176
/** Above this the oil smokes: things burn sooner and customers get antsy. */
export const OVERHEAT = 205
const OVERHEAT_OFF = 201
const HEAT_TAU = 5
/** A cold, raw piece dropped in knocks this much off the oil. */
export const LOAD_DROP = 6
/** And keeps cooling it this much per second until it's done. */
const RAW_COOLING = 0.8
/** While overheated the "pas" window shrinks to this fraction. */
export const OVERHEAT_WINDOW = 0.6

/** Seconds on the rack before a piece stops dripping oil. */
export const DRAIN_TIME = 1.5
/** Seconds on the rack before a piece is cold. */
export const COLD_TIME = 45

export const ARRIVE_TIME = 1
export const LEAVE_TIME = 1.2
/** A wrong bungkus costs this share of the customer's patience. */
export const WRONG_PENALTY = 0.2
export const SMOKE_IMPATIENCE = 1.35
export const BASE_PATIENCE: Record<CustomerType, number> = { biasa: 50, ojol: 30, rewel: 38 }
/** Extra patience per item beyond the first. */
const PATIENCE_PER_ITEM = 5

export const REP_START = 3
export const REP_MAX = 5
export const REP_SERVED = 0.12
export const REP_TIP = 0.04
export const REP_WALKOUT = 0.35
export const REP_BURNT = 0.1

export interface Fryer {
  id: number
  kind: ItemKind
  /** Seconds of cooking at normal heat so far. */
  cook: number
  /** Reached "pas" (the ting has played). */
  dinged: boolean
  burnt: boolean
}

export interface TrayItem {
  id: number
  kind: ItemKind
  /** Seconds since it came out of the oil. */
  age: number
}

export interface PackedItem extends TrayItem {
  /** Packed before it finished dripping. */
  oily: boolean
}

export interface Bungkus {
  wrap: Wrap
  items: PackedItem[]
  cabe: boolean
  saus: boolean
}

export interface OrderLine {
  kind: ItemKind
  count: number
}

export interface Order {
  lines: OrderLine[]
  cabe: boolean
  saus: boolean
  wrap: Wrap
}

export interface Customer {
  id: number
  type: CustomerType
  /** Queue position in front of the cart, 0..QUEUE_SPOTS-1. */
  spot: number
  order: Order
  patience: number
  maxPatience: number
  phase: 'arriving' | 'waiting' | 'leaving'
  /** Counts down the walk in / walk out. */
  timer: number
  happy: boolean
  /** Seed for how they look; the render's business. */
  look: number
}

export interface Hand {
  kind: ItemKind
  battered: boolean
}

export interface DayStats {
  sales: number
  tips: number
  served: number
  walkouts: number
  burnt: number
  wrong: number
  sold: number
}

export interface GameState {
  day: number
  config: DayConfig
  rng: number
  tick: number
  /** Seconds since the cart opened. */
  time: number
  phase: 'open' | 'closing' | 'over'
  /** Reputation hit zero. */
  failed: boolean
  knob: Knob
  oil: number
  overheated: boolean
  wok: (Fryer | null)[]
  tray: (TrayItem | null)[]
  hand: Hand | null
  bungkus: Bungkus | null
  customers: Customer[]
  nextArrival: number
  nextId: number
  rep: number
  repStart: number
  stats: DayStats
  upgrades?: {
    turboStove?: number
    cabeSetan?: number
    esTeh?: number
    minyakEmas?: number
  }
}

export type Action =
  | { t: 'take'; kind: ItemKind }
  | { t: 'drop' }
  | { t: 'dip' }
  | { t: 'fry'; slot: number }
  | { t: 'lift'; slot: number }
  | { t: 'knob'; level: Knob }
  | { t: 'wrap'; wrap: Wrap }
  | { t: 'pack'; slot: number }
  | { t: 'unpack'; index: number }
  | { t: 'extra'; extra: Extra }
  | { t: 'serve'; spot: number }
  | { t: 'discard'; slot: number }
  | { t: 'trashBungkus' }

export type NopeReason =
  | 'noHand'
  | 'needBatter'
  | 'noBatter'
  | 'battered'
  | 'wokBusy'
  | 'empty'
  | 'raw'
  | 'trayFull'
  | 'wrapFull'
  | 'noBungkus'
  | 'noCustomer'
  | 'notToday'

export type WrongReason = 'items' | 'wrap' | 'cabe' | 'saus' | 'oily' | 'cold'

export type SimEvent =
  | { e: 'take'; kind: ItemKind }
  | { e: 'drop' }
  | { e: 'dip'; kind: ItemKind }
  | { e: 'fry'; slot: number; kind: ItemKind }
  | { e: 'ding'; slot: number; kind: ItemKind }
  | { e: 'burnt'; slot: number; kind: ItemKind }
  | { e: 'lift'; slot: number; kind: ItemKind; tray: number }
  | { e: 'trash'; what: 'gosong' | 'tray' | 'bungkus'; slot: number }
  | { e: 'knob'; level: Knob }
  | { e: 'wrap'; wrap: Wrap }
  | { e: 'pack'; kind: ItemKind; from: number }
  | { e: 'unpack'; kind: ItemKind; to: number }
  | { e: 'extra'; extra: Extra; on: boolean }
  | { e: 'serve'; spot: number; pay: number; tip: number; type: CustomerType }
  | { e: 'wrong'; spot: number; reason: WrongReason }
  | { e: 'arrive'; spot: number; type: CustomerType }
  | { e: 'walkout'; spot: number }
  | { e: 'overheat'; on: boolean }
  | { e: 'nope'; reason: NopeReason; action: Action['t']; slot?: number }
  | { e: 'closing' }
  | { e: 'over'; failed: boolean }

export function createDay(
  day: number,
  seed: number,
  rep: number = REP_START,
  upgrades?: { turboStove?: number; cabeSetan?: number; esTeh?: number; minyakEmas?: number },
): GameState {
  const config = dayConfig(day)
  return {
    day: config.day,
    config,
    rng: seedRng(seed ^ Math.imul(config.day, 0x9e3779b1)),
    tick: 0,
    time: 0,
    phase: 'open',
    failed: false,
    knob: 1,
    oil: OIL_START,
    overheated: false,
    wok: new Array<Fryer | null>(WOK_SLOTS).fill(null),
    tray: new Array<TrayItem | null>(TRAY_SLOTS).fill(null),
    hand: null,
    bungkus: null,
    customers: [],
    nextArrival: 2,
    nextId: 1,
    rep: clampRep(rep),
    repStart: clampRep(rep),
    stats: { sales: 0, tips: 0, served: 0, walkouts: 0, burnt: 0, wrong: 0, sold: 0 },
    upgrades: upgrades ? { ...upgrades } : undefined,
  }
}

// ---------------------------------------------------------------------------
// Rules as small pure helpers, shared with the render, the bot and the tests.

export function cookSpeed(oil: number): number {
  return Math.min(2, Math.max(0.25, (oil - 120) / 60))
}

/** Doneness at which a piece burns: 1 is "just pas". */
export function burnPoint(kind: ItemKind, overheated: boolean): number {
  return 1 + ITEMS[kind].window * (overheated ? OVERHEAT_WINDOW : 1)
}

export function doneness(f: Fryer): number {
  return f.cook / ITEMS[f.kind].cookTime
}

export type Zone = 'mentah' | 'pas' | 'gosong'

export function zone(f: Fryer): Zone {
  return f.burnt ? 'gosong' : f.dinged ? 'pas' : 'mentah'
}

export function isDrained(item: TrayItem): boolean {
  return item.age >= DRAIN_TIME
}

export function isCold(item: TrayItem): boolean {
  return item.age >= COLD_TIME
}

export function itemCount(order: Order): number {
  return order.lines.reduce((n, l) => n + l.count, 0)
}

export function orderPrice(order: Order): number {
  return order.lines.reduce((sum, l) => sum + ITEMS[l.kind].price * l.count, 0)
}

/** Why this bungkus is wrong for this customer, or null when it's right. */
export function checkOrder(c: Pick<Customer, 'order' | 'type'>, b: Bungkus): WrongReason | null {
  const want = new Map<ItemKind, number>()
  for (const l of c.order.lines) want.set(l.kind, l.count)
  const got = new Map<ItemKind, number>()
  for (const it of b.items) got.set(it.kind, (got.get(it.kind) ?? 0) + 1)
  if (want.size !== got.size) return 'items'
  for (const [kind, n] of want) if (got.get(kind) !== n) return 'items'
  if (b.wrap !== c.order.wrap) return 'wrap'
  if (b.cabe !== c.order.cabe) return 'cabe'
  if (b.saus !== c.order.saus) return 'saus'
  if (c.type === 'rewel') {
    if (b.items.some((it) => it.oily)) return 'oily'
    if (b.items.some(isCold)) return 'cold'
  }
  return null
}

/** Tip for a correct bungkus: quick and fresh pays, ojol pays double. */
export function tipFor(c: Pick<Customer, 'order' | 'type' | 'patience' | 'maxPatience'>, b: Bungkus): number {
  if (b.items.some((it) => it.oily || isCold(it))) return 0
  const left = c.patience / c.maxPatience
  let rate = left >= 0.6 ? 0.25 : left >= 0.3 ? 0.1 : 0
  if (c.type === 'ojol') rate *= 2
  if (rate === 0) return 0
  return Math.ceil((orderPrice(c.order) * rate) / 500) * 500
}

/** Wall clock for a moment of the day, "06:00" → "17:00", in 5-minute steps. */
export function clockAt(time: number): string {
  const p = Math.min(1, Math.max(0, time / DAY_LENGTH))
  const minutes = Math.floor((OPEN_HOUR * 60 + p * (CLOSE_HOUR - OPEN_HOUR) * 60) / 5) * 5
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function earnings(s: GameState): number {
  return s.stats.sales + s.stats.tips
}

export function firstFree<T>(list: readonly (T | null)[]): number {
  return list.findIndex((x) => x === null)
}

function clampRep(r: number): number {
  return Math.min(REP_MAX, Math.max(0, r))
}

// ---------------------------------------------------------------------------

/** Advances the day by one tick after applying this tick's actions. Returns what happened. */
export function step(s: GameState, actions: readonly Action[] = []): SimEvent[] {
  const ev: SimEvent[] = []
  if (s.phase === 'over') return ev
  for (const a of actions) apply(s, a, ev)
  s.tick++
  s.time = s.tick / TICK_HZ
  updateOil(s, ev)
  updateWok(s, ev)
  for (const it of s.tray) if (it) it.age += DT
  if (s.bungkus) for (const it of s.bungkus.items) it.age += DT
  updateCustomers(s, ev)
  if (s.phase === 'open') spawn(s, ev)
  checkEnd(s, ev)
  return ev
}

function nope(ev: SimEvent[], a: Action, reason: NopeReason, slot?: number): void {
  ev.push(slot === undefined ? { e: 'nope', reason, action: a.t } : { e: 'nope', reason, action: a.t, slot })
}

function openBungkus(s: GameState, wrap: Wrap, ev: SimEvent[]): Bungkus {
  s.bungkus = { wrap, items: [], cabe: false, saus: false }
  ev.push({ e: 'wrap', wrap })
  return s.bungkus
}

function apply(s: GameState, a: Action, ev: SimEvent[]): void {
  if (s.phase === 'over') return
  switch (a.t) {
    case 'take': {
      if (!s.config.menu.includes(a.kind)) return nope(ev, a, 'notToday')
      s.hand = { kind: a.kind, battered: false }
      ev.push({ e: 'take', kind: a.kind })
      return
    }
    case 'drop': {
      if (!s.hand) return
      s.hand = null
      ev.push({ e: 'drop' })
      return
    }
    case 'dip': {
      if (!s.hand) return nope(ev, a, 'noHand')
      if (!ITEMS[s.hand.kind].needsBatter) return nope(ev, a, 'noBatter')
      if (s.hand.battered) return nope(ev, a, 'battered')
      s.hand.battered = true
      ev.push({ e: 'dip', kind: s.hand.kind })
      return
    }
    case 'fry': {
      if (!s.hand) return nope(ev, a, 'noHand', a.slot)
      if (s.wok[a.slot] !== null || a.slot < 0 || a.slot >= WOK_SLOTS) return nope(ev, a, 'wokBusy', a.slot)
      if (ITEMS[s.hand.kind].needsBatter && !s.hand.battered) return nope(ev, a, 'needBatter', a.slot)
      s.wok[a.slot] = { id: s.nextId++, kind: s.hand.kind, cook: 0, dinged: false, burnt: false }
      ev.push({ e: 'fry', slot: a.slot, kind: s.hand.kind })
      s.hand = null
      s.oil -= LOAD_DROP
      return
    }
    case 'lift': {
      const f = s.wok[a.slot]
      if (!f) return nope(ev, a, 'empty', a.slot)
      if (f.burnt) {
        s.wok[a.slot] = null
        ev.push({ e: 'trash', what: 'gosong', slot: a.slot })
        return
      }
      if (!f.dinged) return nope(ev, a, 'raw', a.slot)
      const t = firstFree(s.tray)
      if (t < 0) return nope(ev, a, 'trayFull', a.slot)
      s.tray[t] = { id: f.id, kind: f.kind, age: 0 }
      s.wok[a.slot] = null
      ev.push({ e: 'lift', slot: a.slot, kind: f.kind, tray: t })
      return
    }
    case 'knob': {
      if (a.level === s.knob) return
      s.knob = a.level
      ev.push({ e: 'knob', level: a.level })
      return
    }
    case 'wrap': {
      if (!s.config.wraps.includes(a.wrap)) return nope(ev, a, 'notToday')
      if (!s.bungkus) {
        openBungkus(s, a.wrap, ev)
        return
      }
      if (s.bungkus.wrap === a.wrap) return
      if (s.bungkus.items.length > WRAP_CAPACITY[a.wrap]) return nope(ev, a, 'wrapFull')
      s.bungkus.wrap = a.wrap
      ev.push({ e: 'wrap', wrap: a.wrap })
      return
    }
    case 'pack': {
      const it = s.tray[a.slot]
      if (!it) return nope(ev, a, 'empty', a.slot)
      const b = s.bungkus ?? openBungkus(s, 'kertas', ev)
      if (b.items.length >= WRAP_CAPACITY[b.wrap]) return nope(ev, a, 'wrapFull', a.slot)
      b.items.push({ id: it.id, kind: it.kind, age: it.age, oily: !isDrained(it) })
      s.tray[a.slot] = null
      ev.push({ e: 'pack', kind: it.kind, from: a.slot })
      return
    }
    case 'unpack': {
      const b = s.bungkus
      const it = b?.items[a.index]
      if (!b || !it) return nope(ev, a, 'empty')
      const t = firstFree(s.tray)
      if (t < 0) return nope(ev, a, 'trayFull')
      b.items.splice(a.index, 1)
      s.tray[t] = { id: it.id, kind: it.kind, age: it.age }
      ev.push({ e: 'unpack', kind: it.kind, to: t })
      return
    }
    case 'extra': {
      if (!s.config.extras.includes(a.extra)) return nope(ev, a, 'notToday')
      const b = s.bungkus ?? openBungkus(s, 'kertas', ev)
      b[a.extra] = !b[a.extra]
      ev.push({ e: 'extra', extra: a.extra, on: b[a.extra] })
      return
    }
    case 'serve': {
      const c = s.customers.find((x) => x.spot === a.spot && x.phase === 'waiting')
      if (!c) return nope(ev, a, 'noCustomer', a.spot)
      const b = s.bungkus
      if (!b || b.items.length === 0) return nope(ev, a, 'noBungkus', a.spot)
      const wrong = checkOrder(c, b)
      if (wrong) {
        c.patience -= WRONG_PENALTY * c.maxPatience
        s.stats.wrong++
        ev.push({ e: 'wrong', spot: c.spot, reason: wrong })
        return
      }
      const pay = orderPrice(c.order)
      const tip = tipFor(c, b)
      const bonusTip = tip > 0 && s.upgrades?.cabeSetan ? s.upgrades.cabeSetan * 500 : 0
      s.stats.sales += pay
      s.stats.tips += tip + bonusTip
      s.stats.served++
      s.stats.sold += b.items.length
      s.rep = clampRep(s.rep + REP_SERVED + (tip > 0 ? REP_TIP : 0))
      s.bungkus = null
      c.phase = 'leaving'
      c.timer = LEAVE_TIME
      c.happy = true
      ev.push({ e: 'serve', spot: c.spot, pay, tip, type: c.type })
      return
    }
    case 'discard': {
      if (!s.tray[a.slot]) return nope(ev, a, 'empty', a.slot)
      s.tray[a.slot] = null
      ev.push({ e: 'trash', what: 'tray', slot: a.slot })
      return
    }
    case 'trashBungkus': {
      if (!s.bungkus) return nope(ev, a, 'noBungkus')
      s.bungkus = null
      ev.push({ e: 'trash', what: 'bungkus', slot: 0 })
      return
    }
  }
}

function updateOil(s: GameState, ev: SimEvent[]): void {
  const raw = s.wok.reduce((n, f) => n + (f && !f.dinged ? 1 : 0), 0)
  s.oil += (KNOB_TARGET[s.knob] - s.oil) * (1 - Math.exp(-DT / HEAT_TAU)) - raw * RAW_COOLING * DT
  const hot = s.overheated ? s.oil >= OVERHEAT_OFF : s.oil >= OVERHEAT
  if (hot !== s.overheated) {
    s.overheated = hot
    ev.push({ e: 'overheat', on: hot })
  }
}

function updateWok(s: GameState, ev: SimEvent[]): void {
  const boost = 1 + 0.2 * (s.upgrades?.turboStove ?? 0)
  const speed = cookSpeed(s.oil) * boost
  s.wok.forEach((f, slot) => {
    if (!f || f.burnt) return
    f.cook += speed * DT
    const d = doneness(f)
    if (!f.dinged && d >= 1) {
      f.dinged = true
      ev.push({ e: 'ding', slot, kind: f.kind })
    }
    const burnPt = burnPoint(f.kind, s.overheated) * (1 + 0.35 * (s.upgrades?.minyakEmas ?? 0))
    if (f.dinged && d >= burnPt) {
      f.burnt = true
      s.stats.burnt++
      s.rep = clampRep(s.rep - REP_BURNT)
      ev.push({ e: 'burnt', slot, kind: f.kind })
    }
  })
}

function updateCustomers(s: GameState, ev: SimEvent[]): void {
  const patienceFactor = Math.max(0.6, 1 - 0.25 * (s.upgrades?.esTeh ?? 0))
  const drain = (s.overheated ? SMOKE_IMPATIENCE : 1) * DT * patienceFactor
  for (const c of s.customers) {
    if (c.phase === 'arriving') {
      c.timer -= DT
      if (c.timer <= 0) c.phase = 'waiting'
    } else if (c.phase === 'waiting') {
      c.patience -= drain
      if (c.patience <= 0) {
        c.patience = 0
        c.phase = 'leaving'
        c.timer = LEAVE_TIME
        c.happy = false
        s.stats.walkouts++
        s.rep = clampRep(s.rep - REP_WALKOUT)
        ev.push({ e: 'walkout', spot: c.spot })
      }
    } else {
      c.timer -= DT
    }
  }
  s.customers = s.customers.filter((c) => c.phase !== 'leaving' || c.timer > 0)
}

/** Seconds until the next customer: busier towards sore, and with a better name. */
export function arrivalInterval(s: Pick<GameState, 'config' | 'time' | 'rep'>): number {
  const p = Math.min(1, s.time / DAY_LENGTH)
  const rush = 1.15 - 0.45 * p
  const fame = 1 + (REP_START - s.rep) * 0.08
  return s.config.arrivalEvery * rush * fame
}

/** Patience shrinks a little as the day wears on. */
export function patienceFor(s: Pick<GameState, 'config' | 'time'>, type: CustomerType, items: number): number {
  const p = Math.min(1, s.time / DAY_LENGTH)
  return (BASE_PATIENCE[type] + PATIENCE_PER_ITEM * (items - 1)) * s.config.patience * (1 - 0.18 * p)
}

export function makeOrder(s: GameState, type: CustomerType): Order {
  const cfg = s.config
  const max = cfg.maxItems
  const count = type === 'ojol' ? randInt(s, 2, max + 1) : type === 'rewel' ? randInt(s, 2, Math.max(2, max)) : randInt(s, 1, max)
  const counts = new Map<ItemKind, number>()
  for (let i = 0; i < count; i++) {
    const kind = counts.size >= 3 ? pick(s, [...counts.keys()]) : pick(s, cfg.menu)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  const lines = [...counts].map(([kind, n]) => ({ kind, count: n })).sort((a, b) => UNLOCK_ORDER.indexOf(a.kind) - UNLOCK_ORDER.indexOf(b.kind))
  const hasPlastik = cfg.wraps.includes('plastik')
  const wantsPlastik = type === 'ojol' || count > WRAP_CAPACITY.kertas || rand(s) < (type === 'rewel' ? 0.35 : 0.2)
  return {
    lines,
    wrap: hasPlastik && wantsPlastik ? 'plastik' : 'kertas',
    cabe: cfg.extras.includes('cabe') && rand(s) < 0.35,
    saus: cfg.extras.includes('saus') && rand(s) < 0.3,
  }
}

function spawn(s: GameState, ev: SimEvent[]): void {
  s.nextArrival -= DT
  if (s.nextArrival > 0) return
  const taken = new Set(s.customers.map((c) => c.spot))
  const free = [...Array(QUEUE_SPOTS).keys()].filter((i) => !taken.has(i))
  if (free.length === 0) {
    s.nextArrival = 1.5
    return
  }
  const spot = pick(s, free)
  const type = pickWeighted(s, s.config.types)
  const order = makeOrder(s, type)
  const maxPatience = patienceFor(s, type, itemCount(order))
  s.customers.push({
    id: s.nextId++,
    type,
    spot,
    order,
    patience: maxPatience,
    maxPatience,
    phase: 'arriving',
    timer: ARRIVE_TIME,
    happy: false,
    look: Math.floor(rand(s) * 1e9),
  })
  ev.push({ e: 'arrive', spot, type })
  s.nextArrival = arrivalInterval(s) * randRange(s, 0.7, 1.3)
}

function checkEnd(s: GameState, ev: SimEvent[]): void {
  if (s.rep <= 0) {
    s.phase = 'over'
    s.failed = true
    ev.push({ e: 'over', failed: true })
    return
  }
  if (s.phase === 'open' && s.time >= DAY_LENGTH) {
    s.phase = 'closing'
    ev.push({ e: 'closing' })
  }
  if (s.phase === 'closing' && s.customers.length === 0) {
    s.phase = 'over'
    ev.push({ e: 'over', failed: false })
  }
}
