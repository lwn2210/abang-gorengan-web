import { ITEMS } from './sim/menu'
import { DRAIN_TIME, WOK_SLOTS, firstFree, type Action, type GameState } from './sim/game'
import { hitTest, inRect, TRAY, MAT, type Pt, type Target } from './layout'
import type { View } from './render/scene'

// Turns taps, drags and keys into sim actions. Every gesture has a tap
// version (tap the source, then tap where it goes) and a drag version (drag
// from source to destination); both end up as the same actions.

const DRAG_START = 9

interface Gesture {
  id: number
  from: Target | null
  start: Pt
  at: Pt
  moved: boolean
  /** Pressed a bin whose piece was already in hand: a tap puts it back. */
  toggle: boolean
  dipped: boolean
}

export class Input {
  private queue: Action[] = []
  private g: Gesture | null = null
  enabled = false
  /** Seen a key press: show keycaps on the stations. */
  keys = false

  constructor(
    el: HTMLElement,
    private toStage: (x: number, y: number) => Pt,
    private state: () => GameState,
  ) {
    el.addEventListener('pointerdown', (e) => this.down(e))
    // iOS Safari: keep its double-tap and long-press gestures from swallowing quick taps.
    for (const type of ['touchstart', 'touchmove', 'touchend'] as const) el.addEventListener(type, (e) => e.preventDefault(), { passive: false })
    window.addEventListener('pointermove', (e) => this.move(e))
    window.addEventListener('pointerup', (e) => this.up(e))
    window.addEventListener('pointercancel', () => (this.g = null))
    window.addEventListener('keydown', (e) => this.key(e))
  }

  /** Actions gathered since the last call. */
  take(): Action[] {
    const q = this.queue
    this.queue = []
    return q
  }

  reset(): void {
    this.queue = []
    this.g = null
  }

  view(): Pick<View, 'drag' | 'keys'> {
    const g = this.g
    return { drag: g && g.moved && g.from ? { target: g.from, at: g.at } : null, keys: this.keys }
  }

  private push(...a: Action[]): void {
    if (this.enabled) this.queue.push(...a)
  }

  /** The hand as it will be once the queued actions land (taps can beat the next tick). */
  private pendingHand(): GameState['hand'] {
    let hand = this.state().hand
    for (const a of this.queue) {
      if (a.t === 'take') hand = { kind: a.kind, battered: false }
      else if (a.t === 'dip' && hand) hand = { ...hand, battered: true }
      else if (a.t === 'fry' || a.t === 'drop') hand = null
    }
    return hand
  }

  private hit(p: Pt): Target | null {
    const s = this.state()
    return hitTest(p, s.config.menu, s.bungkus?.items.length ?? 0)
  }

  private down(e: PointerEvent): void {
    if (!this.enabled || (this.g && this.g.id !== e.pointerId)) return
    e.preventDefault()
    const p = this.toStage(e.clientX, e.clientY)
    const from = this.hit(p)
    let toggle = false
    if (from?.k === 'bin') {
      // Pick it up straight away so a drag carries it.
      const hand = this.pendingHand()
      if (hand?.kind === from.kind && !hand.battered) toggle = true
      else this.push({ t: 'take', kind: from.kind })
    }
    this.g = { id: e.pointerId, from, start: p, at: p, moved: false, toggle, dipped: false }
  }

  private move(e: PointerEvent): void {
    const g = this.g
    if (!g || g.id !== e.pointerId) return
    g.at = this.toStage(e.clientX, e.clientY)
    if (!g.moved && Math.hypot(g.at.x - g.start.x, g.at.y - g.start.y) > DRAG_START) g.moved = true
    // Dragging a piece through the flour bowl coats it on the way.
    if (g.moved && (g.from?.k === 'bin' || g.from?.k === 'tepung') && !g.dipped && this.hit(g.at)?.k === 'tepung') {
      const s = this.state()
      const kind = g.from.k === 'bin' ? g.from.kind : s.hand?.kind
      if (kind && ITEMS[kind].needsBatter && !(s.hand?.battered && s.hand.kind === kind)) {
        g.dipped = true
        this.push({ t: 'dip' })
      }
    }
  }

  private up(e: PointerEvent): void {
    const g = this.g
    if (!g || g.id !== e.pointerId) return
    this.g = null
    if (!this.enabled || !g.from) return
    const p = this.toStage(e.clientX, e.clientY)
    if (!g.moved) return this.tap(g.from, g.toggle)
    const to = this.hit(p)
    // Let go right on the flour bowl: that's a dip too.
    if ((g.from.k === 'bin' || g.from.k === 'tepung') && to?.k === 'tepung') {
      if (!g.dipped) this.push({ t: 'dip' })
      return
    }
    this.drop(g.from, to, p)
  }

  private tap(t: Target, toggle: boolean): void {
    const s = this.state()
    switch (t.k) {
      case 'bin':
        if (toggle) this.push({ t: 'drop' })
        return
      case 'tepung':
        return this.push({ t: 'dip' })
      case 'wok':
        if (s.wok[t.slot]) return this.push({ t: 'lift', slot: t.slot })
        return this.push({ t: 'fry', slot: t.slot })
      case 'wokArea': {
        const free = firstFree(s.wok)
        if (s.hand && free >= 0) this.push({ t: 'fry', slot: free })
        return
      }
      case 'tray':
        if (s.tray[t.slot]) this.push({ t: 'pack', slot: t.slot })
        return
      case 'mat':
        if (t.index >= 0) this.push({ t: 'unpack', index: t.index })
        return
      case 'wrap':
        return this.push({ t: 'wrap', wrap: t.wrap })
      case 'extra':
        return this.push({ t: 'extra', extra: t.extra })
      case 'knob':
        return this.push({ t: 'knob', level: t.level })
      case 'customer':
        if (s.customers.some((c) => c.spot === t.spot && c.phase === 'waiting')) this.push({ t: 'serve', spot: t.spot })
        return
      case 'trash':
        if (s.hand) this.push({ t: 'drop' })
        return
      case 'trayArea':
        return
    }
  }

  private drop(from: Target, to: Target | null, p: Pt): void {
    const s = this.state()
    switch (from.k) {
      case 'bin':
      case 'tepung': {
        if (!to) return
        if (to.k === 'wok') return this.push({ t: 'fry', slot: to.slot })
        if (to.k === 'wokArea') {
          const free = firstFree(s.wok)
          if (free >= 0) this.push({ t: 'fry', slot: free })
          return
        }
        if (to.k === 'trash') return this.push({ t: 'drop' })
        return
      }
      case 'wok':
        // Anywhere up on the counter counts as "onto the rack".
        if (inRect(p, TRAY, 10) || inRect(p, MAT, 4) || p.y < 500) this.push({ t: 'lift', slot: from.slot })
        return
      case 'tray':
        if (to?.k === 'mat' || inRect(p, MAT, 8)) return this.push({ t: 'pack', slot: from.slot })
        if (to?.k === 'trash') return this.push({ t: 'discard', slot: from.slot })
        return
      case 'mat':
        if (from.index >= 0) {
          if (to?.k === 'tray' || to?.k === 'trayArea') this.push({ t: 'unpack', index: from.index })
          return
        }
        if (to?.k === 'customer') return this.push({ t: 'serve', spot: to.spot })
        if (to?.k === 'trash') return this.push({ t: 'trashBungkus' })
        return
      case 'extra':
        if (to?.k === 'mat') this.push({ t: 'extra', extra: from.extra })
        return
      case 'wrap':
        if (to?.k === 'mat') this.push({ t: 'wrap', wrap: from.wrap })
        return
      default:
        // A wobbly tap that slid a little: treat as a tap where it started.
        if (to && to.k === from.k) this.tap(from, false)
    }
  }

  private key(e: KeyboardEvent): void {
    if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey) return
    const s = this.state()
    const k = e.key.toLowerCase()
    let used = true
    const digit = Number(k)
    if (k >= '1' && k <= '6' && digit <= s.config.menu.length) {
      const kind = s.config.menu[digit - 1]
      this.push(s.hand?.kind === kind && !s.hand.battered ? { t: 'drop' } : { t: 'take', kind })
    } else if (k === 't') this.push({ t: 'dip' })
    else if ('qwer'.includes(k) && k.length === 1) {
      const slot = 'qwer'.indexOf(k)
      if (slot < WOK_SLOTS) this.push(s.wok[slot] ? { t: 'lift', slot } : { t: 'fry', slot })
    } else if (k === 'a') {
      const slot = s.tray.findIndex((it) => it && it.age >= DRAIN_TIME)
      if (slot >= 0) this.push({ t: 'pack', slot })
    } else if (k === 'z') this.push({ t: 'wrap', wrap: 'kertas' })
    else if (k === 'x') this.push({ t: 'wrap', wrap: 'plastik' })
    else if (k === 'c') this.push({ t: 'extra', extra: 'cabe' })
    else if (k === 'v') this.push({ t: 'extra', extra: 'saus' })
    else if (k === 'j' || k === 'k' || k === 'l') this.push({ t: 'knob', level: k === 'j' ? 0 : k === 'k' ? 1 : 2 })
    else if (['7', '8', '9', '0'].includes(k)) this.push({ t: 'serve', spot: ['7', '8', '9', '0'].indexOf(k) })
    else used = false
    if (used) {
      this.keys = true
      e.preventDefault()
    }
  }
}
