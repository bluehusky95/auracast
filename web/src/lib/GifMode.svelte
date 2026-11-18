<script lang="ts">
  /**
   * GIF upload mode - decode animated GIF frame-by-frame, crop to circle,
   * encode as MJPEG AVI for the badge.
   */
  import { buildMjpgAvi } from '../avi-builder'
  import { HALF, RADIUS, TAU } from '../patterns/helpers'
  import { encodeJpeg } from './jpeg-encoder-client'
  import { fitJpegFramesToBudget, MAX_UPLOAD_BYTES, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT } from './image-processing'
  import { formatBytes } from './utils'
  import Button from './m3/Button.svelte'

  interface Props {
    onResult: (avi: Uint8Array, fps: number) => void
    busy: boolean
    isWriting: boolean
  }

  let { onResult, busy = $bindable(false), isWriting }: Props = $props()

  let fileInput: HTMLInputElement | null = $state(null)
  let dragOver = $state(false)
  let status = $state('')
  let frameCount = $state(0)
  let detectedFps = $state(0)
  let outputSize = $state('')
  let errorMsg = $state('')

  // GIPHY search (opt-in: needs the user's own API key; the only request
  // BadgeCast makes off-device, and only when you search).
  const KEY_STORE = 'auracast.giphyKey'
  let giphyKey = $state((() => { try { return localStorage.getItem(KEY_STORE) ?? '' } catch { return '' } })())
  let giphyQuery = $state('')
  let giphyResults: Array<{ id: string; title: string; thumb: string; url: string }> = $state([])
  let giphyBusy = $state(false)

  async function giphySearch(e: Event): Promise<void> {
    e.preventDefault()
    errorMsg = ''
    const key = giphyKey.trim(), q = giphyQuery.trim()
    if (!key || !q) { errorMsg = 'Enter your GIPHY API key and a search term.'; return }
    try { localStorage.setItem(KEY_STORE, key) } catch { /* storage blocked */ }
    giphyBusy = true
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=24&rating=g`)
      if (!res.ok) throw new Error(`GIPHY answered ${res.status}. Check the API key.`)
      const data = await res.json()
      giphyResults = (data?.data ?? []).map((g: any) => ({ id: String(g.id), title: String(g.title ?? ''), thumb: String(g.images?.fixed_width_small?.url ?? ''), url: String(g.images?.downsized?.url ?? '') }))
        .filter((g: { thumb: string; url: string }) => /^https:\/\/[a-z0-9.]*giphy\.com\//.test(g.url) && /^https:\/\/[a-z0-9.]*giphy\.com\//.test(g.thumb))
      if (!giphyResults.length) status = 'No GIFs found.'
    } catch (err) {
      errorMsg = (err as Error).message
    } finally {
      giphyBusy = false
    }
  }

  async function pickGiphy(url: string): Promise<void> {
    busy = true
    errorMsg = ''
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Download failed (${res.status}).`)
      const blob = await res.blob()
      await processGif(new File([blob], 'giphy.gif', { type: 'image/gif' }))
    } catch (err) {
      errorMsg = (err as Error).message
      busy = false
    }
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    dragOver = false
    const file = e.dataTransfer?.files[0]
    if (file && file.type === 'image/gif') processGif(file)
    else errorMsg = 'Please drop an animated GIF file.'
  }

  function handleFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) processGif(file)
    input.value = ''
  }

  async function processGif(file: File): Promise<void> {
    busy = true
    errorMsg = ''
    status = 'Decoding GIF frames...'
    frameCount = 0
    detectedFps = 0
    outputSize = ''

    try {
      const frames = await decodeGifFrames(file)
      if (frames.jpegFrames.length === 0) throw new Error('No frames found in GIF.')

      frameCount = frames.jpegFrames.length
      detectedFps = frames.fps
      status = `Encoding ${frameCount} frames @ ${frames.fps} fps...`

      // Fit frames to budget
      const fitted = await fitJpegFramesToBudget(
        frames.jpegFrames,
        E87_IMAGE_WIDTH,
        E87_IMAGE_HEIGHT,
        MAX_UPLOAD_BYTES,
      )

      const avi = buildMjpgAvi(fitted.frames, { fps: frames.fps })
      outputSize = formatBytes(avi.length)

      if (!fitted.fits) {
        status = `Warning: AVI is ${outputSize}, may exceed badge limit.`
      } else {
        status = `Ready: ${frameCount} frames @ ${frames.fps} fps, ${outputSize}`
      }

      onResult(avi, frames.fps)
    } catch (err) {
      errorMsg = (err as Error).message
      status = ''
    } finally {
      busy = false
    }
  }

  interface DecodedGif {
    jpegFrames: Uint8Array[]
    fps: number
  }

  async function decodeGifFrames(file: File): Promise<DecodedGif> {
    // ImageDecoder is what decodes every frame. createImageBitmap on a GIF
    // returns frame 0 only, which used to upload as a fake 10 fps still.
    if (!('ImageDecoder' in globalThis)) {
      throw new Error('This browser cannot decode an animated GIF. Open BadgeCast in Chrome, Edge, Brave, or Arc.')
    }
    return decodeWithImageDecoder(file)
  }

  function drawGifFrame(
    ctx: OffscreenCanvasRenderingContext2D,
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
  ): void {
    const minDim = Math.min(srcW, srcH)
    const sx = (srcW - minDim) / 2
    const sy = (srcH - minDim) / 2
    ctx.clearRect(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    ctx.save()
    ctx.beginPath()
    ctx.arc(HALF, HALF, RADIUS, 0, TAU)
    ctx.clip()
    ctx.drawImage(source, sx, sy, minDim, minDim, 0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    ctx.restore()
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    ctx.arc(HALF, HALF, RADIUS, 0, TAU)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  async function decodeWithImageDecoder(file: File): Promise<DecodedGif> {
    const canvas = new OffscreenCanvas(E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not create a canvas for the GIF.')
    const objectUrl = URL.createObjectURL(file)
    try {
      const response = await fetch(objectUrl)
      const decoder = new ImageDecoder({ data: response.body!, type: 'image/gif' })
      try {
        await decoder.completed

        const track = decoder.tracks.selectedTrack!
        const totalFrames = track.frameCount
        const jpegFrames: Uint8Array[] = []
        let totalDurationUs = 0

        for (let i = 0; i < totalFrames; i++) {
          const result = await decoder.decode({ frameIndex: i })
          const vf = result.image
          try {
            // A GIF delay of 0 means "use the default", which is 100 ms.
            const d = vf.duration
            totalDurationUs += d ? d : 100_000

            drawGifFrame(ctx, vf, vf.displayWidth, vf.displayHeight)

            const imgData = ctx.getImageData(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
            const jpeg = await encodeJpeg(
              E87_IMAGE_WIDTH,
              E87_IMAGE_HEIGHT,
              new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength),
              85,
            )
            jpegFrames.push(jpeg)
          } finally {
            vf.close()
          }
        }

        // Average frame duration -> fps, clamped 1-30
        const avgDurationMs = (totalDurationUs / totalFrames) / 1000
        const fps = Math.max(1, Math.min(30, Math.round(1000 / avgDurationMs)))

        return { jpegFrames, fps }
      } finally {
        decoder.close()
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

</script>

<div class="flex flex-col gap-5">
  <!-- Drop zone -->
  <div
    class="drop-zone"
    class:drag-over={dragOver}
    role="button"
    tabindex="0"
    ondragover={(e) => { e.preventDefault(); dragOver = true }}
    ondragleave={() => { dragOver = false }}
    ondrop={handleDrop}
    onclick={() => fileInput?.click()}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput?.click() }}
  >
    <span class="material-symbols-outlined text-[40px] opacity-70">gif_box</span>
    {#if busy}
      <span class="text-label-md font-medium">Processing...</span>
    {:else}
      <span class="text-label-md font-medium">Drop GIF here or click to browse</span>
    {/if}
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept="image/gif"
    onchange={handleFileSelect}
    disabled={isWriting || busy}
    class="sr-only"
    aria-label="Choose GIF file"
  />

  <Button
    variant="tonal"
    size="md"
    icon="gif_box"
    disabled={isWriting || busy}
    onclick={() => fileInput?.click()}
  >
    Select GIF file...
  </Button>

  <details class="rounded-2xl bg-surface-container p-3">
    <summary class="cursor-pointer text-label-lg">Search GIPHY</summary>
    <form class="flex flex-col gap-2 pt-3" onsubmit={giphySearch}>
      <label class="flex flex-col gap-1 text-label-md">Your GIPHY API key
        <input type="password" bind:value={giphyKey} autocomplete="off" class="rounded-lg bg-surface-container-high" />
      </label>
      <p class="text-label-sm text-on-surface-variant m-0">Get a free key at developers.giphy.com. It's stored only in this browser, and searches go straight from your browser to GIPHY.</p>
      <div class="flex gap-2">
        <input type="search" bind:value={giphyQuery} placeholder="cats, fire, hello…" aria-label="GIPHY search" class="flex-1 rounded-lg bg-surface-container-high" />
        <Button variant="tonal" size="sm" icon="search" type="submit" disabled={giphyBusy || busy}>{giphyBusy ? 'Searching…' : 'Search'}</Button>
      </div>
    </form>
    {#if giphyResults.length}
      <div class="grid grid-cols-4 gap-1 pt-3">
        {#each giphyResults as g (g.id)}
          <button type="button" class="rounded-lg overflow-hidden aspect-square bg-black" title={g.title} aria-label="Use GIF {g.title}" disabled={busy || isWriting} onclick={() => pickGiphy(g.url)}>
            <img src={g.thumb} alt="" loading="lazy" class="w-full h-full object-cover" />
          </button>
        {/each}
      </div>
      <p class="text-label-sm text-on-surface-variant m-0 pt-2">Powered by GIPHY</p>
    {/if}
  </details>

  {#if status}
    <p class="text-body-sm text-on-surface-variant m-0">{status}</p>
  {/if}

  {#if frameCount > 0}
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
      <span>Frames: <span class="tabular text-on-surface">{frameCount}</span></span>
      <span>FPS: <span class="tabular text-on-surface">{detectedFps}</span></span>
      {#if outputSize}
        <span>Size: <span class="tabular text-on-surface">{outputSize}</span></span>
      {/if}
    </div>
  {/if}

  {#if errorMsg}
    <p class="text-body-sm text-error m-0">{errorMsg}</p>
  {/if}
</div>

<style>
  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    border: 2px dashed var(--md-sys-color-outline-variant, #79747e);
    border-radius: 1rem;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
    color: var(--md-sys-color-on-surface-variant, #49454f);
  }
  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--md-sys-color-primary, #6750a4);
    background-color: color-mix(in srgb, var(--md-sys-color-primary, #6750a4) 8%, transparent);
  }
</style>
