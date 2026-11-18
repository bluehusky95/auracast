/**
 * Text + text-effect frame generator for the 368×368 circular badge.
 *
 * Outputs an array of JPEG byte buffers, each encoded with `jpeg-js`
 * (fixed Huffman tables - required by the Jieli MJPEG decoder).
 */

import { encodeJpeg } from './lib/jpeg-encoder-client'
import { layoutText, layoutRim, defaultTextLayout, type TextLayout, type LaidOut } from './text-layout'
export type { TextLayout } from './text-layout'

const SIZE = 368
const HALF = SIZE / 2

export type TextEffect =
  | 'static'
  | 'marquee'
  | 'rainbow'
  | 'blink'
  | 'bounce'
  | 'typewriter'
  | 'glow'
  | 'wave'

export interface TextEffectDef {
  id: TextEffect
  name: string
  description: string
  /** Effects that animate need a sane default frame count (single static frame for "static"). */
  defaultFrames: number
  /** Empirical bytes-per-frame for the cap math. */
  bytesPerFrame: number
}

export const TEXT_EFFECTS: TextEffectDef[] = [
  { id: 'static',     name: 'Static',     description: 'Single still frame',           defaultFrames: 1,  bytesPerFrame: 14000 },
  { id: 'marquee',    name: 'Marquee',    description: 'Scrolls right → left',         defaultFrames: 36, bytesPerFrame: 14000 },
  { id: 'rainbow',    name: 'Rainbow',    description: 'Hue cycles through the rainbow', defaultFrames: 24, bytesPerFrame: 16000 },
  { id: 'blink',      name: 'Blink',      description: 'On / off pulse',               defaultFrames: 12, bytesPerFrame: 9000  },
  { id: 'bounce',     name: 'Bounce',     description: 'Vertical ease bounce',         defaultFrames: 24, bytesPerFrame: 14000 },
  { id: 'typewriter', name: 'Typewriter', description: 'Reveals one char at a time',   defaultFrames: 24, bytesPerFrame: 12000 },
  { id: 'glow',       name: 'Glow Pulse', description: 'Soft halo breathes in & out',  defaultFrames: 24, bytesPerFrame: 18000 },
  { id: 'wave',       name: 'Wave',       description: 'Each letter rides a sine',     defaultFrames: 28, bytesPerFrame: 15000 },
]

export interface TextOptions {
  text: string
  effect: TextEffect
  fontFamily: string
  fontWeight: number
  color: string
  background: string
  frames: number
  fps: number
  /** Lines, size, spacing, position, outline. Defaults to auto-fit, centred. */
  layout?: Partial<TextLayout>
  /** More messages shown in turn after `text`; the frames are split between them. */
  pages?: string[]
}

export interface TextDef {
  id: string
  name: string
  effect: TextEffect
  bytesPerFrame: number
}

function createCanvas(): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  // willReadFrequently: toJpeg() calls getImageData() per frame.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  // Crispness hints: enable AA and ask the browser for geometric text precision.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // textRendering is a relatively new prop; cast through any to stay compat.
  ;(ctx as unknown as { textRendering?: string }).textRendering = 'geometricPrecision'
  return [canvas, ctx]
}

/**
 * Wait for the requested font to be available before rendering. Without this,
 * the first frame can render with a system fallback (and JPEG-bake that mistake
 * into every frame).
 */
async function ensureFontReady(family: string, weight: number, sizePx: number): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    // Strip stack quoting/fallbacks - load needs the primary family name.
    const primary = family.split(',')[0].trim().replace(/^["']|["']$/g, '')
    await document.fonts.load(`${weight} ${sizePx}px "${primary}"`)
    await document.fonts.ready
  } catch {
    // Best-effort; fall through to whatever the browser has.
  }
}

function clear(ctx: OffscreenCanvasRenderingContext2D, bg: string) {
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)
}

async function toJpeg(canvas: OffscreenCanvas, quality = 0.9): Promise<Uint8Array> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return encodeJpeg(
    canvas.width,
    canvas.height,
    new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength),
    Math.max(1, Math.min(100, Math.round(quality * 100))),
  )
}

/** Safe radius: a little inside the round screen's edge. */
const SAFE_R = HALF - 14

function setFont(ctx: OffscreenCanvasRenderingContext2D, weight: number, size: number, family: string, spacing: number) {
  ctx.font = `${weight} ${size}px ${family}`
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`
}

/** Draw one run of text with the layout's shadow and outline under the fill. */
function paint(
  ctx: OffscreenCanvasRenderingContext2D, s: string, x: number, y: number,
  color: string, l: TextLayout, size: number,
) {
  const stroke = () => {
    if (l.outline <= 0) return
    ctx.lineWidth = l.outline * 2
    ctx.lineJoin = 'round'
    ctx.strokeStyle = l.edgeColor
    ctx.strokeText(s, x, y)
  }
  if (l.shadow) {
    ctx.save()
    ctx.shadowColor = l.edgeColor
    ctx.shadowOffsetX = ctx.shadowOffsetY = Math.max(2, size * 0.05)
    ctx.shadowBlur = Math.max(2, size * 0.04)
    stroke()
    ctx.fillStyle = color
    ctx.fillText(s, x, y)
    ctx.restore()
  }
  stroke()
  ctx.fillStyle = color
  ctx.fillText(s, x, y)
}

function drawLines(
  ctx: OffscreenCanvasRenderingContext2D, laid: LaidOut, l: TextLayout,
  family: string, weight: number, color: string, dy = 0,
) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const ln of laid.lines) {
    setFont(ctx, weight, ln.size, family, l.letterSpacing)
    // Canvas adds letter spacing after the last glyph too; shift back by half.
    paint(ctx, ln.text, HALF + l.letterSpacing / 2, HALF + ln.y + dy, color, l, ln.size)
  }
}

/**
 * Lay out text the way generateTextFrames does (the UI uses it for the
 * "runs off the screen" hint). Pass an array to force those exact lines.
 */
export function measureTextLayout(
  text: string | string[], fontFamily: string, fontWeight: number, layout: TextLayout, r = SAFE_R,
): LaidOut {
  const [, ctx] = createCanvas()
  const measure = (t: string, s: number) => { setFont(ctx, fontWeight, s, fontFamily, layout.letterSpacing); return ctx.measureText(t).width }
  if (layout.rim && typeof text === 'string') return layoutRim(text || ' ', layout, r, measure)
  return layoutText(text || ' ', layout, r, measure, layout.outline * 2 + (layout.shadow ? 4 : 0))
}

/** How far Bounce and Wave move the text, in px. */
const BOUNCE = 22, WAVE = 30

interface Glyph { c: string; x: number; y: number; rot: number; size: number; nx: number; ny: number; arc: boolean }

/** Every character of a layout with its centre, rotation and outward direction. */
function glyphsOf(ctx: OffscreenCanvasRenderingContext2D, laid: LaidOut, l: TextLayout, family: string, weight: number): Glyph[] {
  const out: Glyph[] = []
  for (const ln of laid.lines) {
    setFont(ctx, weight, ln.size, family, 0)
    const chars = [...ln.text]
    const w = chars.map((c) => ctx.measureText(c).width)
    let x = -(w.reduce((a, b) => a + b, 0) + l.letterSpacing * Math.max(0, chars.length - 1)) / 2
    chars.forEach((c, k) => {
      const mid = x + w[k] / 2
      x += w[k] + l.letterSpacing
      if (!ln.arc) { out.push({ c, x: HALF + mid, y: HALF + ln.y, rot: 0, size: ln.size, nx: 0, ny: 1, arc: false }); return }
      // Top reads clockwise; bottom reads counter-clockwise so letters stay upright.
      const R = ln.radius!
      const a = ln.arc === 'top' ? -Math.PI / 2 + mid / R : Math.PI / 2 - mid / R
      out.push({
        c, x: HALF + R * Math.cos(a), y: HALF + R * Math.sin(a), rot: ln.arc === 'top' ? a + Math.PI / 2 : a - Math.PI / 2,
        size: ln.size, nx: Math.cos(a), ny: Math.sin(a), arc: true,
      })
    })
  }
  return out
}

function drawGlyph(
  ctx: OffscreenCanvasRenderingContext2D, g: Glyph, color: string, l: TextLayout,
  family: string, weight: number, dx = 0, dy = 0,
) {
  ctx.save()
  ctx.translate(g.x + dx, g.y + dy)
  ctx.rotate(g.rot)
  setFont(ctx, weight, g.size, family, 0)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  paint(ctx, g.c, 0, 0, color, l, g.size)
  ctx.restore()
}

/** One frame of curved-edge text for any effect. Marquee spins the curved lines. */
function drawRimFrame(
  ctx: OffscreenCanvasRenderingContext2D, glyphs: Glyph[], effect: TextEffect, phase: number,
  count: number, l: TextLayout, color: string, family: string, weight: number,
) {
  const draw = (gs: Glyph[], col: (i: number) => string = () => color, off: (g: Glyph, i: number) => [number, number] = () => [0, 0], st = l) =>
    gs.forEach((g, i) => drawGlyph(ctx, g, col(i), st, family, weight, ...off(g, i)))
  const turn = phase * Math.PI * 2
  switch (effect) {
    case 'static': draw(glyphs); break
    case 'blink': if (phase < 0.6) draw(glyphs); break
    case 'bounce': draw(glyphs, undefined, () => [0, Math.sin(turn) * BOUNCE]); break
    case 'rainbow': draw(glyphs, (i) => `hsl(${(phase * 360 + i * 28) % 360} 95% 60%)`); break
    case 'wave': draw(glyphs, undefined, (g, i) => {
      const o = Math.sin(turn + i * 0.7) * Math.min(WAVE, g.size * 0.12)
      return [g.nx * o, g.ny * o]
    }); break
    case 'typewriter': {
      const n = count === 1 ? glyphs.length : phase >= 0.9 ? 0 : Math.floor(Math.min(1, phase / 0.55) * glyphs.length)
      draw(glyphs.slice(0, n))
      break
    }
    case 'glow': {
      const pulse = 0.5 + 0.5 * Math.sin(turn)
      const halo = { ...l, outline: 0, shadow: false }
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = 18 + pulse * 22
      draw(glyphs, undefined, undefined, halo)
      ctx.shadowBlur = 8 + pulse * 12
      draw(glyphs, undefined, undefined, halo)
      ctx.restore()
      draw(glyphs)
      break
    }
    case 'marquee': {
      ctx.save()
      ctx.translate(HALF, HALF)
      ctx.rotate(turn)
      ctx.translate(-HALF, -HALF)
      draw(glyphs.filter((g) => g.arc))
      ctx.restore()
      draw(glyphs.filter((g) => !g.arc))
      break
    }
  }
}

export async function generateTextFrames(opts: TextOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const l: TextLayout = { ...defaultTextLayout(), ...opts.layout }
  const { fontFamily: family, fontWeight: weight } = opts

  // Ensure web fonts are loaded before measureText / fillText. Probe at the
  // largest size we might use so the font loader doesn't lazy-fetch mid-loop.
  await ensureFontReady(family, weight, 220)

  // Effects that move the text get a smaller circle so they never reach the rim.
  const r = opts.effect === 'bounce' ? SAFE_R - BOUNCE : opts.effect === 'wave' ? SAFE_R - WAVE : SAFE_R
  // Extra messages take turns; the frames are split between them.
  const msgs = [opts.text, ...(opts.pages ?? []).filter((p) => p.trim())]
  const total = Math.max(1, opts.effect === 'static' && msgs.length === 1 ? 1 : opts.frames)

  for (let m = 0; m < msgs.length; m++) {
    const totalFrames = Math.floor(total / msgs.length) + (m < total % msgs.length ? 1 : 0)
    const fit = measureTextLayout(msgs[m], family, weight, l, r)
    // Marquee scrolls everything as one line.
    const oneLine = (msgs[m] || ' ').replace(/\s*\n\s*/g, ' ')
    // Typewriter leaves room for the cursor after the last line.
    const typed = opts.effect === 'typewriter' && !l.rim ? measureTextLayout((msgs[m] || ' ') + '▌', family, weight, l, r) : null
    if (typed) typed.lines = typed.lines.map((ln) => ({ ...ln, text: ln.text.replace(/▌$/, '') }))
    const glyphs = l.rim ? glyphsOf(ctx, fit, l, family, weight) : null

    for (let f = 0; f < totalFrames; f++) {
      const phase = totalFrames === 1 ? 0 : f / totalFrames
      clear(ctx, opts.background)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      if (glyphs) {
        drawRimFrame(ctx, glyphs, opts.effect, phase, totalFrames, l, opts.color, family, weight)
        frames.push(await toJpeg(canvas, 0.92))
        continue
      }

      switch (opts.effect) {
        case 'static': {
          drawLines(ctx, fit, l, family, weight, opts.color)
          break
        }

        case 'marquee': {
          // Single-line scroll across the disc at the chosen size and height.
          // Scrolling text doesn't need to fit across, so auto size is one big line.
          const size = (l.autoSize ? 120 : l.size) * ((l.lineScale[0] ?? 100) / 100)
          setFont(ctx, weight, size, family, l.letterSpacing)
          const tw = ctx.measureText(oneLine).width
          const x = SIZE + tw / 2 - phase * (SIZE + tw)
          const y = l.vAlign === 'middle' ? HALF : HALF + (l.vAlign === 'top' ? -1 : 1) * (SAFE_R * 0.8 - size * l.lineSpacing / 2)
          paint(ctx, oneLine, x, y, opts.color, l, size)
          break
        }

        case 'rainbow':
        case 'wave': {
          // Per-character colour (rainbow) or height (wave), line by line. Widths
          // are measured per glyph, then each glyph is centred at its mid-x to
          // avoid kerning drift. The character index runs on across lines.
          let i = 0
          for (const ln of fit.lines) {
            setFont(ctx, weight, ln.size, family, l.letterSpacing)
            const chars = [...ln.text]
            const widths = chars.map((c) => ctx.measureText(c).width)
            // Smaller wave when lines are stacked so they don't run into each other.
            const amp = Math.min(WAVE, ln.size * (fit.lines.length > 1 ? 0.12 : 0.28))
            let x = HALF - (widths.reduce((a, b) => a + b, 0) - l.letterSpacing) / 2
            for (let k = 0; k < chars.length; k++, i++) {
              const cx = x + (widths[k] - l.letterSpacing) / 2
              if (opts.effect === 'rainbow') paint(ctx, chars[k], cx, HALF + ln.y, `hsl(${(phase * 360 + i * 28) % 360} 95% 60%)`, l, ln.size)
              else paint(ctx, chars[k], cx, HALF + ln.y + Math.sin(phase * Math.PI * 2 + i * 0.7) * amp, opts.color, l, ln.size)
              x += widths[k]
            }
          }
          break
        }

        case 'blink': {
          // 60% on / 40% off - softer cadence than a hard half-and-half cut.
          if (phase < 0.6) drawLines(ctx, fit, l, family, weight, opts.color)
          break
        }

        case 'bounce': {
          drawLines(ctx, fit, l, family, weight, opts.color, Math.sin(phase * Math.PI * 2) * BOUNCE)
          break
        }

        case 'typewriter': {
          // Types line by line. Each line is anchored to its own fixed left edge
          // so revealed glyphs don't jitter as more characters appear.
          // One frame is a still of the finished text. A loop starts blank,
          // reveals through 55%, holds through 90%, then goes blank again so
          // the last frame matches frame 0.
          if (totalFrames > 1 && (phase === 0 || phase >= 0.9)) break
          const lines = typed!.lines
          const total = lines.reduce((a, ln) => a + ln.text.length, 0)
          let left = totalFrames === 1 ? total : Math.floor(Math.min(1, phase / 0.55) * total)
          ctx.textAlign = 'left'
          for (const ln of lines) {
            setFont(ctx, weight, ln.size, family, l.letterSpacing)
            const startX = HALF - (ctx.measureText(ln.text).width - l.letterSpacing) / 2
            const visible = ln.text.slice(0, left)
            left -= visible.length
            paint(ctx, visible, startX, HALF + ln.y, opts.color, l, ln.size)
            // Blinking cursor after the last revealed character, then stop.
            if (totalFrames > 1 && (left === 0 || visible.length < ln.text.length)) {
              if (Math.floor(f / 2) % 2 === 0) paint(ctx, '▌', startX + ctx.measureText(visible).width, HALF + ln.y, opts.color, l, ln.size)
              break
            }
          }
          break
        }

        case 'glow': {
          // Soft halo: two blurred passes, then a crisp pass without shadow so
          // the letterforms stay sharp through JPEG compression.
          const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
          const halo = { ...l, outline: 0, shadow: false }
          ctx.save()
          ctx.shadowColor = opts.color
          ctx.shadowBlur = 18 + pulse * 22
          drawLines(ctx, fit, halo, family, weight, opts.color)
          ctx.shadowBlur = 8 + pulse * 12
          drawLines(ctx, fit, halo, family, weight, opts.color)
          ctx.restore()
          drawLines(ctx, fit, l, family, weight, opts.color)
          break
        }
      }

      // Higher quality (0.92) keeps text edges crisp through JPEG; the per-frame
      // cap math already budgets for ~16 KB at this quality.
      frames.push(await toJpeg(canvas, 0.92))
    }
  }
  return frames
}

/** Available font choices (web-safe + a curated handful). */
export const TEXT_FONTS: { id: string; label: string; stack: string }[] = [
  { id: 'inter',    label: 'Inter',          stack: '"Inter Variable", Inter, system-ui, sans-serif' },
  { id: 'mono',     label: 'Mono',           stack: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace' },
  { id: 'serif',    label: 'Serif',          stack: 'Georgia, "Times New Roman", serif' },
  { id: 'sansbold', label: 'Heavy Sans',     stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'rounded',  label: 'Rounded',        stack: '"SF Pro Rounded", "Avenir Next Rounded", system-ui, sans-serif' },
]
