/**
 * Overlays drawn on top of any mode's output: emoji stickers, an animated
 * ring frame, and a caption. Applied to the final JPEG/AVI right before
 * sending, so every mode gets them. Sticker and frame drawing adapted from
 * Badge Studio's scene.js, Copyright (c) 2026 Badge Studio contributors,
 * MIT License (github.com/martinferreiraHCA/Badge).
 */
import { buildMjpgAvi } from '../avi-builder'
import { readAviFps } from './avi-preview'
import { jpegFrames } from './badge-codec'
import { canvasToBadgeJpeg, fitJpegFramesToBudget, MAX_UPLOAD_BYTES, type OutputFrameSize } from './image-processing'

export type StickerAnim = 'none' | 'bounce' | 'spin' | 'pulse' | 'float'
export type FrameStyle = 'none' | 'ring' | 'neon' | 'dashed' | 'rainbow' | 'dots' | 'vignette'

export interface Sticker { emoji: string; x: number; y: number; size: number; rotation: number; anim: StickerAnim }
export interface OverlayConfig {
  stickers: Sticker[]
  frame: { style: FrameStyle; color: string; width: number }
  caption: { text: string; position: 'top' | 'bottom'; color: string; size: number; bg: boolean }
}

export const FRAME_STYLES: Array<[FrameStyle, string]> = [
  ['none', 'No frame'], ['ring', 'Ring'], ['neon', 'Neon'], ['dashed', 'Marching dashes'], ['rainbow', 'Rainbow'], ['dots', 'Chaser lights'], ['vignette', 'Vignette'],
]
export const STICKER_ANIMS: StickerAnim[] = ['none', 'bounce', 'spin', 'pulse', 'float']
export const EMOJIS = ['⭐', '❤️', '🔥', '✨', '🎉', '😎', '👾', '🌈', '⚡', '💜', '🌸', '🍀', '🐱', '🐶', '🦊', '🐉', '👻', '💀', '🎃', '🎄', '🎮', '🎵', '☕', '🍕']

export function defaultOverlay(): OverlayConfig {
  return {
    stickers: [],
    frame: { style: 'none', color: '#00f2ff', width: 10 },
    caption: { text: '', position: 'bottom', color: '#ffffff', size: 22, bg: true },
  }
}

export const overlayActive = (o: OverlayConfig) => o.stickers.length > 0 || o.frame.style !== 'none' || o.caption.text.trim() !== ''

const W = 368, C = 184, TAU = Math.PI * 2
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Draw the overlay at loop phase `p` (0..1) on a 368-logical canvas scaled by `scale`. */
export function drawOverlay(ctx: Ctx, o: OverlayConfig, p: number, scale = 1): void {
  const q = p * TAU
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  for (const s of o.stickers) {
    let dx = 0, dy = 0, rot = (s.rotation * Math.PI) / 180, sc = 1
    if (s.anim === 'bounce') dy = -Math.abs(Math.sin(q * 2)) * 18
    if (s.anim === 'spin') rot += q
    if (s.anim === 'pulse') sc = 1 + Math.sin(q * 2) * 0.12
    if (s.anim === 'float') { dx = Math.sin(q) * 10; dy = Math.cos(q) * 8 }
    ctx.save()
    ctx.translate(s.x * W + dx, s.y * W + dy)
    ctx.rotate(rot)
    ctx.scale(sc, sc)
    ctx.font = `${Math.round(s.size * W)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.emoji, 0, 0)
    ctx.restore()
  }
  const cap = o.caption
  if (cap.text.trim()) {
    const y = cap.position === 'top' ? 72 : W - 72
    ctx.font = `700 ${cap.size}px Manrope Variable, "Segoe UI", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (cap.bg) {
      const w = Math.min(W - 80, ctx.measureText(cap.text).width + 28)
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.beginPath()
      ctx.roundRect(C - w / 2, y - cap.size * 0.8, w, cap.size * 1.6, cap.size * 0.8)
      ctx.fill()
    }
    ctx.fillStyle = cap.color
    ctx.fillText(cap.text, C, y, W - 96)
  }
  const f = o.frame
  if (f.style !== 'none') {
    const w = f.width, r = C - w / 2
    ctx.lineWidth = w
    ctx.strokeStyle = f.color
    if (f.style === 'ring') { ctx.beginPath(); ctx.arc(C, C, r, 0, TAU); ctx.stroke() }
    else if (f.style === 'neon') { ctx.shadowColor = f.color; ctx.shadowBlur = 24 + Math.sin(q * 2) * 8; ctx.beginPath(); ctx.arc(C, C, r - 4, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0 }
    else if (f.style === 'dashed') { ctx.setLineDash([18, 12]); ctx.lineDashOffset = -p * 30 * 4; ctx.beginPath(); ctx.arc(C, C, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]) }
    else if (f.style === 'rainbow') {
      for (let i = 0; i < 36; i++) {
        ctx.strokeStyle = `hsl(${(i * 10 + p * 360) % 360} 90% 60%)`
        ctx.beginPath(); ctx.arc(C, C, r, (i * TAU) / 36, ((i + 1.05) * TAU) / 36); ctx.stroke()
      }
    } else if (f.style === 'dots') {
      for (let i = 0; i < 40; i++) {
        const a = (i * TAU) / 40, on = (i + Math.floor(p * 40)) % 4 === 0
        ctx.globalAlpha = on ? 1 : 0.3
        ctx.fillStyle = f.color
        ctx.beginPath(); ctx.arc(C + Math.cos(a) * (C - w), C + Math.sin(a) * (C - w), w * 0.45, 0, TAU); ctx.fill()
      }
      ctx.globalAlpha = 1
    } else if (f.style === 'vignette') {
      const g = ctx.createRadialGradient(C, C, C * 0.55, C, C, C)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,.85)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, W)
    }
  }
  ctx.restore()
}

/** Composite the overlay onto a JPEG still or MJPEG AVI. Stills stay stills (overlay at phase 0). */
export async function applyOverlay(bytes: Uint8Array, o: OverlayConfig, out: OutputFrameSize, log?: (m: string) => void): Promise<Uint8Array> {
  const isAvi = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  const frames = jpegFrames(bytes)
  if (!frames.length) return bytes
  const canvas = new OffscreenCanvas(out.width, out.height)
  const ctx = canvas.getContext('2d')!
  const encoded: Uint8Array[] = []
  for (let i = 0; i < frames.length; i++) {
    const bmp = await createImageBitmap(new Blob([frames[i] as BlobPart], { type: 'image/jpeg' }))
    ctx.drawImage(bmp, 0, 0, out.width, out.height)
    bmp.close()
    drawOverlay(ctx, o, i / frames.length, out.width / W)
    encoded.push(await canvasToBadgeJpeg(canvas, 0.9))
  }
  if (!isAvi) return encoded[0]
  const fitted = await fitJpegFramesToBudget(encoded, out.width, out.height, MAX_UPLOAD_BYTES, log)
  return buildMjpgAvi(fitted.frames, { fps: readAviFps(bytes) })
}
