// Pure byte codecs for the badge file manager (no BLE).
// Ported from Badge Studio, Copyright (c) 2026 Badge Studio contributors, MIT License
// (github.com/martinferreiraHCA/Badge).
import type { E87BadgeFile } from './e87-protocol'

export const u32be = (n: number) => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff)
export const readU32BE = (b: Uint8Array, o = 0) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export function fileBrowseParam(type: number, readNum: number, start: number, devHandle: number, clusters: number[]): Uint8Array {
  const path = concatBytes(...clusters.map(u32be))
  return concatBytes(
    Uint8Array.of(type & 0xff, readNum & 0xff, (start >> 8) & 0xff, start & 0xff),
    u32be(devHandle),
    Uint8Array.of((path.length >> 8) & 0xff, path.length & 0xff),
    path,
  )
}

export function parseFileStructs(data: Uint8Array): Array<Omit<E87BadgeFile, 'path' | 'handle'>> {
  const out: Array<Omit<E87BadgeFile, 'path' | 'handle'>> = []
  let i = 0
  while (i + 8 <= data.length) {
    const flags = data[i]
    const cluster = readU32BE(data, i + 1)
    const nameLen = data[i + 7]
    if (i + 8 + nameLen > data.length) break
    const raw = data.slice(i + 8, i + 8 + nameLen)
    const unicode = !(flags & 2)
    let name: string
    try { name = new TextDecoder(unicode ? 'utf-16le' : 'gbk').decode(raw) } catch { name = new TextDecoder().decode(raw) }
    out.push({ name: name.replace(/\0+$/, ''), isFile: !!(flags & 1), unicode, cluster })
    i += 8 + nameLen
  }
  return out
}

/** First complete JPEG (FF D8 FF ... FF D9) inside an AVI or raw JPEG. */
export function firstJpeg(bytes: Uint8Array): Uint8Array | null {
  let start = -1
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) { start = i; break }
  }
  if (start < 0) return null
  for (let i = start + 2; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return bytes.slice(start, i + 2)
  }
  return null
}

/** Qix clock frame: 9E 45 08 02 07 00 YYYY(LE) MM DD 00 HH mm (fixed checksum byte, as Zrun sends it). */
export function qixTimeFrame(d = new Date()): Uint8Array {
  const y = d.getFullYear()
  return Uint8Array.of(0x9e, 0x45, 0x08, 0x02, 0x07, 0x00, y & 0xff, (y >> 8) & 0xff, d.getMonth() + 1, d.getDate(), 0x00, d.getHours(), d.getMinutes())
}

/** Split an MJPEG AVI (or a lone JPEG) into its JPEG frames. */
export function jpegFrames(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue
    let j = i + 2
    while (j + 1 < bytes.length && !(bytes[j] === 0xff && bytes[j + 1] === 0xd9)) j++
    out.push(bytes.slice(i, j + 2))
    i = j + 1
  }
  return out
}

/**
 * Plan one looping clip from several designs. Stills are held for
 * `secondsPerStill`; clips play once at their own speed, resampled to the
 * slideshow's frame rate (the fastest clip's, 2-10 fps; 2 fps when all stills).
 * Returns the frame rate and, per output frame, [design index, frame index].
 */
export function planSlideshow(clips: { count: number; fps: number }[], secondsPerStill: number): { fps: number; picks: [number, number][] } {
  const moving = clips.filter((c) => c.count > 1)
  const fps = moving.length ? Math.min(10, Math.max(2, Math.round(Math.max(...moving.map((c) => c.fps))))) : 2
  const picks: [number, number][] = []
  clips.forEach((c, i) => {
    if (c.count <= 1) {
      for (let k = 0; k < Math.max(1, Math.round(secondsPerStill * fps)); k++) picks.push([i, 0])
      return
    }
    const n = Math.max(1, Math.round((c.count / c.fps) * fps))
    for (let k = 0; k < n; k++) picks.push([i, Math.min(c.count - 1, Math.floor((k * c.fps) / fps))])
  })
  return { fps, picks }
}
