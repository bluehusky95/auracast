/**
 * Live clock faces: they draw the time at the moment you generate them.
 * The badge only plays clips, so the time is frozen at send; resend (or
 * Sync clock + the badge's own clock) to refresh. Every animated element
 * completes whole cycles per loop so the clip still joins seamlessly.
 *
 * Faces adapted from Badge Studio, Copyright (c) 2026 Badge Studio
 * contributors, MIT License (github.com/martinferreiraHCA/Badge).
 */
import { createCanvas, clear, circularMask, toJpeg, HALF, RADIUS, TAU, type PatternOptions } from './helpers'

type Face = 'digital' | 'neon' | 'flip' | 'binary' | 'minimal'

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const z = (n: number) => String(n).padStart(2, '0')
const FONT = 'Manrope Variable, "Segoe UI", Arial, sans-serif'

async function renderClock(face: Face, opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const c = opts.colors?.[0] ?? '#00f2ff'
  const c2 = opts.colors?.[1] ?? '#ffffff'
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const date = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`
  const out: Uint8Array[] = []

  for (let f = 0; f < opts.frames; f++) {
    const phase = opts.frames <= 1 ? 0 : f / opts.frames
    const blink = Math.cos(phase * TAU * 2) > 0 // colon blinks twice per loop
    clear(ctx, '#05070a')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (face === 'digital') {
      ctx.font = `800 96px ${FONT}`
      ctx.fillStyle = c2
      ctx.shadowColor = c
      ctx.shadowBlur = 18
      ctx.fillText(z(h), HALF - 70, HALF - 6)
      ctx.fillText(z(m), HALF + 70, HALF - 6)
      if (blink) ctx.fillText(':', HALF, HALF - 14)
      ctx.shadowBlur = 0
      ctx.font = `600 20px ${FONT}`
      ctx.fillStyle = c
      ctx.fillText(date, HALF, HALF + 72)
    } else if (face === 'flip') {
      for (const [i, part] of [z(h), z(m)].entries()) {
        const x = HALF + (i ? 64 : -64)
        ctx.fillStyle = '#1b1f24'
        ctx.beginPath()
        ctx.roundRect(x - 54, HALF - 64, 108, 128, 14)
        ctx.fill()
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(x - 54, HALF - 1, 108, 2)
        ctx.fillStyle = c2
        ctx.font = `800 92px ${FONT}`
        ctx.fillText(part, x, HALF + 4)
      }
      ctx.fillStyle = blink ? c : '#1b1f24'
      ctx.beginPath()
      ctx.arc(HALF, HALF - 16, 5, 0, TAU)
      ctx.arc(HALF, HALF + 16, 5, 0, TAU)
      ctx.fill()
      ctx.font = `600 18px ${FONT}`
      ctx.fillStyle = c2
      ctx.globalAlpha = 0.7
      ctx.fillText(date, HALF, HALF + 98)
      ctx.globalAlpha = 1
    } else if (face === 'binary') {
      for (const [ci, v] of [h, m].entries()) {
        const x = HALF + (ci ? 44 : -44)
        for (let b = 0; b < 6; b++) {
          const on = (v >> b) & 1
          ctx.beginPath()
          ctx.arc(x, HALF + 92 - b * 36, 13, 0, TAU)
          ctx.fillStyle = on ? c : 'rgba(255,255,255,0.1)'
          ctx.shadowColor = c
          ctx.shadowBlur = on ? 12 + 6 * Math.sin(phase * TAU) : 0
          ctx.fill()
        }
        ctx.shadowBlur = 0
        ctx.font = `700 16px ${FONT}`
        ctx.fillStyle = c2
        ctx.fillText(ci ? 'M' : 'H', x, HALF + 130)
      }
    } else {
      // neon rings + minimal analog: hour/minute fixed at send time, one
      // marker (seconds dot / second hand) makes exactly one turn per loop.
      const sweep = phase * TAU - Math.PI / 2
      const minA = ((m / 60) * TAU) - Math.PI / 2
      const hrA = (((h % 12) + m / 60) / 12) * TAU - Math.PI / 2
      if (face === 'neon') {
        const arc = (r: number, end: number, col: string) => {
          ctx.beginPath(); ctx.arc(HALF, HALF, r, 0, TAU)
          ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 12; ctx.stroke()
          ctx.beginPath(); ctx.arc(HALF, HALF, r, -Math.PI / 2, end)
          ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.stroke()
          ctx.shadowBlur = 0
        }
        arc(150, minA, c)
        arc(122, hrA, '#ff8f72')
        ctx.fillStyle = c2
        ctx.beginPath(); ctx.arc(HALF + Math.cos(sweep) * 172, HALF + Math.sin(sweep) * 172, 5, 0, TAU); ctx.fill()
        ctx.font = `800 52px ${FONT}`
        ctx.fillText(`${z(h)}:${z(m)}`, HALF, HALF)
      } else {
        ctx.beginPath(); ctx.arc(HALF, HALF, RADIUS - 12, 0, TAU)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3; ctx.stroke()
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU
          ctx.beginPath()
          ctx.moveTo(HALF + Math.cos(a) * 140, HALF + Math.sin(a) * 140)
          ctx.lineTo(HALF + Math.cos(a) * 160, HALF + Math.sin(a) * 160)
          ctx.strokeStyle = c2; ctx.lineWidth = 4; ctx.stroke()
        }
        const hand = (a: number, len: number, w: number, col: string) => {
          ctx.beginPath()
          ctx.moveTo(HALF - Math.cos(a) * 16, HALF - Math.sin(a) * 16)
          ctx.lineTo(HALF + Math.cos(a) * len, HALF + Math.sin(a) * len)
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke()
        }
        hand(hrA, 80, 9, c2)
        hand(minA, 122, 6, c2)
        hand(sweep, 140, 2, c)
        ctx.beginPath(); ctx.arc(HALF, HALF, 7, 0, TAU); ctx.fillStyle = c; ctx.fill()
      }
    }
    circularMask(ctx)
    out.push(await toJpeg(canvas))
  }
  return out
}

export const generateDigitalClock = (o: PatternOptions) => renderClock('digital', o)
export const generateNeonClock = (o: PatternOptions) => renderClock('neon', o)
export const generateFlipClock = (o: PatternOptions) => renderClock('flip', o)
export const generateBinaryClock = (o: PatternOptions) => renderClock('binary', o)
export const generateMinimalClock = (o: PatternOptions) => renderClock('minimal', o)
