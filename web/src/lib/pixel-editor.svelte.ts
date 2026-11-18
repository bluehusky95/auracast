/**
 * Pixel-art editor model: 8-32 px grids, brush/erase/fill/line/rect/picker,
 * mirror, frames (max 48), undo/redo, image import. Pure logic; the UI binds
 * pointer events. Ported from Badge Studio's pixel.js, Copyright (c) 2026
 * Badge Studio contributors, MIT License (github.com/martinferreiraHCA/Badge).
 */
export type Cell = string | null
export type Frame = Cell[]
export type Tool = 'brush' | 'erase' | 'fill' | 'line' | 'rect' | 'picker'

export const PALETTES: Record<string, string[]> = {
  neon: ['#00f2ff', '#ffffff', '#a7b7ff', '#ff8f72', '#69dfd0', '#ffd166', '#eb77b5', '#469cff', '#111111'],
  pico: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  pastel: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#ffffff', '#333333'],
}
export const MAX_FRAMES = 48

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

interface Snapshot { frames: Frame[]; index: number; size: number }

export class PixelEditor {
  // $state fields make every edit reactive in the UI.
  size = $state(16)
  frames: Frame[] = $state([])
  index = $state(0)
  tool: Tool = $state('brush')
  color = $state('#00f2ff')
  mirror = $state(false)
  private undoStack: Snapshot[] = $state([])
  private redoStack: Snapshot[] = $state([])
  private dragStart: [number, number] | null = null
  private base: Frame | null = null
  private last: [number, number] | null = null

  constructor(size = 16) {
    this.size = size
    this.frames = [this.blank()]
  }

  blank(): Frame { return Array(this.size * this.size).fill(null) }
  get frame(): Frame { return this.frames[this.index] }
  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }

  private snapshot(): Snapshot { return { frames: $state.snapshot(this.frames), index: this.index, size: this.size } }
  private restore(s: Snapshot) { this.frames = s.frames.map((f) => f.slice()); this.index = clamp(s.index, 0, this.frames.length - 1); this.size = s.size }
  private push() { this.undoStack.push(this.snapshot()); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = [] }

  undo() { const s = this.undoStack.pop(); if (s) { this.redoStack.push(this.snapshot()); this.restore(s) } }
  redo() { const s = this.redoStack.pop(); if (s) { this.undoStack.push(this.snapshot()); this.restore(s) } }

  resize(n: number) {
    this.push()
    const old = this.size
    this.frames = this.frames.map((f) => {
      const g: Frame = Array(n * n).fill(null)
      for (let y = 0; y < Math.min(n, old); y++) for (let x = 0; x < Math.min(n, old); x++) g[y * n + x] = f[y * old + x]
      return g
    })
    this.size = n
  }
  load(frames: Frame[], size: number) { this.size = size; this.frames = frames.map((f) => f.slice()); this.index = 0; this.undoStack = []; this.redoStack = [] }
  addFrame() { if (this.frames.length >= MAX_FRAMES) return; this.push(); this.frames.splice(this.index + 1, 0, this.blank()); this.index++ }
  duplicateFrame() { if (this.frames.length >= MAX_FRAMES) return; this.push(); this.frames.splice(this.index + 1, 0, this.frame.slice()); this.index++ }
  deleteFrame() { if (this.frames.length < 2) return; this.push(); this.frames.splice(this.index, 1); this.index = Math.min(this.index, this.frames.length - 1) }
  moveFrame(dir: number) {
    const j = this.index + dir
    if (j < 0 || j >= this.frames.length) return
    this.push();
    [this.frames[this.index], this.frames[j]] = [this.frames[j], this.frames[this.index]]
    this.index = j
  }
  clear() { this.push(); this.frames[this.index] = this.blank() }
  shift(dx: number, dy: number) {
    this.push()
    const n = this.size, f = this.frame, g = this.blank()
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g[((y + dy + n) % n) * n + ((x + dx + n) % n)] = f[y * n + x]
    this.frames[this.index] = g
  }
  flip(horizontal = true) {
    this.push()
    const n = this.size, f = this.frame, g = this.blank()
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g[y * n + x] = horizontal ? f[y * n + (n - 1 - x)] : f[(n - 1 - y) * n + x]
    this.frames[this.index] = g
  }

  set(x: number, y: number, c: Cell) {
    const n = this.size
    if (x < 0 || y < 0 || x >= n || y >= n) return
    this.frame[y * n + x] = c
    if (this.mirror) this.frame[y * n + (n - 1 - x)] = c
  }
  fill(x: number, y: number, color: Cell) {
    const n = this.size, f = this.frame, old = f[y * n + x]
    if (old === color) return
    const stack = [y * n + x]
    while (stack.length) {
      const p = stack.pop()!
      if (f[p] !== old) continue
      f[p] = color
      const px = p % n, py = (p / n) | 0
      if (px > 0) stack.push(p - 1)
      if (px < n - 1) stack.push(p + 1)
      if (py > 0) stack.push(p - n)
      if (py < n - 1) stack.push(p + n)
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Cell) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.set(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: Cell) {
    const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)], [t, d] = [Math.min(y0, y1), Math.max(y0, y1)]
    for (let x = a; x <= b; x++) { this.set(x, t, c); this.set(x, d, c) }
    for (let y = t; y <= d; y++) { this.set(a, y, c); this.set(b, y, c) }
  }

  /** Pointer protocol: down → move* → up. */
  down(x: number, y: number) {
    const n = this.size
    x = clamp(x, 0, n - 1); y = clamp(y, 0, n - 1)
    if (this.tool === 'picker') { const c = this.frame[y * n + x]; if (c) this.color = c; return }
    this.push()
    if (this.tool === 'fill') { this.fill(x, y, this.color); return }
    if (this.tool === 'line' || this.tool === 'rect') { this.dragStart = [x, y]; this.base = this.frame.slice(); return }
    this.set(x, y, this.tool === 'erase' ? null : this.color)
    this.last = [x, y]
  }
  move(x: number, y: number) {
    const n = this.size
    x = clamp(x, 0, n - 1); y = clamp(y, 0, n - 1)
    if (this.dragStart && this.base) {
      this.frames[this.index] = this.base.slice()
      const [sx, sy] = this.dragStart
      if (this.tool === 'line') this.line(sx, sy, x, y, this.color)
      else this.rect(sx, sy, x, y, this.color)
      return
    }
    // Connect to the previous sample so fast strokes don't leave gaps.
    if ((this.tool === 'brush' || this.tool === 'erase') && this.last) {
      this.line(this.last[0], this.last[1], x, y, this.tool === 'erase' ? null : this.color)
      this.last = [x, y]
    }
  }
  up() { this.dragStart = null; this.base = null; this.last = null }

  /** Quantise RGBA pixels (already scaled to size×size) into the current frame. */
  importImageData(data: Uint8ClampedArray) {
    this.push()
    const n = this.size, f = this.blank()
    for (let i = 0; i < n * n; i++) if (data[i * 4 + 3] > 100) f[i] = hex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    this.frames[this.index] = f
  }
}

/** Draw a frame centred on a square canvas of side `side`, inside the round badge. */
export function drawPixelFrame(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, frame: Frame, n: number, side: number, bg = '#000000') {
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, side, side)
  const cell = Math.floor((side * 0.7) / n) // ~70% keeps the grid inside the circle
  const x0 = Math.round((side - cell * n) / 2)
  for (let i = 0; i < n * n; i++) {
    const c = frame[i]
    if (!c) continue
    ctx.fillStyle = c
    ctx.fillRect(x0 + (i % n) * cell, x0 + Math.floor(i / n) * cell, cell, cell)
  }
}
