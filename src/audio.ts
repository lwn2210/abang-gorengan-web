import { cookSpeed, type GameState, type SimEvent } from './sim/game'

// Every sound is synthesised with Web Audio, so there are no files to ship.
// It only listens to the sim (state and events) and never feeds back into it.
// The context starts on the first tap or key press (iOS and Safari refuse to
// play before one). Note: on iPhone, the silent switch also mutes Web Audio.

const MUTE_KEY = 'abang-gorengan.mute'

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private sizzle: { gain: GainNode; filter: BiquadFilterNode } | null = null
  private crackle = 0
  private bgmTime = 0
  private bgmStep = 0
  muted = false

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      this.muted = false
    }
    const unlock = () => this.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchend', unlock)
  }

  private unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.8
      this.master.connect(ctx.destination)
      const length = ctx.sampleRate * 2
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      // The oil: a steady hiss under everything.
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 2400
      const filter = ctx.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = 6000
      filter.gain.value = 6
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(hp).connect(filter).connect(gain).connect(this.master)
      src.start()
      this.sizzle = { gain, filter }
    }
    if (this.ctx.state !== 'running') void this.ctx.resume()
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      // Not remembered; fine.
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
    return this.muted
  }

  private ready(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' && this.master ? this.ctx : null
  }

  private tone(type: OscillatorType, from: number, to: number, start: number, length: number, volume: number, lowpass = 0): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, start)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + length)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    let node: AudioNode = osc
    if (lowpass) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = lowpass
      osc.connect(lp)
      node = lp
    }
    node.connect(gain).connect(this.master!)
    osc.start(start)
    osc.stop(start + length + 0.02)
  }

  private hiss(type: BiquadFilterType, freq: number, start: number, length: number, volume: number, q = 1): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bq = ctx.createBiquadFilter()
    bq.type = type
    bq.frequency.value = freq
    bq.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    src.connect(bq).connect(gain).connect(this.master!)
    src.start(start, Math.random() * 1.5)
    src.stop(start + length + 0.02)
  }

  /** Continuous sound: the oil hisses louder the more is in it and the hotter it is. */
  update(s: GameState | null, dt: number): void {
    const ctx = this.ready()
    if (!ctx || !this.sizzle) return
    const t = ctx.currentTime
    if (!s || s.phase === 'over') {
      this.sizzle.gain.gain.setTargetAtTime(0, t, 0.2)
      return
    }
    const pieces = s.wok.filter(Boolean).length
    const heat = Math.min(1.8, Math.max(0.15, (s.oil - 140) / 55))
    const level = (0.012 + pieces * 0.022) * heat * (s.overheated ? 1.4 : 1)
    this.sizzle.gain.gain.setTargetAtTime(level, t, 0.15)
    this.sizzle.filter.frequency.setTargetAtTime(4500 + heat * 2500, t, 0.3)
    // Pops and crackles from whatever's frying.
    this.crackle += pieces * cookSpeed(s.oil) * 4 * dt
    while (this.crackle >= 1) {
      this.crackle -= Math.random() * 1.6
      this.hiss('bandpass', 2500 + Math.random() * 3000, t + Math.random() * 0.05, 0.02 + Math.random() * 0.03, 0.05 + Math.random() * 0.08, 2)
    }

    // Cheerful street food acoustic gamelan ambience
    if ((s.phase === 'open' || s.phase === 'closing') && !this.muted) {
      this.bgmTime += dt
      if (this.bgmTime >= 0.28) {
        this.bgmTime -= 0.28
        const notes = [392, 0, 440, 523.2, 587.3, 0, 440, 392, 587.3, 523.2, 0, 440, 392, 440, 523.2, 0]
        const n = notes[this.bgmStep % notes.length]!
        this.bgmStep = (this.bgmStep + 1) % notes.length
        if (n > 0) {
          this.tone('triangle', n, n * 0.99, t, 0.16, 0.032, 1100)
          // Soft kendang bass on beat 0 and 8
          if (this.bgmStep % 8 === 1) {
            this.tone('sine', 110, 45, t, 0.18, 0.05)
          }
        }
      }
    }
  }

  /** Confirmation for a completed shop purchase; no context is created here. */
  ding(): void {
    this.event({ e: 'ding', slot: 0, kind: 'bakwan' })
  }

  event(e: SimEvent): void {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime
    switch (e.e) {
      case 'take':
        this.tone('sine', 520, 320, t, 0.07, 0.12)
        break
      case 'dip':
        this.tone('sine', 260, 90, t, 0.14, 0.25)
        this.hiss('lowpass', 900, t, 0.12, 0.12)
        break
      case 'fry':
        // The big tssshhh of something cold going into hot oil.
        this.hiss('highpass', 2200, t, 0.9, 0.35)
        this.hiss('bandpass', 5200, t + 0.02, 0.6, 0.2, 0.8)
        break
      case 'ding':
        this.tone('sine', 2093, 2093, t, 0.6, 0.18)
        this.tone('sine', 3136, 3136, t + 0.005, 0.45, 0.09)
        break
      case 'burnt':
        this.hiss('bandpass', 700, t, 0.6, 0.3, 1.2)
        this.tone('sawtooth', 140, 70, t, 0.4, 0.08, 600)
        break
      case 'lift':
        this.hiss('bandpass', 1600, t, 0.08, 0.15, 1.5)
        this.tone('triangle', 900, 600, t, 0.05, 0.05)
        break
      case 'trash':
        this.tone('square', 180, 90, t, 0.12, 0.08, 800)
        this.hiss('lowpass', 600, t, 0.15, 0.2)
        break
      case 'wrap':
      case 'pack':
      case 'unpack': {
        // Kresek-kresek: a handful of tiny crinkles.
        const n = e.e === 'wrap' ? 9 : 5
        const plastic = e.e === 'wrap' && e.wrap === 'plastik'
        for (let i = 0; i < n; i++) this.hiss('bandpass', (plastic ? 5500 : 3200) + Math.random() * 2500, t + i * 0.028 + Math.random() * 0.015, 0.025, 0.1 + Math.random() * 0.12, 3)
        break
      }
      case 'extra':
        if (e.extra === 'cabe') {
          this.hiss('bandpass', 4000, t, 0.04, 0.12, 2)
          this.hiss('bandpass', 4200, t + 0.07, 0.04, 0.1, 2)
        } else {
          this.hiss('bandpass', 700, t, 0.2, 0.18, 2)
          this.tone('sine', 300, 140, t, 0.18, 0.06)
        }
        break
      case 'knob':
        this.tone('square', 1300, 1100, t, 0.025, 0.05)
        if (e.level === 2) this.hiss('lowpass', 500, t + 0.02, 0.35, 0.25)
        break
      case 'serve': {
        // Kerincing: coins into the tin.
        const n = e.tip > 0 ? 6 : 3
        for (let i = 0; i < n; i++) {
          const f = 2600 + Math.random() * 1800
          this.tone('triangle', f, f * 0.98, t + i * 0.055 + Math.random() * 0.02, 0.18, 0.09)
        }
        break
      }
      case 'wrong':
        // "Hmm-mm", annoyed.
        this.tone('sawtooth', 210, 170, t, 0.16, 0.1, 500)
        this.tone('sawtooth', 180, 130, t + 0.18, 0.22, 0.1, 500)
        break
      case 'walkout':
        this.tone('sawtooth', 260, 110, t, 0.35, 0.12, 600)
        break
      case 'arrive':
        // Ojol rolls up with a "tin tin".
        if (e.type === 'ojol') {
          this.tone('square', 440, 440, t, 0.09, 0.05, 1600)
          this.tone('square', 554, 554, t, 0.09, 0.04, 1600)
          this.tone('square', 440, 440, t + 0.14, 0.12, 0.05, 1600)
          this.tone('square', 554, 554, t + 0.14, 0.12, 0.04, 1600)
        } else this.tone('sine', 880, 880, t, 0.12, 0.03)
        break
      case 'overheat':
        if (e.on) {
          this.tone('square', 880, 880, t, 0.08, 0.05, 2000)
          this.tone('square', 880, 880, t + 0.14, 0.08, 0.05, 2000)
        }
        break
      case 'nope':
        this.tone('sine', 220, 160, t, 0.1, 0.1)
        break
      case 'closing':
        ;[784, 659, 523].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.16, 0.3, 0.12))
        break
      case 'over':
        ;(e.failed ? [392, 330, 262] : [523, 659, 784, 1047]).forEach((f, i) => this.tone('triangle', f, f, t + i * 0.13, 0.35, 0.13))
        break
    }
  }
}
