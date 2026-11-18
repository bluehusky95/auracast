/**
 * Animated GIF encoder (median-cut global palette + LZW). Ported from Badge
 * Studio's gif.js, Copyright (c) 2026 Badge Studio contributors, MIT License
 * (github.com/martinferreiraHCA/Badge).
 */
export interface GifFrame { data: Uint8ClampedArray | Uint8Array; width: number; height: number; delay: number }
type RGB = [number, number, number]

function medianCut(pixels: RGB[], maxColors: number): RGB[] {
  type Box = { px: RGB[]; axis: number; len: number }
  const range = (px: RGB[]): Box => {
    const mn = [255, 255, 255], mx = [0, 0, 0]
    for (const p of px) for (let c = 0; c < 3; c++) { if (p[c] < mn[c]) mn[c] = p[c]; if (p[c] > mx[c]) mx[c] = p[c] }
    let axis = 0, len = -1
    for (let c = 0; c < 3; c++) if (mx[c] - mn[c] > len) { len = mx[c] - mn[c]; axis = c }
    return { px, axis, len }
  }
  const boxes = [range(pixels)]
  while (boxes.length < maxColors) {
    boxes.sort((a, b) => b.len - a.len)
    const box = boxes[0]
    if (box.len <= 0 || box.px.length < 2) break
    box.px.sort((a, b) => a[box.axis] - b[box.axis])
    const mid = box.px.length >> 1
    boxes.splice(0, 1, range(box.px.slice(0, mid)), range(box.px.slice(mid)))
  }
  return boxes.map((b) => {
    const s = [0, 0, 0]
    for (const p of b.px) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2] }
    return s.map((v) => Math.round(v / b.px.length)) as RGB
  })
}

function lzwEncode(indices: Uint8Array, minCode: number): number[] {
  const clear = 1 << minCode, eoi = clear + 1
  let codeSize = minCode + 1, dict = new Map<number, number>(), next = eoi + 1
  const out: number[] = []
  let bitBuf = 0, bitCnt = 0
  const emit = (code: number) => {
    bitBuf |= code << bitCnt
    bitCnt += codeSize
    while (bitCnt >= 8) { out.push(bitBuf & 255); bitBuf >>>= 8; bitCnt -= 8 }
  }
  emit(clear)
  let cur = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = cur * 4096 + k
    const hit = dict.get(key)
    if (hit !== undefined) { cur = hit; continue }
    emit(cur)
    if (next < 4096) {
      dict.set(key, next++)
      if (next > 1 << codeSize && codeSize < 12) codeSize++
    } else {
      emit(clear)
      dict = new Map()
      next = eoi + 1
      codeSize = minCode + 1
    }
    cur = k
  }
  emit(cur)
  emit(eoi)
  if (bitCnt > 0) out.push(bitBuf & 255)
  return out
}

/** Encode opaque RGBA frames as a looping GIF89a. */
export function encodeGif(frames: GifFrame[]): Uint8Array {
  if (!frames.length) throw new Error('No frames to encode.')
  const { width, height } = frames[0]
  const sample: RGB[] = []
  const step = Math.max(1, Math.floor(frames.reduce((n, f) => n + f.width * f.height, 0) / 20000))
  for (const f of frames) for (let i = 0; i < f.data.length; i += 4 * step) sample.push([f.data[i], f.data[i + 1], f.data[i + 2]])
  const pal = medianCut(sample.length ? sample : [[0, 0, 0]], 256)
  while (pal.length < 2) pal.push([0, 0, 0])
  const bits = Math.max(1, Math.ceil(Math.log2(pal.length))), size = 1 << bits
  const out: number[] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 255, width >> 8, height & 255, height >> 8, 0x80 | (bits - 1), 0, 0]
  for (let i = 0; i < size; i++) out.push(...(pal[i] ?? [0, 0, 0]))
  out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0) // loop forever
  const cache = new Map<number, number>()
  const nearest = (r: number, g: number, b: number) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    let idx = cache.get(key)
    if (idx !== undefined) return idx
    let bd = Infinity
    idx = 0
    for (let i = 0; i < pal.length; i++) {
      const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2
      if (d < bd) { bd = d; idx = i }
    }
    cache.set(key, idx)
    return idx
  }
  const minCode = Math.max(2, bits)
  for (const f of frames) {
    const delay = Math.round((f.delay || 100) / 10)
    out.push(0x21, 0xf9, 4, 0, delay & 255, delay >> 8, 0, 0)
    out.push(0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0)
    const idx = new Uint8Array(width * height)
    for (let i = 0, p = 0; i < idx.length; i++, p += 4) idx[i] = nearest(f.data[p], f.data[p + 1], f.data[p + 2])
    out.push(minCode)
    const lz = lzwEncode(idx, minCode)
    for (let i = 0; i < lz.length; i += 255) {
      const n = Math.min(255, lz.length - i)
      out.push(n)
      for (let j = 0; j < n; j++) out.push(lz[i + j])
    }
    out.push(0)
  }
  out.push(0x3b)
  return new Uint8Array(out)
}
