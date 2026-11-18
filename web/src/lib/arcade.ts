/**
 * Arcade: five small games drawn at 368×368 with keyboard, touch and pointer
 * control. A recording of play becomes a looping clip for the badge (the
 * badge itself only plays media). Ported from Badge Studio's games.js,
 * Copyright (c) 2026 Badge Studio contributors, MIT License
 * (github.com/martinferreiraHCA/Badge).
 */
export type GameKind = 'snake' | 'pong' | 'breakout' | 'flappy' | 'dodge'
export const GAMES: Array<[GameKind, string, string]> = [
  ['snake', 'Snake', 'Eat, grow, don’t crash. Arrow keys, swipe, or tap the side you want to turn to.'],
  ['pong', 'Orbit Pong', 'Left paddle is yours: ↑/↓ or drag on the screen. First to 5 wins.'],
  ['breakout', 'Breakout', '←/→ or drag the paddle. Three lives to clear every brick.'],
  ['flappy', 'Flappy Badge', 'Tap or press Space to flap. Fly between the pipes.'],
  ['dodge', 'Meteor Dodge', 'Steer with ←/→ or drag. Dodge the falling rocks.'],
]

const W = 368, C = 184
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }
const COL = { a: '#00f2ff', b: '#a7b7ff', c: '#ff8f72', d: '#69dfd0' }
type Ball = { x: number; y: number; vx: number; vy: number }
// One loose game-state bag keeps the port close to the original.
type Game = {
  kind: GameKind; running: boolean; paused: boolean; over: boolean; won: boolean; score: number
  snake?: number[][]; dir?: number[]; next?: number[]; acc?: number; food?: number[] | null
  paddle?: number; ai?: number; ball?: Ball; opponent?: number; lives?: number
  bricks?: Array<{ x: number; y: number; on: boolean }>
  y?: number; vy?: number; pipes?: Array<{ x: number; gap: number; passed?: boolean }>; t?: number
  x?: number; rocks?: Array<{ x: number; y: number; r: number; v: number }>; spawn?: number
}

function text(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: string, y: number, size: number, color = '#f2f7f9', max = 280) {
  ctx.font = `650 ${size}px Manrope Variable, "Segoe UI", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = color
  ctx.fillText(s, C, y, max)
}

export class Arcade {
  kind: GameKind = 'snake'
  game: Game = { kind: 'snake', running: false, paused: false, over: false, won: false, score: 0 }
  held = new Set<string>()
  private swipeStart: [number, number] | null = null
  constructor(private onStatus: () => void = () => {}) {}

  highScore(kind = this.kind): number { try { return Number(localStorage.getItem('auracast.score.' + kind)) || 0 } catch { return 0 } }
  private setHighScore(kind: GameKind, score: number) { try { localStorage.setItem('auracast.score.' + kind, String(Math.max(score, this.highScore(kind)))) } catch { /* storage blocked */ } }

  select(kind: GameKind) { this.kind = kind; this.game = { kind, running: false, paused: false, over: false, won: false, score: 0 }; this.held.clear(); this.onStatus() }
  start() {
    const k = this.kind
    const g: Game = this.game = { kind: k, running: true, paused: false, over: false, won: false, score: 0 }
    if (k === 'snake') { Object.assign(g, { snake: [[7, 8], [6, 8], [5, 8]], dir: [1, 0], next: [1, 0], acc: 0 }); g.food = this.randomFood(g) }
    else if (k === 'pong') Object.assign(g, { paddle: 184, ai: 184, ball: { x: 184, y: 184, vx: 120, vy: 64 }, opponent: 0 })
    else if (k === 'breakout') Object.assign(g, { paddle: 184, ball: { x: 184, y: 240, vx: 90, vy: -115 }, lives: 3, bricks: Array.from({ length: 24 }, (_, i) => ({ x: 73 + (i % 6) * 37, y: 90 + ((i / 6) | 0) * 18, on: true })) })
    else if (k === 'flappy') Object.assign(g, { y: 184, vy: 0, pipes: [{ x: 420, gap: 150 }, { x: 620, gap: 200 }], t: 0 })
    else Object.assign(g, { x: 184, rocks: [], t: 0, spawn: 0 })
    this.held.clear()
    this.onStatus()
  }
  private finish(won = false) { const g = this.game; g.running = false; g.over = true; g.won = won; this.setHighScore(g.kind, g.score); this.onStatus() }
  togglePause() { if (this.game.running) { this.game.paused = !this.game.paused; this.onStatus() } }
  private randomFood(g: Game): number[] | null {
    const free: number[] = []
    for (let i = 0; i < 256; i++) if (!g.snake!.some((p) => p[1] * 16 + p[0] === i)) free.push(i)
    if (!free.length) return null
    const pos = free[Math.floor(Math.random() * free.length)]
    return [pos % 16, (pos / 16) | 0]
  }
  direction(key: string) {
    const g = this.game
    if (!g.running) return
    if (g.kind === 'snake') {
      const d = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[key]
      if (d && !(d[0] === -g.dir![0] && d[1] === -g.dir![1])) g.next = d
    }
    if (g.kind === 'flappy' && (key === 'ArrowUp' || key === 'Space')) g.vy = -210
  }
  status(): string {
    const g = this.game
    if (g.over) return `${g.won ? 'You won! ' : 'Game over. '}${g.score} points · best ${this.highScore(g.kind)}`
    if (!g.running) return `Ready. Your best: ${this.highScore(g.kind)}`
    if (g.paused) return 'Paused'
    if (g.kind === 'pong') return `${g.score} : ${g.opponent} · first to 5`
    return `${g.score} points${g.kind === 'breakout' ? ` · ${g.lives} lives` : ''}`
  }
  /** Pointer control in 0..368 logical units. */
  pointer(x: number, y: number, phase: 'down' | 'move' | 'up') {
    const g = this.game
    if (!g.running) return
    if (g.kind === 'pong') g.paddle = clamp(y, 94, 274)
    else if (g.kind === 'breakout') g.paddle = clamp(x, 99, 269)
    else if (g.kind === 'dodge') g.x = clamp(x, 60, 308)
    else if (g.kind === 'flappy' && phase === 'down') g.vy = -210
    else if (g.kind === 'snake' && phase === 'down') this.swipeStart = [x, y]
    else if (g.kind === 'snake' && phase === 'up' && this.swipeStart) {
      let dx = x - this.swipeStart[0], dy = y - this.swipeStart[1]
      if (Math.hypot(dx, dy) < 12) { dx = x - (g.snake![0][0] * 14 + 80); dy = y - (g.snake![0][1] * 14 + 80) } // tap: turn toward it
      this.direction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'))
      this.swipeStart = null
    }
  }
  step(dt: number) {
    const g = this.game, held = this.held
    if (!g.running || g.paused) return
    if (g.kind === 'snake') {
      g.acc! += dt
      if (g.acc! < Math.max(0.07, 0.15 - g.score * 0.002)) return
      g.acc = 0
      g.dir = g.next
      const h = [g.snake![0][0] + g.dir![0], g.snake![0][1] + g.dir![1]]
      const eat = !!g.food && h[0] === g.food[0] && h[1] === g.food[1]
      const body = eat ? g.snake! : g.snake!.slice(0, -1)
      if (h.some((v) => v < 0 || v >= 16) || body.some((p) => p[0] === h[0] && p[1] === h[1])) { this.finish(); return }
      g.snake!.unshift(h)
      if (eat) { g.score++; g.food = this.randomFood(g); if (!g.food) { this.finish(true); return } } else g.snake!.pop()
      this.onStatus()
      return
    }
    const b = g.ball!
    if (g.kind === 'pong') {
      const dy = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0)
      g.paddle = clamp(g.paddle! + dy * 210 * dt, 94, 274)
      g.ai = clamp(g.ai! + clamp(b.y - g.ai!, -1, 1) * Math.min(Math.abs(b.y - g.ai!) * 5, 104) * dt, 94, 274)
      b.x += b.vx * dt; b.y += b.vy * dt
      if (b.y < 76) { b.y = 76; b.vy = Math.abs(b.vy) }
      if (b.y > 292) { b.y = 292; b.vy = -Math.abs(b.vy) }
      if (b.vx < 0 && b.x < 83 && b.x > 66 && Math.abs(b.y - g.paddle!) < 28) { b.x = 83; b.vx = Math.min(230, Math.abs(b.vx) * 1.08); b.vy = (b.y - g.paddle!) * 4.3 }
      if (b.vx > 0 && b.x > 285 && b.x < 302 && Math.abs(b.y - g.ai!) < 28) { b.x = 285; b.vx = -Math.min(230, Math.abs(b.vx) * 1.06); b.vy = (b.y - g.ai!) * 4.3 }
      if (b.x < 62 || b.x > 306) {
        if (b.x > 306) g.score++; else g.opponent!++
        if (g.score >= 5 || g.opponent! >= 5) { this.finish(g.score >= 5); return }
        g.ball = { x: 184, y: 184, vx: b.x < 62 ? 120 : -120, vy: 65 * (Math.random() > 0.5 ? 1 : -1) }
        this.onStatus()
      }
    } else if (g.kind === 'breakout') {
      const dx = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)
      g.paddle = clamp(g.paddle! + dx * 220 * dt, 99, 269)
      b.x += b.vx * dt; b.y += b.vy * dt
      if (b.x < 72) { b.x = 72; b.vx = Math.abs(b.vx) }
      if (b.x > 296) { b.x = 296; b.vx = -Math.abs(b.vx) }
      if (b.y < 78) { b.y = 78; b.vy = Math.abs(b.vy) }
      if (b.vy > 0 && b.y >= 275 && b.y < 287 && Math.abs(b.x - g.paddle!) < 32) { b.y = 275; b.vy = -Math.abs(b.vy); b.vx = (b.x - g.paddle!) * 4.8 }
      for (const brick of g.bricks!) {
        if (brick.on && b.x + 4 >= brick.x && b.x - 4 <= brick.x + 33 && b.y + 4 >= brick.y && b.y - 4 <= brick.y + 13) { brick.on = false; b.vy *= -1; g.score += 10; this.onStatus(); break }
      }
      if (g.bricks!.every((brick) => !brick.on)) { this.finish(true); return }
      if (b.y > 308) { g.lives!--; if (!g.lives) { this.finish(); return } g.ball = { x: g.paddle!, y: 245, vx: 90, vy: -115 }; this.onStatus() }
    }
  }
  /** Flappy and Dodge have no ball, so they step separately. */
  stepFree(dt: number) {
    const g = this.game, held = this.held
    if (!g.running || g.paused) return
    if (g.kind === 'flappy') {
      g.t! += dt; g.vy! += 520 * dt; g.y! += g.vy! * dt
      for (const p of g.pipes!) {
        p.x -= 95 * dt
        if (p.x < -40) { p.x += 400; p.gap = 110 + Math.random() * 150; p.passed = false }
        if (!p.passed && p.x + 20 < 120) { p.passed = true; g.score++; this.onStatus() }
        const inX = 132 > p.x && 108 < p.x + 40
        if (inX && (g.y! - 12 < p.gap - 55 || g.y! + 12 > p.gap + 55)) { this.finish(); return }
      }
      if (g.y! > 300 || g.y! < 60) this.finish()
    } else if (g.kind === 'dodge') {
      g.t! += dt; g.spawn! += dt
      const dx = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)
      g.x = clamp(g.x! + dx * 240 * dt, 60, 308)
      if (g.spawn! > Math.max(0.25, 0.8 - g.t! * 0.02)) { g.spawn = 0; g.rocks!.push({ x: 70 + Math.random() * 228, y: 60, r: 8 + Math.random() * 12, v: 90 + Math.random() * 80 + g.t! * 4 }) }
      for (const r of g.rocks!) { r.y += r.v * dt; if (Math.hypot(r.x - g.x!, r.y - 280) < r.r + 11) { this.finish(); return } }
      const before = g.rocks!.length
      g.rocks = g.rocks!.filter((r) => r.y < 320)
      g.score += before - g.rocks.length
      if (before !== g.rocks.length) this.onStatus()
    }
  }
  tick(dt: number) { if (this.game.kind === 'flappy' || this.game.kind === 'dodge') this.stepFree(dt); else this.step(dt) }

  draw(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
    const scale = ctx.canvas.width / W, g = this.game
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = '#05070a'
    ctx.fillRect(0, 0, W, W)
    text(ctx, GAMES.find((x) => x[0] === this.kind)![1].toUpperCase().split('').join(' '), 52, 11, '#9fd9e6')
    ctx.strokeStyle = '#1d3540'
    ctx.strokeRect(69, 69, 230, 230)
    if (!g.running && !g.over) {
      ctx.fillStyle = COL.a
      if (this.kind === 'snake') { for (let i = 0; i < 7; i++) ctx.fillRect(120 + i * 15, 150 + (i > 3 ? 15 : 0), 12, 12); ctx.fillStyle = COL.c; ctx.fillRect(222, 209, 11, 11) }
      else if (this.kind === 'pong') { ctx.fillRect(90, 125, 5, 50); ctx.fillRect(275, 195, 5, 50); ctx.beginPath(); ctx.arc(184, 170, 6, 0, 7); ctx.fill() }
      else if (this.kind === 'breakout') { for (let i = 0; i < 18; i++) { ctx.fillStyle = [COL.a, COL.b, COL.d][(i / 6) | 0]; ctx.fillRect(80 + (i % 6) * 35, 110 + ((i / 6) | 0) * 22, 30, 15) } ctx.fillStyle = COL.a; ctx.fillRect(158, 240, 52, 6) }
      else if (this.kind === 'flappy') { ctx.fillStyle = COL.d; ctx.fillRect(220, 70, 36, 70); ctx.fillRect(220, 220, 36, 80); ctx.fillStyle = COL.a; ctx.beginPath(); ctx.arc(130, 180, 12, 0, 7); ctx.fill() }
      else { ctx.fillStyle = COL.c; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(100 + i * 42, 110 + (i % 2) * 30, 10, 0, 7); ctx.fill() } ctx.fillStyle = COL.a; ctx.beginPath(); ctx.moveTo(184, 265); ctx.lineTo(170, 290); ctx.lineTo(198, 290); ctx.closePath(); ctx.fill() }
      text(ctx, 'TAP TO PLAY', 268, 14, '#e4f4f7')
      text(ctx, 'ARROWS · TOUCH · SWIPE', 321, 9, '#5f7d86')
      ctx.restore()
      return
    }
    if (g.kind === 'snake') {
      ctx.strokeStyle = '#13232a'
      for (let i = 1; i < 16; i++) { ctx.beginPath(); ctx.moveTo(72 + i * 14, 72); ctx.lineTo(72 + i * 14, 296); ctx.moveTo(72, 72 + i * 14); ctx.lineTo(296, 72 + i * 14); ctx.stroke() }
      g.snake!.forEach((p, i) => { ctx.fillStyle = i === 0 ? '#e8fdff' : '#3fc9dd'; ctx.fillRect(73 + p[0] * 14, 73 + p[1] * 14, 12, 12) })
      if (g.food) { ctx.fillStyle = COL.c; ctx.fillRect(75 + g.food[0] * 14, 75 + g.food[1] * 14, 8, 8) }
      text(ctx, 'SCORE ' + String(g.score).padStart(3, '0'), 322, 11, '#8fb7c0')
    } else if (g.kind === 'pong') {
      ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(184, 76); ctx.lineTo(184, 292); ctx.strokeStyle = '#2a4550'; ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = COL.a; ctx.fillRect(76, g.paddle! - 24, 5, 48)
      ctx.fillStyle = COL.b; ctx.fillRect(287, g.ai! - 24, 5, 48)
      ctx.fillStyle = '#f2fbff'; ctx.beginPath(); ctx.arc(g.ball!.x, g.ball!.y, 4, 0, 7); ctx.fill()
      text(ctx, `${g.score}   :   ${g.opponent}`, 326, 15, '#8fb7c0')
    } else if (g.kind === 'breakout') {
      g.bricks!.forEach((b, i) => { if (b.on) { ctx.fillStyle = [COL.a, COL.b, COL.d, COL.c][(i / 6) | 0]; ctx.fillRect(b.x, b.y, 33, 13) } })
      ctx.fillStyle = COL.a; ctx.fillRect(g.paddle! - 28, 280, 56, 5)
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.ball!.x, g.ball!.y, 4, 0, 7); ctx.fill()
      text(ctx, `SCORE ${g.score}  /  LIVES ${g.lives}`, 326, 11, '#8fb7c0')
    } else if (g.kind === 'flappy') {
      ctx.save(); ctx.beginPath(); ctx.rect(70, 70, 228, 228); ctx.clip()
      for (const p of g.pipes!) { ctx.fillStyle = COL.d; ctx.fillRect(p.x, 60, 40, p.gap - 55 - 60); ctx.fillRect(p.x, p.gap + 55, 40, 300 - p.gap - 55) }
      ctx.fillStyle = COL.a; ctx.beginPath(); ctx.arc(120, g.y!, 12, 0, 7); ctx.fill()
      ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.arc(125, g.y! - 4, 3, 0, 7); ctx.fill()
      ctx.restore()
      text(ctx, 'SCORE ' + g.score, 326, 11, '#8fb7c0')
    } else {
      ctx.save(); ctx.beginPath(); ctx.rect(70, 70, 228, 228); ctx.clip()
      for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(255,255,255,${0.2 + hash(i) * 0.5})`; ctx.fillRect(72 + hash(i + 1) * 224, 70 + ((hash(i + 2) * 228 + g.t! * 60 * (0.5 + hash(i))) % 228), 2, 2) }
      for (const r of g.rocks!) { ctx.fillStyle = COL.c; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.fill() }
      ctx.fillStyle = COL.a; ctx.beginPath(); ctx.moveTo(g.x!, 268); ctx.lineTo(g.x! - 12, 292); ctx.lineTo(g.x! + 12, 292); ctx.closePath(); ctx.fill()
      ctx.restore()
      text(ctx, 'SCORE ' + g.score, 326, 11, '#8fb7c0')
    }
    if (g.paused || g.over) {
      ctx.fillStyle = '#05070add'
      ctx.fillRect(70, 145, 228, 80)
      text(ctx, g.paused ? 'PAUSED' : g.won ? 'YOU WIN!' : 'GAME OVER', 181, 22, COL.a, 220)
      text(ctx, g.over ? `${g.score} POINTS · TAP TO RETRY` : 'RESUME WHEN READY', 207, 10, '#8fb7c0')
    }
    ctx.restore()
  }
}
