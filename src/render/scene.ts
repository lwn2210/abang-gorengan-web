import { CUSTOMER_LABEL, ITEMS, WRAP_CAPACITY, type ItemKind, type Wrap } from '../sim/menu'
import {
  ARRIVE_TIME,
  COLD_TIME,
  DAY_LENGTH,
  DRAIN_TIME,
  KNOB_TARGET,
  LEAVE_TIME,
  OVERHEAT,
  burnPoint,
  cookSpeed,
  doneness,
  isCold,
  isDrained,
  type Customer,
  type GameState,
  type SimEvent,
  type WrongReason,
} from '../sim/game'
import {
  BIN_ROW,
  BUBBLE_TOP,
  COUNTER_Y,
  EXTRA_BTN,
  KNOB,
  MAT,
  PLANK_H,
  SPOT_W,
  SPOT_X,
  STAGE_H,
  STAGE_W,
  TEPUNG,
  THERMO,
  TRASH,
  TRAY,
  WOK,
  WOK_SLOTS_AT,
  WRAP_BTN,
  binRects,
  handRest,
  knobRect,
  matItem,
  traySlot,
  type Pt,
  type Rect,
  type Target,
} from '../layout'
import { drawChili, drawFood, drawSauce, drawWrapIcon } from './food'
import { Fx } from './fx'

const DISPLAY = '"Lilita One", system-ui, sans-serif'
const BODY = 'Nunito, system-ui, sans-serif'
const INK = '#2a1e17'

/** What the input layer wants drawn on top of the sim. */
export interface View {
  drag: { target: Target; at: Pt } | null
  hint: string | null
  /** Show keyboard shortcuts on stations. */
  keys: boolean
}

type RGB = [number, number, number]

const SKY: { at: number; top: RGB; bottom: RGB }[] = [
  { at: 0, top: [124, 170, 220], bottom: [255, 214, 170] },
  { at: 0.45, top: [86, 160, 230], bottom: [196, 228, 246] },
  { at: 0.8, top: [120, 150, 214], bottom: [255, 200, 140] },
  { at: 1, top: [92, 86, 160], bottom: [255, 150, 96] },
]

function lerpRGB(a: RGB, b: RGB, t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}

function skyAt(p: number): { top: string; bottom: string } {
  for (let i = 1; i < SKY.length; i++) {
    if (p <= SKY[i].at) {
      const a = SKY[i - 1]
      const b = SKY[i]
      const t = (p - a.at) / (b.at - a.at)
      return { top: lerpRGB(a.top, b.top, t), bottom: lerpRGB(a.bottom, b.bottom, t) }
    }
  }
  const last = SKY[SKY.length - 1]
  return { top: lerpRGB(last.top, last.top, 0), bottom: lerpRGB(last.bottom, last.bottom, 0) }
}

/** Small deterministic hash → [0, 1). */
function hash(n: number, salt: number): number {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const SKIN = ['#f1c9a5', '#e3b088', '#c98f62', '#a9714a', '#8a5634']
const SHIRT = ['#e85d4a', '#3d7fd9', '#f2b134', '#4caf7a', '#9b59b6', '#ef7fb0', '#34495e', '#e67e22', '#16a085']
const HIJAB = ['#c0392b', '#8e44ad', '#2c82c9', '#e17e9c', '#3c6e47', '#d4a017']

export const WRONG_LINES: Record<WrongReason, (c: Customer) => string> = {
  items: () => 'Bukan ini pesenanku!',
  wrap: (c) => (c.order.wrap === 'plastik' ? 'Plastik dong, bang!' : 'Kertas aja, bang!'),
  cabe: (c) => (c.order.cabe ? 'Cabenya mana?' : 'Aku nggak pake cabe!'),
  saus: (c) => (c.order.saus ? 'Sausnya mana?' : 'Nggak pake saus!'),
  oily: () => 'Ih, masih berminyak!',
  cold: () => 'Udah dingin, bang!',
}

const BIN_NAME: Record<ItemKind, string> = { bakwan: 'Bakwan', tahu: 'Tahu isi', pisang: 'Pisang', mendoan: 'Mendoan', cireng: 'Cireng', combro: 'Combro' }

const NOPE_LINES: Partial<Record<string, string>> = {
  needBatter: 'Celup tepung dulu!',
  noBatter: 'Yang ini nggak usah dicelup',
  battered: 'Udah bertepung',
  noHand: 'Ambil adonan dulu',
  raw: 'Belum mateng!',
  trayFull: 'Peniris penuh!',
  wrapFull: 'Bungkusnya penuh!',
  noBungkus: 'Bungkus dulu gorengannya',
  notToday: 'Belum ada hari ini',
}

export class Scene {
  readonly fx = new Fx()
  private ctx: CanvasRenderingContext2D
  private dpr = 1
  private cw = 0
  private ch = 0
  /** Stage → CSS pixels. */
  scale = 1
  ox = 0
  oy = 0
  private clock = 0
  private traffic: { x: number; dir: 1 | -1; speed: number; color: string; kind: number }[] = []
  private trafficTimer = 0

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.cw = window.innerWidth
    this.ch = window.innerHeight
    this.canvas.width = Math.round(this.cw * this.dpr)
    this.canvas.height = Math.round(this.ch * this.dpr)
    // A hidden tab can report a zero-sized window; keep the maths finite.
    this.scale = Math.max(0.05, Math.min(this.cw / STAGE_W, this.ch / STAGE_H))
    this.ox = (this.cw - STAGE_W * this.scale) / 2
    this.oy = (this.ch - STAGE_H * this.scale) / 2
  }

  toStage(clientX: number, clientY: number): Pt {
    return { x: (clientX - this.ox) / this.scale, y: (clientY - this.oy) / this.scale }
  }

  /** Turns sim events into particles, pop-ups and speech. */
  onEvents(s: GameState, events: readonly SimEvent[]): void {
    const fx = this.fx
    for (const e of events) {
      switch (e.e) {
        case 'fry': {
          const p = WOK_SLOTS_AT[e.slot]
          fx.splash(p.x, p.y)
          break
        }
        case 'ding': {
          const p = WOK_SLOTS_AT[e.slot]
          fx.text('Pas!', p.x, p.y - 28, '#ffe26b', 18, 0.9)
          break
        }
        case 'burnt': {
          const p = WOK_SLOTS_AT[e.slot]
          fx.text('Gosong!', p.x, p.y - 28, '#ff7b5c', 20)
          fx.puff(p.x, p.y, 8, 'rgba(40,32,28,0.6)')
          break
        }
        case 'trash':
          if (e.what === 'gosong') fx.puff(WOK_SLOTS_AT[e.slot].x, WOK_SLOTS_AT[e.slot].y, 4)
          break
        case 'dip':
          for (let i = 0; i < 8; i++)
            fx.add({ kind: 'crumb', x: TEPUNG.x + (Math.random() - 0.5) * 30, y: TEPUNG.y - 10, vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 60, life: 0.5, size: 3, color: '#fffaf0' })
          break
        case 'serve': {
          const x = SPOT_X[e.spot]
          fx.coins(x, COUNTER_Y - 30, e.tip > 0 ? 8 : 4, STAGE_W / 2 - 20, -10)
          fx.text(`+${rp(e.pay)}`, x, COUNTER_Y - 70, '#ffe26b', 22, 1.4)
          if (e.tip > 0) fx.text(`tip ${rp(e.tip)}`, x, COUNTER_Y - 44, '#9cf28a', 17, 1.6)
          fx.speech(pickLine(e.tip > 0 ? ['Mantap, bang!', 'Cepet banget!', 'Makasih, bang!'] : ['Makasih, bang', 'Oke, bang', 'Sip']), clampX(x, 60), BUBBLE_TOP + 40)
          break
        }
        case 'wrong': {
          const c = s.customers.find((x) => x.spot === e.spot)
          if (c) fx.speech(WRONG_LINES[e.reason](c), clampX(SPOT_X[e.spot], 70), COUNTER_Y - 100, 2.2)
          fx.shake = 0.4
          break
        }
        case 'walkout':
          fx.speech(pickLine(['Lama amat!', 'Nggak jadi deh!', 'Kelamaan, bang!']), clampX(SPOT_X[e.spot], 60), BUBBLE_TOP + 40)
          break
        case 'overheat':
          if (e.on) fx.text('Minyak kepanasan!', WOK.x, WOK.y - WOK.r - 6, '#ff8a65', 20, 1.6)
          break
        case 'nope': {
          const line = NOPE_LINES[e.reason]
          if (!line) break
          const at = nopeSpot(e.action, e.slot)
          fx.text(line, clampX(at.x, 80), at.y, '#fff', 15, 1.2)
          break
        }
      }
    }
  }

  draw(s: GameState, view: View, dt: number): void {
    if (window.innerWidth !== this.cw || window.innerHeight !== this.ch) this.resize()
    this.clock += dt
    this.fx.update(dt)
    this.ambient(s, dt)
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    const shake = this.fx.shake > 0 ? (Math.random() - 0.5) * this.fx.shake * 6 : 0
    ctx.translate(this.ox + shake, this.oy)
    ctx.scale(this.scale, this.scale)
    const left = -this.ox / this.scale
    const right = (this.cw - this.ox) / this.scale
    const top = -this.oy / this.scale
    const bottom = (this.ch - this.oy) / this.scale

    this.drawStreet(s, left, right, top)
    for (const c of [...s.customers].sort((a, b) => Number(a.phase === 'leaving') - Number(b.phase === 'leaving'))) this.drawCustomer(c, view)
    this.drawCart(left, right, bottom)
    this.drawHint(view.hint)
    this.drawTray(s, view)
    this.drawMat(s, view)
    this.drawWrapButtons(s)
    this.drawExtras(s, view)
    this.drawKnob(s, view)
    this.drawWok(s, view)
    this.drawTepung(s, view)
    this.drawBins(s, view)
    this.fx.draw(ctx, 'under')
    this.drawHand(s, view)
    this.fx.draw(ctx, 'over')
    for (const c of s.customers) if (c.phase === 'waiting') this.drawBubble(s, c)
    this.fx.drawTexts(ctx, DISPLAY, BODY)
  }

  // -------------------------------------------------------------------------

  /** Render-only life: bubbles in the oil, steam, smoke, passing traffic. */
  private ambient(s: GameState, dt: number): void {
    const fx = this.fx
    const speed = cookSpeed(s.oil)
    s.wok.forEach((f, i) => {
      if (!f || f.burnt) return
      const p = WOK_SLOTS_AT[i]
      const rate = (f.dinged ? 6 : 14) * speed
      if (Math.random() < rate * dt) {
        const a = Math.random() * Math.PI * 2
        const r = 18 + Math.random() * 12
        fx.add({ kind: 'bubble', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.8, vx: 0, vy: 0, life: 0.35 + Math.random() * 0.25, size: 1.5 + Math.random() * 2.5 })
      }
      if (f.dinged && Math.random() < 1.5 * dt) fx.add({ kind: 'steam', x: p.x + (Math.random() - 0.5) * 20, y: p.y - 10, vx: 0, vy: -22, life: 1, size: 5 })
    })
    for (let i = 0; i < s.wok.length; i++) {
      const f = s.wok[i]
      if (f?.burnt && Math.random() < 3 * dt) fx.puff(WOK_SLOTS_AT[i].x, WOK_SLOTS_AT[i].y - 6, 1, 'rgba(50,42,38,0.45)')
    }
    if (s.overheated && Math.random() < 6 * dt) fx.puff(WOK.x + (Math.random() - 0.5) * 120, WOK.y - 20, 1, 'rgba(200,196,190,0.45)')
    s.tray.forEach((it, i) => {
      if (!it || isCold(it)) return
      const r = traySlot(i)
      if (Math.random() < (it.age < COLD_TIME * 0.6 ? 1.2 : 0.4) * dt)
        fx.add({ kind: 'steam', x: r.x + r.w / 2 + (Math.random() - 0.5) * 16, y: r.y + 18, vx: 0, vy: -18, life: 1.1, size: 4 })
    })
    this.trafficTimer -= dt
    if (this.trafficTimer <= 0) {
      this.trafficTimer = 2.5 + Math.random() * 5
      const dir = Math.random() < 0.5 ? 1 : -1
      this.traffic.push({ x: dir === 1 ? -380 : 780, dir, speed: 90 + Math.random() * 110, color: SHIRT[Math.floor(Math.random() * SHIRT.length)], kind: Math.random() < 0.75 ? 0 : 1 })
    }
    for (const t of this.traffic) t.x += t.dir * t.speed * dt
    this.traffic = this.traffic.filter((t) => t.x > -420 && t.x < 820)
  }

  private drawStreet(s: GameState, left: number, right: number, top: number): void {
    const ctx = this.ctx
    const p = Math.min(1, s.time / DAY_LENGTH)
    const sky = skyAt(p)
    const g = ctx.createLinearGradient(0, top, 0, 200)
    g.addColorStop(0, sky.top)
    g.addColorStop(1, sky.bottom)
    ctx.fillStyle = g
    ctx.fillRect(left, top, right - left, 220 - top)

    // Sun drifting across.
    const sx = 40 + p * 320
    const sy = 70 - Math.sin(p * Math.PI) * 40
    ctx.fillStyle = p > 0.8 ? 'rgba(255,190,110,0.9)' : 'rgba(255,240,190,0.9)'
    ctx.beginPath()
    ctx.arc(sx, sy, 22, 0, Math.PI * 2)
    ctx.fill()

    // Ruko across the road.
    const colors = ['#e8b86d', '#d98b6c', '#9cc1a8', '#e3d0a8', '#c9a3c8', '#8fb3d9', '#f0c987']
    for (let i = Math.floor(left / 86) - 1; i < right / 86 + 1; i++) {
      const x = i * 86
      const h = 92 + hash(i, 1) * 50
      const y = 196 - h
      ctx.fillStyle = colors[((i % colors.length) + colors.length) % colors.length]
      ctx.fillRect(x, y, 84, h)
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(x, y, 84, 8)
      // Rolling shutter and a sign.
      ctx.fillStyle = '#b8bcc0'
      ctx.fillRect(x + 8, 150, 68, 46)
      ctx.strokeStyle = 'rgba(80,80,90,0.35)'
      ctx.lineWidth = 1
      for (let k = 154; k < 196; k += 5) {
        ctx.beginPath()
        ctx.moveTo(x + 8, k)
        ctx.lineTo(x + 76, k)
        ctx.stroke()
      }
      ctx.fillStyle = hash(i, 2) > 0.5 ? '#c0392b' : '#2c6eb5'
      ctx.fillRect(x + 10, 128, 64, 16)
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillRect(x + 18, 134, 30 + hash(i, 3) * 18, 4)
      ctx.fillStyle = p > 0.85 ? 'rgba(255,220,140,0.85)' : 'rgba(255,255,255,0.45)'
      ctx.fillRect(x + 14, y + 16, 22, 18)
      ctx.fillRect(x + 48, y + 16, 22, 18)
    }
    // Power line.
    ctx.strokeStyle = 'rgba(40,40,40,0.5)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(left, 60)
    ctx.quadraticCurveTo((left + right) / 2, 84, right, 58)
    ctx.stroke()

    // Road with passing motorbikes and angkot.
    ctx.fillStyle = '#5d5a5a'
    ctx.fillRect(left, 196, right - left, 52)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 2
    ctx.setLineDash([16, 14])
    ctx.beginPath()
    ctx.moveTo(left, 222)
    ctx.lineTo(right, 222)
    ctx.stroke()
    ctx.setLineDash([])
    for (const t of this.traffic) this.drawVehicle(t.x, t.dir === 1 ? 232 : 212, t.dir, t.color, t.kind)

    // Sidewalk.
    ctx.fillStyle = '#cfc2ad'
    ctx.fillRect(left, 248, right - left, COUNTER_Y - 248)
    ctx.fillStyle = '#9a8f7e'
    ctx.fillRect(left, 248, right - left, 4)
    ctx.strokeStyle = 'rgba(120,105,90,0.25)'
    ctx.lineWidth = 1
    for (let x = Math.floor(left / 40) * 40; x < right; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 252)
      ctx.lineTo(x - 14, COUNTER_Y)
      ctx.stroke()
    }
    if (p > 0.8) {
      ctx.fillStyle = `rgba(255,120,60,${(p - 0.8) * 0.5})`
      ctx.fillRect(left, top, right - left, COUNTER_Y - top)
    }
  }

  private drawVehicle(x: number, y: number, dir: number, color: string, kind: number): void {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(dir, 1)
    if (kind === 0) {
      ctx.fillStyle = '#222'
      ctx.beginPath()
      ctx.arc(-12, 6, 5, 0, Math.PI * 2)
      ctx.arc(14, 6, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(-16, -4, 30, 9, 4)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.fillRect(-2, -18, 8, 14)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(2, -22, 6, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = '#2f7fc1'
      ctx.beginPath()
      ctx.roundRect(-36, -20, 72, 26, 5)
      ctx.fill()
      ctx.fillStyle = 'rgba(220,240,255,0.85)'
      for (let i = 0; i < 4; i++) ctx.fillRect(-30 + i * 16, -16, 12, 9)
      ctx.fillStyle = '#222'
      ctx.beginPath()
      ctx.arc(-22, 7, 6, 0, Math.PI * 2)
      ctx.arc(22, 7, 6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private customerX(c: Customer): { x: number; alpha: number; walking: boolean } {
    const home = SPOT_X[c.spot]
    const dir = c.spot < 2 ? -1 : 1
    if (c.phase === 'arriving') {
      const k = Math.max(0, c.timer / ARRIVE_TIME)
      return { x: home + dir * 240 * k * k, alpha: 1, walking: true }
    }
    if (c.phase === 'leaving') {
      const k = 1 - Math.max(0, c.timer / LEAVE_TIME)
      const out = c.happy ? -dir : dir
      return { x: home + out * 260 * k * k, alpha: 1 - Math.max(0, k - 0.6) * 2.5, walking: k > 0.15 }
    }
    return { x: home, alpha: 1, walking: false }
  }

  private drawCustomer(c: Customer, view: View): void {
    const ctx = this.ctx
    const { x, alpha, walking } = this.customerX(c)
    const bob = walking ? Math.abs(Math.sin(this.clock * 10 + c.id)) * -4 : Math.sin(this.clock * 2 + c.id) * 1
    const frac = c.patience / c.maxPatience
    const look = c.look
    const skin = SKIN[look % SKIN.length]
    const shirt = c.type === 'ojol' ? '#1f9d4b' : SHIRT[Math.floor(look / 7) % SHIRT.length]
    const style = c.type === 'ojol' ? 'helmet' : c.type === 'rewel' ? 'hijab' : (['short', 'hijab', 'peci', 'cap', 'long', 'gray'] as const)[Math.floor(look / 61) % 6]
    const hijab = HIJAB[Math.floor(look / 13) % HIJAB.length]
    const headY = 232 + bob
    ctx.save()
    ctx.globalAlpha = alpha
    // Highlight when a bungkus is being dragged over them.
    if (view.drag?.target.k === 'mat' && c.phase === 'waiting' && Math.abs(view.drag.at.x - SPOT_X[c.spot]) < SPOT_W / 2 && view.drag.at.y < COUNTER_Y) {
      ctx.fillStyle = 'rgba(255,240,150,0.45)'
      ctx.beginPath()
      ctx.ellipse(x, 268, 46, 70, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // Body.
    ctx.fillStyle = shirt
    ctx.beginPath()
    ctx.moveTo(x - 30, COUNTER_Y + 2)
    ctx.quadraticCurveTo(x - 30, 262 + bob, x - 14, 258 + bob)
    ctx.lineTo(x + 14, 258 + bob)
    ctx.quadraticCurveTo(x + 30, 262 + bob, x + 30, COUNTER_Y + 2)
    ctx.closePath()
    ctx.fill()
    if (c.type === 'ojol') {
      ctx.fillStyle = '#167a39'
      ctx.fillRect(x - 3, 260 + bob, 6, COUNTER_Y - 258)
    }
    // Head.
    ctx.fillStyle = skin
    ctx.fillRect(x - 6, headY + 14, 12, 12)
    if (style === 'hijab') {
      ctx.fillStyle = c.type === 'rewel' ? '#8e2b5e' : hijab
      ctx.beginPath()
      ctx.moveTo(x - 26, 266 + bob)
      ctx.quadraticCurveTo(x - 28, headY - 26, x, headY - 26)
      ctx.quadraticCurveTo(x + 28, headY - 26, x + 26, 266 + bob)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.ellipse(x, headY, 19, 21, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a1e17'
    switch (style) {
      case 'short':
        ctx.beginPath()
        ctx.ellipse(x, headY - 12, 20, 12, 0, Math.PI, Math.PI * 2)
        ctx.fill()
        break
      case 'long':
        ctx.beginPath()
        ctx.ellipse(x, headY - 8, 22, 17, 0, Math.PI, Math.PI * 2)
        ctx.fill()
        ctx.fillRect(x - 22, headY - 8, 7, 30)
        ctx.fillRect(x + 15, headY - 8, 7, 30)
        break
      case 'gray':
        ctx.fillStyle = '#9a9a9a'
        ctx.beginPath()
        ctx.ellipse(x, headY - 13, 18, 9, 0, Math.PI, Math.PI * 2)
        ctx.fill()
        break
      case 'peci':
        ctx.fillRect(x - 17, headY - 27, 34, 13)
        break
      case 'cap':
        ctx.fillStyle = shirt
        ctx.beginPath()
        ctx.ellipse(x, headY - 12, 20, 12, 0, Math.PI, Math.PI * 2)
        ctx.fill()
        ctx.fillRect(x - 2, headY - 14, 26, 5)
        break
      case 'helmet':
        ctx.fillStyle = '#1f9d4b'
        ctx.beginPath()
        ctx.ellipse(x, headY - 5, 24, 24, 0, Math.PI, Math.PI * 2)
        ctx.fill()
        ctx.fillRect(x - 24, headY - 6, 6, 18)
        ctx.fillRect(x + 18, headY - 6, 6, 18)
        ctx.fillStyle = 'rgba(30,40,50,0.55)'
        ctx.fillRect(x - 17, headY - 9, 34, 5)
        break
      case 'hijab':
        break
    }
    if (style === 'hijab') {
      ctx.fillStyle = c.type === 'rewel' ? '#8e2b5e' : hijab
      ctx.beginPath()
      ctx.ellipse(x, headY - 10, 20, 13, 0, Math.PI, Math.PI * 2)
      ctx.fill()
    }
    // Face: how they feel about the wait.
    const mood = c.phase === 'leaving' ? (c.happy ? 1 : -1) : frac > 0.6 ? 1 : frac > 0.3 ? 0 : -1
    ctx.fillStyle = '#2a1e17'
    ctx.beginPath()
    ctx.arc(x - 7, headY + 1, 2.2, 0, Math.PI * 2)
    ctx.arc(x + 7, headY + 1, 2.2, 0, Math.PI * 2)
    ctx.fill()
    if (c.type === 'rewel') {
      ctx.strokeStyle = '#2a1e17'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x - 12, headY - 4, 9, 8)
      ctx.strokeRect(x + 3, headY - 4, 9, 8)
    }
    ctx.strokeStyle = '#2a1e17'
    ctx.lineWidth = 2
    ctx.beginPath()
    if (mood === 1) ctx.arc(x, headY + 7, 6, 0.15 * Math.PI, 0.85 * Math.PI)
    else if (mood === 0) {
      ctx.moveTo(x - 5, headY + 11)
      ctx.lineTo(x + 5, headY + 11)
    } else ctx.arc(x, headY + 15, 6, 1.15 * Math.PI, 1.85 * Math.PI)
    ctx.stroke()
    if (mood === -1) {
      ctx.beginPath()
      ctx.moveTo(x - 11, headY - 7)
      ctx.lineTo(x - 3, headY - 4)
      ctx.moveTo(x + 11, headY - 7)
      ctx.lineTo(x + 3, headY - 4)
      ctx.stroke()
      if (c.phase === 'waiting') {
        ctx.fillStyle = '#7cc6f2'
        ctx.beginPath()
        ctx.ellipse(x + 17, headY - 8 + ((this.clock * 8) % 6), 2.5, 4, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  private drawBubble(s: GameState, c: Customer): void {
    const ctx = this.ctx
    const x = SPOT_X[c.spot]
    const lines = c.order.lines
    const w = 88
    const h = 10 + lines.length * 26 + 24
    const y = BUBBLE_TOP
    ctx.save()
    ctx.fillStyle = '#fffaf0'
    ctx.strokeStyle = 'rgba(42,30,23,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y, w, h, 12)
    ctx.moveTo(x - 8, y + h)
    ctx.lineTo(x, y + h + 10)
    ctx.lineTo(x + 8, y + h)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fffaf0'
    ctx.fillRect(x - 7, y + h - 2, 14, 3)

    // What's already in the bungkus that matches: tick it off.
    const packed = new Map<ItemKind, number>()
    for (const it of s.bungkus?.items ?? []) packed.set(it.kind, (packed.get(it.kind) ?? 0) + 1)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    lines.forEach((l, i) => {
      const ly = y + 18 + i * 26
      drawFood(ctx, l.kind, x - 20, ly, 28, { cook: 1.1 })
      ctx.font = `20px ${DISPLAY}`
      ctx.fillStyle = INK
      ctx.fillText(`×${l.count}`, x + 2, ly + 1)
      if ((packed.get(l.kind) ?? 0) >= l.count && s.bungkus) {
        ctx.fillStyle = '#2e9e4f'
        ctx.font = `16px ${DISPLAY}`
        ctx.fillText('✓', x + 28, ly)
      }
    })
    // Wrap and extras along the bottom.
    const by = y + h - 13
    let bx = x - 28
    drawWrapIcon(ctx, c.order.wrap, bx, by, 18)
    bx += 22
    if (c.order.cabe) {
      drawChili(ctx, bx, by, 18)
      bx += 22
    }
    if (c.order.saus) drawSauce(ctx, bx, by, 18)

    // Type tag.
    const label = CUSTOMER_LABEL[c.type]
    if (label) {
      ctx.font = `800 11px ${BODY}`
      const tw = ctx.measureText(label).width + 12
      ctx.fillStyle = c.type === 'ojol' ? '#1f9d4b' : '#8e2b5e'
      ctx.beginPath()
      ctx.roundRect(x - w / 2 - 2, y - 9, tw, 16, 8)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.fillText(label, x - w / 2 + 4, y)
    }
    // Patience bar.
    const frac = Math.max(0, c.patience / c.maxPatience)
    const py = y + h + 14
    ctx.fillStyle = 'rgba(42,30,23,0.25)'
    ctx.beginPath()
    ctx.roundRect(x - 34, py, 68, 7, 4)
    ctx.fill()
    const blink = frac < 0.25 && Math.sin(this.clock * 14) > 0
    ctx.fillStyle = frac > 0.6 ? '#4caf50' : frac > 0.3 ? '#f5b82e' : blink ? '#ffb3a6' : '#e8453c'
    ctx.beginPath()
    ctx.roundRect(x - 34, py, Math.max(4, 68 * frac), 7, 4)
    ctx.fill()

    // Dynamic animated emoji reaction beside patience bar
    const moodIcon = frac > 0.65 ? '😊' : frac > 0.35 ? '😐' : frac > 0.15 ? '😰' : '😡'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(moodIcon, x + 38, py + 3.5)
    ctx.restore()
  }

  private drawCart(left: number, right: number, bottom: number): void {
    const ctx = this.ctx
    // Work surface behind the plank.
    const g = ctx.createLinearGradient(0, COUNTER_Y, 0, 500)
    g.addColorStop(0, '#d9c7a6')
    g.addColorStop(1, '#cbb592')
    ctx.fillStyle = g
    ctx.fillRect(left, COUNTER_Y, right - left, 500 - COUNTER_Y)
    // Stove deck.
    const g2 = ctx.createLinearGradient(0, 498, 0, bottom)
    g2.addColorStop(0, '#8b6a4f')
    g2.addColorStop(1, '#6d513b')
    ctx.fillStyle = g2
    ctx.fillRect(left, 498, right - left, bottom - 498)
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.fillRect(left, 498, right - left, 4)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(left, BIN_ROW.y - 8, right - left, bottom - BIN_ROW.y + 8)
    // The plank customers lean on (teak wood finish).
    ctx.fillStyle = '#8d4e28'
    ctx.fillRect(left, COUNTER_Y, right - left, PLANK_H)
    // Wood grain lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
    ctx.lineWidth = 1
    for (let gy = COUNTER_Y + 7; gy < COUNTER_Y + PLANK_H; gy += 6) {
      ctx.beginPath()
      ctx.moveTo(left, gy)
      ctx.lineTo(right, gy)
      ctx.stroke()
    }
    ctx.fillStyle = '#b66a38'
    ctx.fillRect(left, COUNTER_Y, right - left, 5)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(left, COUNTER_Y + PLANK_H, right - left, 4)

    // Warm street food bulb glow over the food tray and wok
    const warmLamp = ctx.createRadialGradient(STAGE_W / 2, 280, 20, STAGE_W / 2, 380, 220)
    warmLamp.addColorStop(0, 'rgba(255, 235, 170, 0.22)')
    warmLamp.addColorStop(0.6, 'rgba(255, 210, 120, 0.08)')
    warmLamp.addColorStop(1, 'rgba(255, 200, 100, 0)')
    ctx.fillStyle = warmLamp
    ctx.beginPath()
    ctx.arc(STAGE_W / 2, 380, 220, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawHint(hint: string | null): void {
    const ctx = this.ctx
    // Vintage Gerobak sign on the counter plank when no critical hint is active
    if (!hint) {
      ctx.save()
      ctx.font = `900 12px ${DISPLAY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffecb3'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
      ctx.shadowBlur = 3
      ctx.fillText('⭐ GORENGAN PAK KUMIS • GURIH & RENYAH ⭐', STAGE_W / 2, COUNTER_Y + PLANK_H / 2 + 1)
      ctx.restore()
      return
    }
    ctx.font = `800 13px ${BODY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff4dc'
    ctx.fillText(hint, STAGE_W / 2, COUNTER_Y + PLANK_H / 2 + 2)
  }

  private panel(r: Rect, fill: string, radius = 10): void {
    const ctx = this.ctx
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, radius)
    ctx.fill()
  }

  private glow(r: Rect | { x: number; y: number; r: number }, color = 'rgba(255, 226, 107, 0.9)'): void {
    const ctx = this.ctx
    const a = 0.55 + 0.45 * Math.sin(this.clock * 7)
    ctx.save()
    ctx.strokeStyle = color
    ctx.globalAlpha = a
    ctx.lineWidth = 3
    ctx.beginPath()
    if ('r' in r) ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
    else ctx.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 12)
    ctx.stroke()
    ctx.restore()
  }

  private label(text: string, x: number, y: number, size = 11, color = INK, weight = 800): void {
    const ctx = this.ctx
    ctx.font = `${weight} ${size}px ${BODY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
  }

  private keycap(text: string, x: number, y: number): void {
    const ctx = this.ctx
    ctx.font = `800 9px ${BODY}`
    const w = Math.max(13, ctx.measureText(text).width + 6)
    ctx.fillStyle = 'rgba(42,30,23,0.6)'
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - 7, w, 14, 4)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y + 0.5)
  }

  private drawTray(s: GameState, view: View): void {
    const ctx = this.ctx
    this.panel(TRAY, '#9aa3a8', 12)
    this.panel({ x: TRAY.x + 3, y: TRAY.y + 3, w: TRAY.w - 6, h: TRAY.h - 6 }, '#c4ccd0', 10)
    // Wire rack.
    ctx.strokeStyle = 'rgba(90,100,105,0.5)'
    ctx.lineWidth = 1
    for (let x = TRAY.x + 10; x < TRAY.x + TRAY.w - 4; x += 9) {
      ctx.beginPath()
      ctx.moveTo(x, TRAY.y + 6)
      ctx.lineTo(x, TRAY.y + TRAY.h - 6)
      ctx.stroke()
    }
    this.label('Peniris', TRAY.x + TRAY.w / 2, TRAY.y + TRAY.h - 1, 10, 'rgba(42,30,23,0.55)')
    const dragging = view.drag?.target.k === 'tray' ? view.drag.target.slot : -1
    const wantsLift = view.drag?.target.k === 'wok' && view.drag.at.y < 500
    if (wantsLift) this.glow(TRAY)
    s.tray.forEach((it, i) => {
      if (!it || i === dragging) return
      const r = traySlot(i)
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2 - 4
      const cold = isCold(it)
      drawFood(ctx, it.kind, cx, cy, 40, { cook: 1.08, alpha: cold ? 0.8 : 1 })
      if (!isDrained(it)) {
        // Still dripping.
        const k = (this.clock * 2.2 + i * 0.37) % 1
        ctx.fillStyle = `rgba(232, 176, 60, ${1 - k})`
        ctx.beginPath()
        ctx.ellipse(cx + 6, cy + 14 + k * 16, 2, 3, 0, 0, Math.PI * 2)
        ctx.fill()
        this.label('netes', cx, r.y + r.h - 6, 9, '#a2630e')
        const p = it.age / DRAIN_TIME
        ctx.fillStyle = 'rgba(162,99,14,0.5)'
        ctx.fillRect(r.x + 8, r.y + 2, (r.w - 16) * p, 3)
      } else if (cold) {
        this.label('dingin', cx, r.y + r.h - 6, 9, '#2f6fae')
      }
    })
  }

  private drawMat(s: GameState, view: View): void {
    const ctx = this.ctx
    const b = s.bungkus
    const dragHere = view.drag && (view.drag.target.k === 'tray' || view.drag.target.k === 'extra')
    this.panel(MAT, 'rgba(255,255,255,0.35)', 12)
    if (dragHere) this.glow(MAT)
    if (!b) {
      ctx.strokeStyle = 'rgba(42,30,23,0.3)'
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(MAT.x + 4, MAT.y + 4, MAT.w - 8, MAT.h - 8, 10)
      ctx.stroke()
      ctx.setLineDash([])
      this.label('Bungkus', MAT.x + MAT.w / 2, MAT.y + MAT.h / 2 - 8, 13, 'rgba(42,30,23,0.55)')
      this.label('ketuk gorengan', MAT.x + MAT.w / 2, MAT.y + MAT.h / 2 + 10, 10, 'rgba(42,30,23,0.45)', 600)
      return
    }
    const lift = view.drag?.target.k === 'mat' && view.drag.target.index < 0
    ctx.save()
    if (lift) ctx.globalAlpha = 0.35
    if (b.wrap === 'kertas') {
      ctx.save()
      ctx.translate(MAT.x + MAT.w / 2, MAT.y + MAT.h / 2)
      ctx.rotate(-0.04)
      ctx.fillStyle = '#efe6cf'
      ctx.fillRect(-54, -42, 108, 86)
      ctx.fillStyle = 'rgba(80,70,60,0.18)'
      for (let i = 0; i < 9; i++) ctx.fillRect(-48, -36 + i * 9, i % 3 === 0 ? 40 : 96, 3)
      ctx.fillStyle = 'rgba(80,70,60,0.3)'
      ctx.fillRect(-48, -38, 60, 6)
      ctx.restore()
    } else {
      ctx.fillStyle = 'rgba(214, 64, 64, 0.85)'
      ctx.beginPath()
      ctx.roundRect(MAT.x + 8, MAT.y + 14, MAT.w - 16, MAT.h - 18, 8)
      ctx.fill()
      ctx.strokeStyle = 'rgba(143, 32, 32, 0.9)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(MAT.x + 36, MAT.y + 14, 12, Math.PI, 0)
      ctx.moveTo(MAT.x + MAT.w - 24, MAT.y + 14)
      ctx.arc(MAT.x + MAT.w - 36, MAT.y + 14, 12, 0, Math.PI, true)
      ctx.stroke()
    }
    const draggingItem = view.drag?.target.k === 'mat' ? view.drag.target.index : -1
    b.items.forEach((it, i) => {
      if (i === draggingItem) return
      const p = matItem(i)
      drawFood(ctx, it.kind, p.x, p.y, 26, { cook: 1.08 })
      if (it.oily) {
        ctx.fillStyle = 'rgba(232,176,60,0.55)'
        ctx.beginPath()
        ctx.ellipse(p.x, p.y + 10, 9, 3, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    if (b.cabe) {
      drawChili(ctx, MAT.x + MAT.w - 18, MAT.y + 26, 16, -0.3)
      drawChili(ctx, MAT.x + MAT.w - 26, MAT.y + 32, 16, 0.4)
    }
    if (b.saus) {
      ctx.strokeStyle = '#c7361f'
      ctx.lineWidth = 3
      ctx.beginPath()
      for (let i = 0; i < 6; i++) ctx.lineTo(MAT.x + 26 + i * 12, MAT.y + 62 + (i % 2 ? -5 : 5))
      ctx.stroke()
    }
    ctx.restore()
    ctx.font = `800 10px ${BODY}`
    ctx.textAlign = 'left'
    ctx.fillStyle = b.wrap === 'kertas' ? 'rgba(42,30,23,0.7)' : '#fff'
    ctx.fillText(`${b.wrap === 'kertas' ? 'Kertas' : 'Plastik'} ${b.items.length}/${WRAP_CAPACITY[b.wrap]}`, MAT.x + 12, MAT.y + 14)
    if (b.items.length > 0 && !view.drag) {
      ctx.textAlign = 'center'
      ctx.fillStyle = b.wrap === 'kertas' ? 'rgba(42,30,23,0.55)' : 'rgba(255,255,255,0.85)'
      ctx.fillText('ketuk pembeli ↑', MAT.x + MAT.w / 2, MAT.y + MAT.h - 8)
    }
  }

  private drawWrapButtons(s: GameState): void {
    const ctx = this.ctx
    for (const w of ['kertas', 'plastik'] as Wrap[]) {
      const r = WRAP_BTN[w]
      const open = s.config.wraps.includes(w)
      const on = s.bungkus?.wrap === w
      this.panel(r, on ? '#ffe9a8' : 'rgba(255,255,255,0.55)', 10)
      if (on) {
        ctx.strokeStyle = '#e8a33a'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 9)
        ctx.stroke()
      }
      ctx.save()
      if (!open) ctx.globalAlpha = 0.35
      drawWrapIcon(ctx, w, r.x + r.w / 2, r.y + 17, 22)
      this.label(w === 'kertas' ? 'Kertas' : 'Plastik', r.x + r.w / 2, r.y + r.h - 9, 10)
      ctx.restore()
      if (!open) this.label('Hari 2', r.x + r.w / 2, r.y + 17, 10, '#7a6555')
    }
  }

  private drawExtras(s: GameState, view: View): void {
    const ctx = this.ctx
    for (const e of ['cabe', 'saus'] as const) {
      const r = EXTRA_BTN[e]
      const open = s.config.extras.includes(e)
      const on = s.bungkus?.[e] ?? false
      this.panel(r, on ? '#ffe9a8' : 'rgba(255,255,255,0.55)', 10)
      ctx.save()
      if (!open) ctx.globalAlpha = 0.35
      if (view.drag?.target.k === 'extra' && view.drag.target.extra === e) ctx.globalAlpha = 0.4
      const cx = r.x + r.w / 2
      if (e === 'cabe') {
        // Jar of cabe rawit.
        ctx.fillStyle = 'rgba(220,235,240,0.8)'
        ctx.beginPath()
        ctx.roundRect(cx - 15, r.y + 12, 30, 34, 6)
        ctx.fill()
        ctx.fillStyle = '#5a7d8c'
        ctx.fillRect(cx - 16, r.y + 8, 32, 6)
        for (let i = 0; i < 6; i++) drawChili(ctx, cx - 8 + (i % 3) * 8, r.y + 24 + Math.floor(i / 3) * 10, 13, i * 0.9)
      } else drawSauce(ctx, cx, r.y + 30, 36)
      this.label(e === 'cabe' ? 'Cabe' : 'Saus', cx, r.y + r.h - 9, 10)
      ctx.restore()
      if (!open) this.label('Hari 3', cx, r.y + 30, 10, '#7a6555')
      if (on) {
        ctx.fillStyle = '#2e9e4f'
        ctx.beginPath()
        ctx.arc(r.x + r.w - 8, r.y + 8, 8, 0, Math.PI * 2)
        ctx.fill()
        this.label('✓', r.x + r.w - 8, r.y + 8.5, 11, '#fff')
      }
      if (view.keys) this.keycap(e === 'cabe' ? 'C' : 'V', r.x + 9, r.y + 9)
    }
  }

  private drawKnob(s: GameState, view: View): void {
    const ctx = this.ctx
    this.panel({ x: KNOB.x - 2, y: KNOB.y - 2, w: KNOB.w + 4, h: KNOB.h + 4 }, 'rgba(30,20,12,0.35)', 12)
    const names = ['Kecil', 'Sedang', 'Besar']
    for (const level of [0, 1, 2] as const) {
      const r = knobRect(level)
      const on = s.knob === level
      ctx.fillStyle = on ? (level === 2 ? '#e8542f' : level === 1 ? '#f2a33a' : '#4f8fd6') : 'rgba(255,248,235,0.85)'
      ctx.beginPath()
      ctx.roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 9)
      ctx.fill()
      // Flame icon sized by setting.
      const fx = r.x + r.w / 2
      const size = 5 + level * 3
      ctx.fillStyle = on ? '#fff' : level === 2 ? '#e8542f' : level === 1 ? '#f2a33a' : '#4f8fd6'
      ctx.beginPath()
      ctx.moveTo(fx, r.y + 18 - size)
      ctx.quadraticCurveTo(fx + size * 0.9, r.y + 16, fx, r.y + 20)
      ctx.quadraticCurveTo(fx - size * 0.9, r.y + 16, fx, r.y + 18 - size)
      ctx.fill()
      this.label(names[level], fx, r.y + r.h - 10, 10, on ? '#fff' : INK)
      if (view.keys) this.keycap(['J', 'K', 'L'][level], r.x + 10, r.y + 10)
    }
    // Thermometer.
    const t = THERMO
    const lo = 140
    const hi = 232
    const toX = (temp: number) => t.x + ((Math.min(hi, Math.max(lo, temp)) - lo) / (hi - lo)) * t.w
    this.panel(t, 'rgba(255,248,235,0.85)', 6)
    ctx.fillStyle = 'rgba(232,69,60,0.35)'
    ctx.fillRect(toX(OVERHEAT), t.y, t.x + t.w - toX(OVERHEAT), t.h)
    ctx.fillStyle = 'rgba(76,175,80,0.35)'
    ctx.fillRect(toX(KNOB_TARGET[1] - 12), t.y, toX(KNOB_TARGET[1] + 12) - toX(KNOB_TARGET[1] - 12), t.h)
    const mx = toX(s.oil)
    ctx.fillStyle = s.overheated ? '#e8453c' : INK
    ctx.beginPath()
    ctx.moveTo(mx, t.y + t.h + 1)
    ctx.lineTo(mx - 5, t.y + t.h + 8)
    ctx.lineTo(mx + 5, t.y + t.h + 8)
    ctx.fill()
    ctx.fillRect(mx - 1.5, t.y - 1, 3, t.h + 2)
    ctx.font = `800 10px ${BODY}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,248,235,0.8)'
    ctx.fillText(`Minyak ${Math.round(s.oil)}°C`, t.x, t.y + t.h + 13)
    if (s.overheated && Math.sin(this.clock * 10) > -0.3) {
      ctx.textAlign = 'right'
      ctx.fillStyle = '#ffb3a6'
      ctx.fillText('kepanasan!', t.x + t.w, t.y + t.h + 13)
    }
  }

  private drawWok(s: GameState, view: View): void {
    const ctx = this.ctx
    // Flames licking round the rim, bigger with the knob.
    const flame = [0.45, 0.75, 1.15][s.knob]
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + this.clock * 0.6
      const flick = 0.75 + 0.25 * Math.sin(this.clock * 17 + i * 3)
      const len = 9 * flame * flick
      const r0 = WOK.r - 2
      ctx.fillStyle = s.knob === 2 ? 'rgba(255,140,50,0.85)' : 'rgba(80,140,255,0.8)'
      ctx.beginPath()
      ctx.moveTo(WOK.x + Math.cos(a - 0.08) * r0, WOK.y + Math.sin(a - 0.08) * r0)
      ctx.lineTo(WOK.x + Math.cos(a) * (r0 + len), WOK.y + Math.sin(a) * (r0 + len))
      ctx.lineTo(WOK.x + Math.cos(a + 0.08) * r0, WOK.y + Math.sin(a + 0.08) * r0)
      ctx.fill()
    }
    // Iron wok and oil.
    ctx.fillStyle = '#2b2b2e'
    ctx.beginPath()
    ctx.arc(WOK.x, WOK.y, WOK.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#444449'
    ctx.beginPath()
    ctx.arc(WOK.x, WOK.y, WOK.r - 4, 0, Math.PI * 2)
    ctx.fill()
    const heat = Math.min(1, Math.max(0, (s.oil - 150) / 70))
    const og = ctx.createRadialGradient(WOK.x - 20, WOK.y - 24, 10, WOK.x, WOK.y, WOK.r - 10)
    og.addColorStop(0, s.overheated ? '#d99a3a' : '#f7cd63')
    og.addColorStop(1, lerpRGB([214, 150, 40], [150, 84, 24], heat))
    ctx.fillStyle = og
    ctx.beginPath()
    ctx.arc(WOK.x, WOK.y, WOK.r - 12, 0, Math.PI * 2)
    ctx.fill()
    // Shimmer.
    ctx.strokeStyle = 'rgba(255,248,210,0.35)'
    ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(WOK.x, WOK.y, 30 + i * 22 + Math.sin(this.clock * 2 + i) * 3, -2.4 + i * 0.2, -1.6 + i * 0.2)
      ctx.stroke()
    }
    // Handles.
    ctx.fillStyle = '#1e1e20'
    ctx.fillRect(WOK.x - WOK.r - 10, WOK.y - 6, 14, 12)
    ctx.fillRect(WOK.x + WOK.r - 4, WOK.y - 6, 14, 12)

    const holding = s.hand && (!ITEMS[s.hand.kind].needsBatter || s.hand.battered)
    const draggingSlot = view.drag?.target.k === 'wok' ? view.drag.target.slot : -1
    WOK_SLOTS_AT.forEach((p, i) => {
      const f = s.wok[i]
      if (!f) {
        ctx.strokeStyle = 'rgba(255,248,220,0.35)'
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, 26, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        if (holding) this.glow({ x: p.x, y: p.y, r: 28 })
        if (view.keys) this.keycap('QWER'[i], p.x, p.y)
        return
      }
      if (i === draggingSlot) return
      const d = doneness(f)
      const bp = burnPoint(f.kind, s.overheated)
      const cook = f.burnt ? 2 : d < 1 ? d : 1 + ((d - 1) / (bp - 1)) * 0.95
      const wob = Math.sin(this.clock * 9 + i) * 0.6
      drawFood(ctx, f.kind, p.x, p.y + wob, 46, { cook, rot: (i % 2 ? 0.2 : -0.15) + wob * 0.02 })
      if (f.dinged && !f.burnt) this.glow({ x: p.x, y: p.y, r: 27 }, 'rgba(130, 240, 120, 0.95)')
      // Doneness meter: mentah | pas | gosong.
      const bw = 56
      const bx = p.x - bw / 2
      const by = p.y + 25
      const span = bp + 0.3
      const toX = (v: number) => bx + (Math.min(span, v) / span) * bw
      ctx.fillStyle = 'rgba(20,14,10,0.6)'
      ctx.beginPath()
      ctx.roundRect(bx - 2, by - 2, bw + 4, 10, 4)
      ctx.fill()
      ctx.fillStyle = '#efe3c4'
      ctx.fillRect(bx, by, toX(1) - bx, 6)
      ctx.fillStyle = '#58c45a'
      ctx.fillRect(toX(1), by, toX(bp) - toX(1), 6)
      ctx.fillStyle = '#e8453c'
      ctx.fillRect(toX(bp), by, bx + bw - toX(bp), 6)
      const mx = toX(f.burnt ? span : d)
      ctx.fillStyle = '#fff'
      ctx.fillRect(mx - 1.5, by - 3, 3, 12)
      if (view.keys) this.keycap('QWER'[i], p.x + 26, p.y - 22)
    })
  }

  private drawTepung(s: GameState, view: View): void {
    const ctx = this.ctx
    const t = TEPUNG
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(t.x + 3, t.y + 5, t.r, t.r * 0.9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3d8fb8'
    ctx.beginPath()
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5fb0d6'
    ctx.beginPath()
    ctx.arc(t.x, t.y, t.r - 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f7f0dc'
    ctx.beginPath()
    ctx.arc(t.x, t.y, t.r - 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(220,205,170,0.6)'
    ctx.beginPath()
    ctx.ellipse(t.x - 8, t.y - 6, 16, 9, 0.4, 0, Math.PI * 2)
    ctx.fill()
    this.label('Tepung', t.x, t.y + 8, 13, '#8a7650')
    const needs = s.hand && ITEMS[s.hand.kind].needsBatter && !s.hand.battered
    if (needs) this.glow({ x: t.x, y: t.y, r: t.r + 4 })
    if (view.keys) this.keycap('T', t.x + t.r - 8, t.y - t.r + 8)
  }

  private drawBins(s: GameState, view: View): void {
    const ctx = this.ctx
    const menu = s.config.menu
    const rects = binRects(menu)
    // Trash can.
    const tr = TRASH
    const overTrash = view.drag && view.drag.at.x < tr.x + tr.w + 6 && view.drag.at.y > tr.y - 6
    ctx.fillStyle = overTrash ? '#7f8c8d' : '#5f6a6b'
    ctx.beginPath()
    ctx.roundRect(tr.x + 6, tr.y + 10, tr.w - 12, tr.h - 12, 4)
    ctx.fill()
    ctx.fillStyle = '#4b5455'
    ctx.fillRect(tr.x + 3, tr.y + 6, tr.w - 6, 6)
    this.label('Buang', tr.x + tr.w / 2, tr.y + tr.h - 12, 9, '#e7ecec')
    rects.forEach((r, i) => {
      const kind = menu[i]
      const held = s.hand?.kind === kind
      ctx.fillStyle = held ? '#f6dfa0' : '#c79a64'
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 9)
      ctx.fill()
      ctx.fillStyle = held ? '#fff2c8' : '#e2bf8a'
      ctx.beginPath()
      ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 20, 7)
      ctx.fill()
      const s2 = Math.min(30, r.w * 0.5)
      if (!held) {
        drawFood(ctx, kind, r.x + r.w / 2 - s2 * 0.35, r.y + 20, s2, { rot: -0.2 })
        drawFood(ctx, kind, r.x + r.w / 2 + s2 * 0.35, r.y + 22, s2, { rot: 0.3 })
      }
      ctx.font = `800 ${r.w < 58 ? 9 : 10}px ${BODY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = INK
      ctx.fillText(BIN_NAME[kind], r.x + r.w / 2, r.y + r.h - 9)
      if (ITEMS[kind].needsBatter) {
        ctx.fillStyle = '#5fb0d6'
        ctx.beginPath()
        ctx.arc(r.x + r.w - 8, r.y + 8, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      if (view.keys) this.keycap(String(i + 1), r.x + 9, r.y + 9)
    })
    void BIN_ROW
  }

  private drawHand(s: GameState, view: View): void {
    const ctx = this.ctx
    const d = view.drag
    if (d) {
      const at = { x: d.at.x, y: d.at.y - 22 }
      const t = d.target
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.3)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 6
      if ((t.k === 'bin' || t.k === 'tepung') && s.hand) drawFood(ctx, s.hand.kind, at.x, at.y, 46, { battered: s.hand.battered })
      else if (t.k === 'wok' && s.wok[t.slot]) {
        const f = s.wok[t.slot]!
        drawFood(ctx, f.kind, at.x, at.y, 46, { cook: f.burnt ? 2 : Math.min(1.5, doneness(f)) })
      } else if (t.k === 'tray' && s.tray[t.slot]) drawFood(ctx, s.tray[t.slot]!.kind, at.x, at.y, 44, { cook: 1.08 })
      else if (t.k === 'mat' && s.bungkus) {
        if (t.index >= 0 && s.bungkus.items[t.index]) drawFood(ctx, s.bungkus.items[t.index].kind, at.x, at.y, 36, { cook: 1.08 })
        else if (t.index < 0) drawWrapIcon(ctx, s.bungkus.wrap, at.x, at.y, 48)
      } else if (t.k === 'extra') {
        if (t.extra === 'cabe') drawChili(ctx, at.x, at.y, 30)
        else drawSauce(ctx, at.x, at.y, 34)
      }
      ctx.restore()
      if ((t.k === 'bin' || t.k === 'tepung') && s.hand) return
    }
    if (!s.hand) return
    const p = handRest(s.config.menu, s.hand.kind)
    const bob = Math.sin(this.clock * 5) * 2
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 5
    drawFood(ctx, s.hand.kind, p.x, p.y - 4 + bob, 46, { battered: s.hand.battered, rot: -0.1 })
    ctx.restore()
  }
}

function rp(n: number): string {
  return `Rp${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

function pickLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]
}

function clampX(x: number, half: number): number {
  return Math.min(STAGE_W - half - 4, Math.max(half + 4, x))
}

function nopeSpot(action: string, slot?: number): Pt {
  switch (action) {
    case 'fry':
    case 'lift':
      return slot !== undefined ? { x: WOK_SLOTS_AT[slot].x, y: WOK_SLOTS_AT[slot].y - 34 } : { x: WOK.x, y: WOK.y }
    case 'dip':
      return { x: TEPUNG.x - 20, y: TEPUNG.y - TEPUNG.r - 10 }
    case 'pack':
    case 'unpack':
    case 'wrap':
    case 'extra':
      return { x: MAT.x + MAT.w / 2, y: MAT.y - 6 }
    case 'serve':
      return { x: slot !== undefined ? SPOT_X[slot] : STAGE_W / 2, y: COUNTER_Y - 20 }
    default:
      return { x: STAGE_W / 2, y: STAGE_H / 2 }
  }
}
