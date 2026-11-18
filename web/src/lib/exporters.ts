/** Turn a badge payload (JPEG still or MJPEG AVI) into a shareable GIF or PNG. */
import { jpegFrames } from './badge-codec'
import { readAviFps } from './avi-preview'
import { encodeGif } from './gif-encoder'

async function decodeFrames(bytes: Uint8Array): Promise<ImageData[]> {
  const out: ImageData[] = []
  for (const jpeg of jpegFrames(bytes)) {
    const bmp = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    out.push(ctx.getImageData(0, 0, c.width, c.height))
  }
  if (!out.length) throw new Error('Nothing to export yet.')
  return out
}

export async function payloadToGif(bytes: Uint8Array): Promise<Uint8Array> {
  const isAvi = bytes[0] === 0x52 && bytes[1] === 0x49
  const delay = isAvi ? 1000 / readAviFps(bytes) : 1000
  const frames = await decodeFrames(bytes)
  return encodeGif(frames.map((f) => ({ data: f.data, width: f.width, height: f.height, delay })))
}

export async function payloadToPng(bytes: Uint8Array): Promise<Blob> {
  const [first] = await decodeFrames(bytes)
  const c = new OffscreenCanvas(first.width, first.height)
  c.getContext('2d')!.putImageData(first, 0, 0)
  return c.convertToBlob({ type: 'image/png' })
}
