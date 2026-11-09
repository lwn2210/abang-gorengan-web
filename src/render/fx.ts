// Cosmetic particles and pop-up texts. Lives entirely on the render side and
// uses Math.random freely; nothing here feeds back into the sim.

export interface Particle {
  kind: 'bubble' | 'steam' | 'smoke' | 'splash' | 'coin' | 'crumb'
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color?: string
}

export interface FloatText {
  text: string
  x: number
  y: number
  life: number
  max: number
  color: string
  size: number
  /** Speech-bubble style instead of floating outline text. */
  speech?: boolean
}

export class Fx {
  particles: Particle[] = []
  texts: FloatText[] = []
  /** Screen shake, decays. */
  shake = 0

  add(p: Omit<Particle, 'max'> & { max?: number }): void {
    if (this.particles.length > 400) return
    this.particles.push({ ...p, max: p.max ?? p.life })
  }

  text(text: string, x: number, y: number, color = '#fff', size = 18, life = 1.3): void {
    this.texts.push({ text, x, y, life, max: life, color, size })
  }

  speech(text: string, x: number, y: number, life = 1.8): void {
    // One line per spot: a new remark replaces the old one.
    this.texts = this.texts.filter((t) => !(t.speech && Math.abs(t.x - x) < 10))
    this.texts.push({ text, x, y, life, max: life, color: '#2a1e17', size: 14, speech: true })
  }

  splash(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
      const v = 40 + Math.random() * 70
      this.add({ kind: 'splash', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.2, size: 1.5 + Math.random() * 1.5 })
    }
  }

  /** Coins fly from (x, y) up to (tx, ty), where the money counter is. */
  coins(x: number, y: number, n: number, tx: number, ty: number): void {
    for (let i = 0; i < n; i++) {
      const life = 0.6 + i * 0.06
      const sx = x + (Math.random() - 0.5) * 30
      const sy = y + (Math.random() - 0.5) * 16
      this.add({ kind: 'coin', x: sx, y: sy, vx: (tx - sx) / life, vy: (ty - sy) / life, life, size: 4 + Math.random() * 2 })
    }
  }

  puff(x: number, y: number, n: number, color = 'rgba(70,60,55,0.5)'): void {
    for (let i = 0; i < n; i++)
      this.add({
        kind: 'smoke',
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 14,
        vy: -20 - Math.random() * 20,
        life: 1 + Math.random() * 0.8,
        size: 8 + Math.random() * 8,
        color,
      })
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 3)
    for (const p of this.particles) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 'splash' || p.kind === 'crumb') p.vy += 420 * dt
      if (p.kind === 'steam' || p.kind === 'smoke') {
        p.vx += (Math.random() - 0.5) * 30 * dt
        p.size += dt * 6
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    for (const t of this.texts) {
      t.life -= dt
      if (!t.speech) t.y -= 26 * dt
    }
    this.texts = this.texts.filter((t) => t.life > 0)
  }

  draw(ctx: CanvasRenderingContext2D, layer: 'under' | 'over'): void {
    for (const p of this.particles) {
      const isOver = p.kind === 'smoke' || p.kind === 'steam' || p.kind === 'coin'
      if ((layer === 'over') !== isOver) continue
      const k = p.life / p.max
      switch (p.kind) {
        case 'bubble':
          ctx.strokeStyle = `rgba(255, 236, 170, ${0.7 * k})`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1.2 - k * 0.4), 0, Math.PI * 2)
          ctx.stroke()
          break
        case 'splash':
          ctx.fillStyle = `rgba(255, 214, 110, ${k})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'crumb':
          ctx.fillStyle = p.color ?? '#c98a3a'
          ctx.globalAlpha = k
          ctx.fillRect(p.x, p.y, p.size, p.size)
          ctx.globalAlpha = 1
          break
        case 'steam':
          ctx.fillStyle = `rgba(255, 255, 255, ${0.28 * k})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'smoke':
          ctx.fillStyle = p.color ?? 'rgba(70,60,55,0.5)'
          ctx.globalAlpha = Math.min(1, k * 1.4)
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
          break
        case 'coin':
          ctx.fillStyle = '#f5c542'
          ctx.strokeStyle = '#b8862a'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size, p.size * Math.abs(Math.cos(p.life * 14)), 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          break
      }
    }
  }

  drawTexts(ctx: CanvasRenderingContext2D, display: string, body: string): void {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const t of this.texts) {
      const fade = Math.min(1, t.life / 0.3)
      const pop = Math.min(1, (t.max - t.life) / 0.12)
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(t.x, t.y)
      ctx.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop)
      if (t.speech) {
        ctx.font = `800 ${t.size}px ${body}`
        const w = ctx.measureText(t.text).width + 18
        ctx.fillStyle = '#fffaf0'
        ctx.strokeStyle = 'rgba(42,30,23,0.35)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(-w / 2, -14, w, 28, 14)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = t.color
        ctx.fillText(t.text, 0, 1)
      } else {
        ctx.font = `${t.size}px ${display}`
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(42, 25, 10, 0.75)'
        ctx.strokeText(t.text, 0, 0)
        ctx.fillStyle = t.color
        ctx.fillText(t.text, 0, 0)
      }
      ctx.restore()
    }
  }
}
