import { ITEMS, dayConfig, rupiah } from './sim/menu'
import { DAY_LENGTH, DT, clockAt, createDay, earnings, step, type GameState } from './sim/game'
import { botAct } from './sim/bot'
import {
  DEFAULT_UPGRADES,
  NEW_GAME,
  dayResult,
  nextProgress,
  parseProgress,
  parseRecords,
  updateRecords,
  type DayResult,
  type Progress,
  type Records,
} from './sim/progress'
import { Scene } from './render/scene'
import { Input } from './input'
import { Sfx } from './audio'
import { hintFor } from './hints'

const PROGRESS_KEY = 'abang-gorengan.progress'
const RECORDS_KEY = 'abang-gorengan.records'
/** The menu's background demo: a bot tapping about every 0.4 s. */
const DEMO_EVERY = 26

type Mode = 'menu' | 'intro' | 'play' | 'pause' | 'result'

function $(id: string): HTMLElement {
  return document.getElementById(id)!
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or full: the game still works, it just forgets.
  }
}

function newSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0
}

const DAY_NEWS: Record<number, string[]> = {
  1: [
    'Ketuk <b>adonan</b> → celup <b>tepung</b> kalau ada titik biru → masukin <b>wajan</b>.',
    'Angkat pas indikatornya <b>hijau</b>. Telat dikit, gosong!',
    'Ketuk gorengan di <b>peniris</b> buat dibungkus, lalu ketuk <b>pembelinya</b>.',
    'Semuanya bisa juga <b>diseret</b>. Kompor gede = cepet mateng, tapi minyak gampang kepanasan.',
  ],
  2: ['Menu baru: <b>Tempe mendoan</b>, cepet banget matengnya.', '<b>Ojol</b> mulai mampir: buru-buru, maunya <b>plastik</b>, tipnya gede.'],
  3: ['Menu baru: <b>Cireng</b>. <b>Saus</b> udah ada.', 'Awas pembeli <b>rewel</b>: nggak mau gorengan yang masih netes minyak atau udah dingin.'],
  4: ['Menu baru: <b>Combro</b>, lama matengnya.', 'Pembeli makin rame, makin nggak sabaran.'],
}

export class App {
  private scene: Scene
  private input: Input
  private sfx = new Sfx()
  private mode: Mode = 'menu'
  private state: GameState
  private demoTick = 0
  private acc = 0
  private last = performance.now()
  private progress: Progress
  private records: Records
  private lastResult: DayResult | null = null
  private hudCache = new Map<string, string>()
  /** `?debug`: a live log of actions and refusals, for devices without a console. */
  private debug = import.meta.env.DEV && new URLSearchParams(location.search).has('debug')
  /** `?speed=0.25` in dev: slow time down, for driving the game through slow test tools. */
  private timeScale = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('speed')) || 1 : 1
  private debugLines: string[] = []

  private debugLog(line: string): void {
    this.debugLines = [...this.debugLines.slice(-9), `${this.state.time.toFixed(1)} ${line}`]
    let el = document.getElementById('debug')
    if (!el) {
      el = document.createElement('pre')
      el.id = 'debug'
      el.style.cssText = 'position:fixed;left:0;bottom:0;margin:0;padding:4px;font:10px monospace;background:rgba(0,0,0,.6);color:#fff;z-index:99;pointer-events:none;white-space:pre-wrap;max-width:100%'
      document.body.appendChild(el)
    }
    el.textContent = this.debugLines.join('\n')
  }

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new Scene(canvas)
    this.progress = parseProgress(load(PROGRESS_KEY))
    this.records = parseRecords(load(RECORDS_KEY))
    this.state = createDay(3, newSeed())
    this.input = new Input(canvas, (x, y) => this.scene.toStage(x, y), () => this.state)
    window.addEventListener('resize', () => this.scene.resize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.pause()
    })
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      if (k === 'm') this.toggleMute()
      else if ((k === 'escape' || k === 'p') && this.mode === 'play') this.pause()
      else if ((k === 'escape' || k === 'p') && this.mode === 'pause') this.resume()
    })
    if (this.debug)
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend'])
        window.addEventListener(type, (e) => this.debugLog(`${type} ${'pointerId' in e ? (e as PointerEvent).pointerId : ''}`), true)
    this.bindUi()
    this.showMenu()
    requestAnimationFrame((t) => this.frame(t))
  }

  private shopPreviousOverlay: 'intro' | 'result' | 'menu' = 'intro'

  private bindUi(): void {
    $('mute').addEventListener('click', () => this.toggleMute())
    $('mute').textContent = this.sfx.muted ? '🔇' : '🔊'
    $('pause').addEventListener('click', () => this.pause())
    $('play').addEventListener('click', () => this.showIntro(this.progress))
    $('restart').addEventListener('click', () => {
      this.progress = { ...NEW_GAME }
      save(PROGRESS_KEY, this.progress)
      this.showIntro(this.progress)
    })
    $('start-day').addEventListener('click', () => this.startDay())
    $('resume').addEventListener('click', () => this.resume())
    $('quit').addEventListener('click', () => this.showMenu())
    $('next').addEventListener('click', () => this.showIntro(this.progress))
    $('to-menu').addEventListener('click', () => this.showMenu())
    $('share-score').addEventListener('click', () => this.shareResult())
    $('open-shop-intro').addEventListener('click', () => this.showShop('intro'))
    $('open-shop-result').addEventListener('click', () => this.showShop('result'))
    $('close-shop').addEventListener('click', () => this.closeShop())
  }

  private toggleMute(): void {
    $('mute').textContent = this.sfx.toggleMute() ? '🔇' : '🔊'
  }

  private overlay(id: 'menu' | 'intro' | 'paused' | 'result' | 'shop' | null): void {
    for (const o of ['menu', 'intro', 'paused', 'result', 'shop']) $(o).hidden = o !== id
    $('hud').hidden = this.mode !== 'play' && this.mode !== 'pause'
  }

  private showMenu(): void {
    this.mode = 'menu'
    this.input.enabled = false
    this.state = createDay(3, newSeed())
    this.demoTick = 0
    const p = this.progress
    $('play').textContent = p.day > 1 ? `Lanjut Hari ${p.day}` : 'Mulai dagang'
    $('restart').hidden = p.day <= 1
    const r = this.records
    $('menu-records').innerHTML =
      r.bestEarnings > 0
        ? `Rekor sehari: <b>${rupiah(r.bestEarnings)}</b> (hari ${r.bestEarningsDay}) · Paling jauh: <b>hari ${r.bestDay}</b>`
        : 'Belum ada rekor. Ayo buka lapak!'
    this.overlay('menu')
  }

  private showIntro(p: Progress): void {
    this.mode = 'intro'
    this.input.enabled = false
    this.state = createDay(p.day, newSeed(), p.rep, p.upgrades)
    const cfg = dayConfig(p.day)
    $('intro-title').textContent = `Hari ${cfg.day}`
    $('intro-sub').textContent = cfg.day === 1 ? 'Hari pertama buka lapak gorengan!' : 'Gerobak siap, minyak udah panas.'
    const news = DAY_NEWS[cfg.day] ?? ['Makin rame! Pembeli makin nggak sabaran.']
    $('intro-news').innerHTML = news.map((n) => `<li>${n}</li>`).join('')
    $('intro-menu').textContent = `Menu: ${cfg.menu.map((k) => ITEMS[k].name).join(', ')}`
    $('intro-target').innerHTML = `Setoran hari ini: <b>${rupiah(cfg.target)}</b>`
    this.overlay('intro')
  }

  private startDay(): void {
    this.mode = 'play'
    this.acc = 0
    this.input.reset()
    this.input.enabled = true
    this.hudCache.clear()
    this.overlay(null)
  }

  private pause(): void {
    if (this.mode !== 'play') return
    this.mode = 'pause'
    this.input.enabled = false
    this.input.reset()
    this.overlay('paused')
  }

  private resume(): void {
    if (this.mode !== 'pause') return
    this.mode = 'play'
    this.input.enabled = true
    this.last = performance.now()
    this.overlay(null)
  }

  private endDay(): void {
    const s = this.state
    const res = dayResult(s)
    this.lastResult = res
    const { records, newBest } = updateRecords(this.records, res)
    this.records = records
    this.progress = nextProgress(s, this.progress)
    save(RECORDS_KEY, records)
    save(PROGRESS_KEY, this.progress)
    this.mode = 'result'
    this.input.enabled = false

    $('result-title').textContent = res.passed ? `Hari ${res.day} beres!` : res.fail === 'rep' ? 'Pelanggan pada kapok…' : 'Setoran kurang…'
    $('result-sub').textContent = res.passed
      ? 'Setoran aman. Besok lanjut dagang!'
      : res.fail === 'rep'
        ? 'Reputasi habis. Ulang hari ini, ya.'
        : `Kurang ${rupiah(res.target - res.earnings)} lagi. Coba ulang hari ini.`
    $('result-money').textContent = rupiah(res.earnings)
    $('result-target').textContent = `dari setoran ${rupiah(res.target)}`
    const delta = res.repDelta >= 0 ? `+${res.repDelta.toFixed(1)}` : res.repDelta.toFixed(1)
    $('result-stats').innerHTML = [
      ['Jualan', rupiah(res.sales)],
      ['Tip', rupiah(res.tips)],
      ['Pembeli puas', `${res.served} 😊`],
      ['Kabur', `${res.walkouts} 😤`],
      ['Gosong', String(res.burnt)],
      ['Salah bungkus', String(res.wrong)],
      ['Reputasi', `${res.rep.toFixed(1)} ★ (${delta})`],
    ]
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
      .join('')
    $('result-best').innerHTML = newBest ? '<span class="badge">Rekor baru!</span>' : `Rekor sehari: ${rupiah(records.bestEarnings)} (hari ${records.bestEarningsDay})`
    $('next').textContent = res.passed ? `Lanjut Hari ${this.progress.day}` : `Ulangi Hari ${this.progress.day}`
    $('result').classList.toggle('win', res.passed)
    this.overlay('result')
  }

  private shareResult(): void {
    const res = this.lastResult
    if (!res) return
    const text =
      `🥢 LAPORAN DAGANG ABANG GORENGAN 🥢\n` +
      `📅 Hari: ${res.day}\n` +
      `💰 Total Omzet: ${rupiah(res.earnings)} (Target: ${rupiah(res.target)})\n` +
      `😊 Pembeli Puas: ${res.served}\n` +
      `⭐ Reputasi: ${res.rep.toFixed(1)}/5.0 ★\n` +
      `🔥 Gorengan Gosong: ${res.burnt}\n\n` +
      `Bisa kalahin omzet dagang saya? Main gratis di:\n` +
      `👉 https://lwn2210.github.io/mini-arcade/abang-gorengan/`

    const btn = $('share-score')
    if (navigator.share) {
      navigator.share({ title: 'Rekor Abang Gorengan!', text, url: 'https://lwn2210.github.io/mini-arcade/abang-gorengan/' }).catch(() => {})
    } else {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ Rekor Disalin ke Clipboard!'
        setTimeout(() => { btn.textContent = '📤 Pamer Rekor (WhatsApp/Medsos)' }, 2000)
      }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
      })
    }
  }

  private showShop(from: 'intro' | 'result' | 'menu'): void {
    this.shopPreviousOverlay = from
    this.renderShop()
    this.overlay('shop')
  }

  private renderShop(): void {
    const p = this.progress
    const savings = p.savings ?? 0
    const upgrades = p.upgrades ?? { ...DEFAULT_UPGRADES }
    $('shop-savings').textContent = `Tabungan: ${rupiah(savings)}`

    const list = $('shop-list')
    list.innerHTML = ''

    const SHOP_ITEMS = [
      {
        id: 'turboStove' as const,
        name: 'Kompor Gas Turbo',
        icon: '🔥',
        desc: 'Minyak lebih cepat panas dan menggoreng 20% lebih gesit.',
        maxLevel: 2,
        cost: (lvl: number) => (lvl === 0 ? 25000 : 50000),
        benefit: (lvl: number) => (lvl > 0 ? `Level ${lvl}: +${lvl * 20}% Kecepatan Goreng` : 'Belum dibeli'),
      },
      {
        id: 'cabeSetan' as const,
        name: 'Cabe Rawit Setan',
        icon: '🌶️',
        desc: 'Cabe rawit mantap bikin pembeli puas ngasih tip lebih banyak.',
        maxLevel: 2,
        cost: (lvl: number) => (lvl === 0 ? 20000 : 40000),
        benefit: (lvl: number) => (lvl > 0 ? `Level ${lvl}: +Rp ${lvl * 500} Tip Tiap Order` : 'Belum dibeli'),
      },
      {
        id: 'minyakEmas' as const,
        name: 'Minyak Sawit Emas',
        icon: '🛢️',
        desc: 'Minyak jernih berkualitas, gorengan tahan matang lebih lama sebelum gosong.',
        maxLevel: 2,
        cost: (lvl: number) => (lvl === 0 ? 20000 : 45000),
        benefit: (lvl: number) => (lvl > 0 ? `Level ${lvl}: +${lvl * 35}% Waktu Tahan Gosong` : 'Belum dibeli'),
      },
      {
        id: 'esTeh' as const,
        name: 'Termos Es Teh Manis',
        icon: '🧊',
        desc: 'Kasih es teh manis dingin buat pembeli yang nunggu di antrean.',
        maxLevel: 1,
        cost: () => 30000,
        benefit: (lvl: number) => (lvl > 0 ? 'Aktif: +25% Kesabaran Antrean' : 'Belum aktif'),
      },
    ]

    for (const item of SHOP_ITEMS) {
      const currentLevel = upgrades[item.id] ?? 0
      const isMax = currentLevel >= item.maxLevel
      const cost = isMax ? 0 : item.cost(currentLevel)
      const canAfford = savings >= cost && !isMax

      const card = document.createElement('div')
      card.className = 'shop-card'
      card.innerHTML = `
        <div class="shop-icon">${item.icon}</div>
        <div class="shop-info">
          <div class="shop-title">${item.name} (${currentLevel}/${item.maxLevel})</div>
          <div class="shop-desc">${item.desc}</div>
          <div class="shop-stat">${item.benefit(currentLevel)}</div>
        </div>
        <button class="shop-buy" ${canAfford ? '' : 'disabled'}>
          ${isMax ? 'MAX ✅' : `Beli ${rupiah(cost)}`}
        </button>
      `

      const btn = card.querySelector<HTMLButtonElement>('.shop-buy')!
      if (canAfford) {
        btn.addEventListener('click', () => {
          this.progress.savings = savings - cost
          this.progress.upgrades = { ...upgrades, [item.id]: currentLevel + 1 }
          save(PROGRESS_KEY, this.progress)
          this.sfx.ding()
          this.renderShop()
        })
      }
      list.appendChild(card)
    }
  }

  private closeShop(): void {
    if (this.shopPreviousOverlay === 'intro') this.showIntro(this.progress)
    else if (this.shopPreviousOverlay === 'result') this.overlay('result')
    else this.showMenu()
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    if (this.mode === 'play' || this.mode === 'menu') {
      this.acc += dt * this.timeScale
      let guard = 0
      while (this.acc >= DT && guard++ < 12) {
        this.acc -= DT
        this.tick()
        if (this.mode !== 'play' && this.mode !== 'menu') break
      }
      if (guard >= 12) this.acc = 0
    }
    const view = {
      ...this.input.view(),
      hint: this.mode === 'play' ? hintFor(this.state, this.state.day <= 2) : null,
    }
    this.scene.draw(this.state, view, dt)
    this.sfx.update(this.mode === 'play' ? this.state : null, dt)
    if (this.mode === 'play' || this.mode === 'pause') this.updateHud()
    requestAnimationFrame((t) => this.frame(t))
  }

  private tick(): void {
    const s = this.state
    if (this.mode === 'menu') {
      // Background demo: the bot runs the cart, silently.
      const a = this.demoTick++ % DEMO_EVERY === 0 ? botAct(s) : null
      const ev = step(s, a ? [a] : [])
      this.scene.onEvents(s, ev)
      if (s.phase === 'over') {
        this.state = createDay(3, newSeed())
        this.demoTick = 0
      }
      return
    }
    const actions = this.input.take()
    if (this.debug && actions.length) this.debugLog(actions.map((a) => JSON.stringify(a)).join(' '))
    const ev = step(s, actions)
    if (this.debug) for (const e of ev) if (e.e === 'nope' || e.e === 'drop' || e.e === 'take') this.debugLog(`  → ${JSON.stringify(e)}`)
    this.scene.onEvents(s, ev)
    for (const e of ev) this.sfx.event(e)
    if (s.phase === 'over') this.endDay()
  }

  private setText(id: string, text: string): void {
    if (this.hudCache.get(id) === text) return
    this.hudCache.set(id, text)
    $(id).textContent = text
  }

  private updateHud(): void {
    const s = this.state
    this.setText('hud-day', `Hari ${s.day}`)
    this.setText('hud-clock', s.phase === 'open' ? clockAt(s.time) : 'Tutup')
    const money = earnings(s)
    this.setText('hud-money', rupiah(money))
    this.setText('hud-target', `/ ${Math.round(s.config.target / 1000)}rb`)
    const pct = Math.min(100, (money / s.config.target) * 100)
    const meter = $('hud-meter')
    meter.style.width = `${pct}%`
    meter.classList.toggle('done', pct >= 100)
    $('hud-stars-fill').style.width = `${(s.rep / 5) * 100}%`
    this.setText('hud-rep', s.rep.toFixed(1))
    $('hud-time').style.width = `${Math.min(100, (s.time / DAY_LENGTH) * 100)}%`
  }
}
