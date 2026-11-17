<script lang="ts">
  /**
   * Stickers, frame and caption that go on top of any mode when you send.
   */
  import { onMount } from 'svelte'
  import {
    EMOJIS, FRAME_STYLES, STICKER_ANIMS, applyOverlay, defaultOverlay, drawOverlay, overlayActive,
    type OverlayConfig,
  } from './overlay'
  import { parseAviFrames, readAviFps } from './avi-preview'
  import type { OutputFrameSize } from './image-processing'
  import AviPlayer from './AviPlayer.svelte'
  import Button from './m3/Button.svelte'
  import IconButton from './m3/IconButton.svelte'

  interface Props {
    overlay: OverlayConfig
    getBase: () => Promise<Uint8Array>
    outSize: () => OutputFrameSize
    log: (m: string) => void
    disabled?: boolean
  }
  let { overlay = $bindable(), getBase, outSize, log, disabled = false }: Props = $props()

  const STORE = 'auracast.overlay'
  let canvas: HTMLCanvasElement | null = $state(null)
  let resultFrames: ImageBitmap[] = $state([])
  let resultFps = $state(12)
  let resultUrl: string | null = $state(null)
  let busy = $state(false)
  let player: { startPreview: () => void } | null = $state(null)
  let error = $state('')

  onMount(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? 'null')
      if (s?.frame && s?.caption && Array.isArray(s?.stickers)) overlay = { ...defaultOverlay(), ...s }
    } catch { /* nothing saved */ }
  })

  // Persist and animate the mini preview whenever the overlay changes.
  $effect(() => {
    const snap = $state.snapshot(overlay)
    try { localStorage.setItem(STORE, JSON.stringify(snap)) } catch { /* storage blocked */ }
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#11161c'
      ctx.fillRect(0, 0, canvas!.width, canvas!.height)
      drawOverlay(ctx, snap, ((now - start) / 3000) % 1, canvas!.width / 368)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  })

  function addSticker(emoji: string) {
    overlay.stickers.push({ emoji, x: 0.5 + (Math.random() - 0.5) * 0.4, y: 0.35 + Math.random() * 0.3, size: 0.18, rotation: 0, anim: 'none' })
  }

  async function previewOnDesign() {
    busy = true
    error = ''
    try {
      const out = await applyOverlay(await getBase(), $state.snapshot(overlay), outSize(), log)
      for (const f of resultFrames) f.close()
      if (resultUrl) URL.revokeObjectURL(resultUrl)
      resultFrames = []
      resultUrl = null
      if (out[0] === 0x52) {
        resultFps = readAviFps(out)
        resultFrames = await parseAviFrames(out)
        requestAnimationFrame(() => player?.startPreview())
      } else {
        resultUrl = URL.createObjectURL(new Blob([out as BlobPart], { type: 'image/jpeg' }))
      }
    } catch (e) {
      error = (e as Error).message
    } finally {
      busy = false
    }
  }
</script>

<div class="flex flex-col gap-4">
  <p class="text-body-sm text-on-surface-variant m-0">These go on top of whatever you send from any mode. {overlayActive(overlay) ? 'Overlay is on.' : 'Nothing added yet.'}</p>

  <div class="flex flex-wrap gap-4 items-start">
    <canvas bind:this={canvas} width="184" height="184" class="rounded-full shrink-0" aria-label="Overlay preview"></canvas>
    <div class="flex flex-col gap-3 flex-1 min-w-[220px]">
      <label class="flex flex-col gap-1 text-label-md">Frame
        <div class="flex gap-2 items-center">
          <select bind:value={overlay.frame.style} class="rounded-lg bg-surface-container flex-1">
            {#each FRAME_STYLES as [id, label]}<option value={id}>{label}</option>{/each}
          </select>
          <input type="color" bind:value={overlay.frame.color} aria-label="Frame color" class="w-9 h-9 rounded" />
        </div>
      </label>
      <label class="flex items-center gap-2 text-label-md">Thickness
        <input type="range" min="2" max="30" bind:value={overlay.frame.width} class="flex-1 accent-[var(--md-sys-color-primary)]" />
      </label>
      <label class="flex flex-col gap-1 text-label-md">Caption
        <input type="text" maxlength="40" bind:value={overlay.caption.text} placeholder="e.g. Ask me about my badge" class="rounded-lg bg-surface-container" />
      </label>
      <div class="flex flex-wrap gap-3 items-center text-label-md">
        <select bind:value={overlay.caption.position} class="w-auto rounded-lg bg-surface-container" aria-label="Caption position">
          <option value="top">Top</option><option value="bottom">Bottom</option>
        </select>
        <input type="color" bind:value={overlay.caption.color} aria-label="Caption color" class="w-9 h-9 rounded" />
        <label class="flex items-center gap-1"><input type="checkbox" bind:checked={overlay.caption.bg} /> Backdrop</label>
        <label class="flex items-center gap-1">Size <input type="range" min="12" max="40" bind:value={overlay.caption.size} class="w-24 accent-[var(--md-sys-color-primary)]" /></label>
      </div>
    </div>
  </div>

  <div class="flex flex-col gap-2">
    <span class="text-label-md">Add a sticker</span>
    <div class="flex flex-wrap gap-1">
      {#each EMOJIS as e}
        <button type="button" class="w-9 h-9 rounded-lg text-xl hover:bg-on-surface/[0.08]" aria-label="Add {e} sticker" onclick={() => addSticker(e)}>{e}</button>
      {/each}
    </div>
  </div>

  {#if overlay.stickers.length}
    <ul class="flex flex-col gap-2 list-none p-0 m-0">
      {#each overlay.stickers as s, i}
        <li class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-container p-2 text-label-md">
          <span class="text-xl w-7 text-center" aria-hidden="true">{s.emoji}</span>
          <label class="flex items-center gap-1">X <input type="range" min="0" max="1" step="0.01" bind:value={s.x} class="w-20" /></label>
          <label class="flex items-center gap-1">Y <input type="range" min="0" max="1" step="0.01" bind:value={s.y} class="w-20" /></label>
          <label class="flex items-center gap-1">Size <input type="range" min="0.06" max="0.5" step="0.01" bind:value={s.size} class="w-20" /></label>
          <label class="flex items-center gap-1">Tilt <input type="range" min="-180" max="180" bind:value={s.rotation} class="w-20" /></label>
          <select bind:value={s.anim} class="w-auto rounded-lg bg-surface-container" aria-label="Sticker animation">
            {#each STICKER_ANIMS as a}<option value={a}>{a === 'none' ? 'Still' : a[0].toUpperCase() + a.slice(1)}</option>{/each}
          </select>
          <IconButton icon="close" ariaLabel="Remove {s.emoji} sticker" onclick={() => overlay.stickers.splice(i, 1)} />
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex flex-wrap gap-2 items-center">
    <Button variant="tonal" size="sm" icon="visibility" disabled={disabled || busy || !overlayActive(overlay)} onclick={previewOnDesign}>
      {busy ? 'Compositing…' : 'Preview on current design'}
    </Button>
    <Button variant="text" size="sm" icon="layers_clear" disabled={!overlayActive(overlay)} onclick={() => { overlay = defaultOverlay() }}>Remove overlay</Button>
    {#if error}<span class="text-label-md text-error">{error}</span>{/if}
  </div>
  {#if resultFrames.length}
    <AviPlayer bind:this={player} frames={resultFrames} fps={resultFps} label="Design with overlay" />
  {:else if resultUrl}
    <img src={resultUrl} alt="Design with overlay" width="260" height="260" class="rounded-full self-center" />
  {/if}
</div>
