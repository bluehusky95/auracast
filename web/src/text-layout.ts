/**
 * Text layout for the round badge: line breaks, size (auto or fixed), per-line
 * size, spacing, vertical position. Each line's width limit is the circle's
 * chord at that line's height, so lines near the top/bottom get narrower.
 * Pure (takes a measure function) so it can be tested without a canvas.
 */

export type VAlign = 'top' | 'middle' | 'bottom'

export interface TextLayout {
  autoSize: boolean
  /** Base font size in px when autoSize is off (line 1 at 100%). */
  size: number
  /** Per-line size in percent of the base size; missing entries are 100. */
  lineScale: number[]
  /** Line height as a multiple of the font size. */
  lineSpacing: number
  /** Extra space between letters in px. */
  letterSpacing: number
  vAlign: VAlign
  /** Outline thickness in px (0 = none). */
  outline: number
  shadow: boolean
  /** Colour for the outline and shadow. */
  edgeColor: string
  /** Curve the first line along the top edge and the last along the bottom. */
  rim: boolean
}

export const defaultTextLayout = (): TextLayout => ({
  autoSize: true, size: 72, lineScale: [], lineSpacing: 1.15, letterSpacing: 0,
  vAlign: 'middle', outline: 0, shadow: false, edgeColor: '#000000', rim: false,
})

export const MAX_LINES = 6
/** Half the glyph box height as a fraction of the font size. */
const HALF_GLYPH = 0.55
/** Widest arc auto size aims for (about 150 degrees). */
const MAX_ARC = Math.PI * 0.85

/** A curved line sits on a circle of `radius` (glyph centres) along the top or bottom. */
export interface PlacedLine { text: string; size: number; y: number; arc?: 'top' | 'bottom'; radius?: number }
export interface LaidOut { lines: PlacedLine[]; fits: boolean; baseSize: number }

/** width(text, sizePx) in px, including letter spacing. */
export type Measure = (text: string, size: number) => number

const scaleOf = (l: TextLayout, i: number) => Math.max(0.2, (l.lineScale[i] ?? 100) / 100)

/** Place `lines` at base size `s` inside a circle of radius `r` (y is relative to the centre). */
function place(lines: string[], s: number, l: TextLayout, r: number, measure: Measure, pad: number): LaidOut {
  const sizes = lines.map((_, i) => s * scaleOf(l, i))
  const heights = sizes.map((z) => z * l.lineSpacing)
  const total = heights.reduce((a, b) => a + b, 0)
  let top = l.vAlign === 'top' ? -r * 0.8 : l.vAlign === 'bottom' ? r * 0.8 - total : -total / 2
  top = Math.max(-r, Math.min(top, r - total))
  let fits = total <= 2 * r
  let y = top
  const out: PlacedLine[] = lines.map((text, i) => {
    const cy = y + heights[i] / 2
    y += heights[i]
    const half = sizes[i] * HALF_GLYPH
    const d = Math.max(Math.abs(cy - half), Math.abs(cy + half))
    const avail = d >= r ? 0 : 2 * Math.sqrt(r * r - d * d)
    if (text.trim() && measure(text, sizes[i]) + pad > avail) fits = false
    return { text, size: sizes[i], y: cy }
  })
  return { lines: out, fits, baseSize: s }
}

/** Greedy word wrap where line i may be at most widthAt(i) wide. */
function wrap(text: string, s: number, l: TextLayout, widthAt: (i: number) => number, measure: Measure): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const trial = cur ? `${cur} ${word}` : word
    if (cur && measure(trial, s * scaleOf(l, lines.length)) > widthAt(lines.length)) {
      lines.push(cur)
      cur = word
    } else cur = trial
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [' ']
}

/**
 * Lay out text inside a circle of radius `r`. Typed line breaks (or an array of
 * lines) are kept as is; text without breaks is word-wrapped (up to 4 lines when
 * auto-sizing).
 * `pad` is extra width each line needs (outline, effect wobble).
 */
export function layoutText(input: string | string[], l: TextLayout, r: number, measure: Measure, pad = 0): LaidOut {
  const text = Array.isArray(input) ? input.join(' ') : input
  const typed = Array.isArray(input) ? input : text.includes('\n') ? text.split('\n').slice(0, MAX_LINES) : null

  // Width limit for line i when n lines are stacked at base size s.
  const wrapAt = (s: number, n: number) => {
    const guess = place(Array(n).fill('x'), s, l, r, () => 0, 0).lines
    return (i: number) => {
      const g = guess[Math.min(i, n - 1)]
      const d = Math.abs(g.y) + g.size * HALF_GLYPH
      return d >= r ? 0 : 2 * Math.sqrt(r * r - d * d) - pad
    }
  }

  if (!l.autoSize) {
    const s = l.size
    if (typed) return place(typed, s, l, r, measure, pad)
    // Fixed size: wrap with the line count it ends up needing.
    let lines = wrap(text, s, l, () => 2 * r - pad, measure)
    for (let k = 0; k < 3; k++) lines = wrap(text, s, l, wrapAt(s, Math.min(lines.length, MAX_LINES)), measure)
    return place(lines.slice(0, MAX_LINES), s, l, r, measure, pad)
  }

  let best: LaidOut | null = null
  for (let s = 220; s >= 10; s -= 2) {
    if (typed) {
      const p = place(typed, s, l, r, measure, pad)
      if (p.fits) return p
      continue
    }
    for (let n = 1; n <= 4; n++) {
      const lines = wrap(text, s, l, wrapAt(s, n), measure)
      if (lines.length > n) continue
      const p = place(lines, s, l, r, measure, pad)
      if (p.fits) { best = p; break }
    }
    if (best) return best
  }
  return place(typed ?? [text.slice(0, 24)], 10, l, r, measure, pad)
}

/**
 * Curved layout: line 1 follows the top edge, the last line (if there are two
 * or more) follows the bottom edge reading left to right, and any lines in
 * between sit straight in the middle.
 */
export function layoutRim(text: string, l: TextLayout, r: number, measure: Measure): LaidOut {
  const lines = text.split('\n').slice(0, MAX_LINES)
  const arcLine = (t: string, i: number, side: 'top' | 'bottom'): PlacedLine => {
    let size = l.size * scaleOf(l, i)
    if (l.autoSize) {
      size = Math.min(64, r * 0.32) * scaleOf(l, i)
      while (size > 8 && measure(t, size) / (r - size * HALF_GLYPH) > MAX_ARC) size -= 1
    }
    const radius = r - size * HALF_GLYPH
    return { text: t, size, y: side === 'top' ? -radius : radius, arc: side, radius }
  }
  const arcFits = (p: PlacedLine) => measure(p.text, p.size) / p.radius! <= Math.PI
  const top = arcLine(lines[0], 0, 'top')
  const bottom = lines.length > 1 ? arcLine(lines[lines.length - 1], lines.length - 1, 'bottom') : null
  const out = [top]
  let fits = arcFits(top) && (!bottom || arcFits(bottom))
  if (lines.length > 2) {
    const band = Math.max(top.size, bottom!.size) * 1.15
    const mid = layoutText(lines.slice(1, -1), { ...l, vAlign: 'middle', lineScale: l.lineScale.slice(1) }, r - band, measure)
    out.push(...mid.lines)
    fits &&= mid.fits
  }
  if (bottom) out.push(bottom)
  return { lines: out, fits, baseSize: top.size / scaleOf(l, 0) }
}
