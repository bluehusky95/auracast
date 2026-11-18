<script lang="ts">
  /**
   * Pixel Lab: draw pixel art (up to 48 frames) and send it as a looping clip.
   * Editor model ported from Badge Studio (MIT), see pixel-editor.ts.
   */
  import { onMount } from 'svelte'
  import { PixelEditor, PALETTES, MAX_FRAMES, drawPixelFrame, type Tool, type Frame } from './pixel-editor.svelte'
  import { buildMjpgAvi } from '../avi-builder'
  import { toJpeg, SIZE } from '../patterns/helpers'
  import { fitJpegFramesToBudget, MAX_UPLOAD_BYTES, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT } from './image-processing'
  import { formatBytes } from './utils'
  import Button from './m3/Button.svelte'
  import IconButton from './m3/IconButton.svelte'

  interface Props {
    onResult: (avi: Uint8Array, fps: number) => void
    busy: boolean
    isWriting: boolean
  }
  let { onResult, busy = $bindable(false), isWriting }: Props = $props()

  const STORE = 'auracast.pixel'
  const ed = new PixelEditor(16)
  const bump = () => save()
  let fps = $state(4)
  let bg = $state('#000000')
  let onion = $state(true)
  let palette = $state('neon')
  let status = $state('')
  let canvas: HTMLCanvasElement | null = $state(null)
  let drawing = false

  const TOOLS: Array<[Tool, string, string]> = [
    ['brush', 'brush', 'Brush'], ['erase', 'ink_eraser', 'Eraser'], ['fill', 'format_color_fill', 'Fill'],
    ['line', 'horizontal_rule', 'Line'], ['rect', 'crop_square', 'Rectangle'], ['picker', 'colorize', 'Pick color'],
  ]

  onMount(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? 'null')
      if (s && Array.isArray(s.frames) && s.frames.length && s.frames.length <= MAX_FRAMES &&
          s.frames.every((f: Frame) => Array.isArray(f) && f.length === s.size * s.size && f.every((c) => c === null || /^#[0-9a-f]{6}$/i.test(c)))) {
        ed.load(s.frames, s.size)
        fps = s.fps ?? fps
        bg = s.bg ?? bg
      }
    } catch { /* no saved art */ }
  })

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ frames: $state.snapshot(ed.frames), size: ed.size, fps, bg })) } catch { /* storage blocked */ }
  }

  $effect(() => {
    void onion; void bg; void ed.size; void ed.index
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const side = canvas.width, n = ed.size, cell = side / n
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, side, side)
    const prev = ed.frames[ed.index - 1]
    if (onion && prev) {
      ctx.globalAlpha = 0.25
      prev.forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect((i % n) * cell, Math.floor(i / n) * cell, cell, cell) } })
      ctx.globalAlpha = 1
    }
    ed.frame.forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect((i % n) * cell, Math.floor(i / n) * cell, cell, cell) } })
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let i = 1; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, side); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(side, i * cell); ctx.stroke()
    }
  })

  function cellAt(e: PointerEvent): [number, number] {
    const r = canvas!.getBoundingClientRect()
    return [Math.floor(((e.clientX - r.left) / r.width) * ed.size), Math.floor(((e.clientY - r.top) / r.height) * ed.size)]
  }
  function onDown(e: PointerEvent) { drawing = true; canvas!.setPointerCapture(e.pointerId); ed.down(...cellAt(e)); bump() }
  function onMove(e: PointerEvent) { if (drawing) { ed.move(...cellAt(e)) } }
  function onUp() { if (drawing) { drawing = false; ed.up(); bump() } }

  const act = (fn: () => void) => () => { fn(); bump() }

  async function importImage(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const bmp = await createImageBitmap(file)
    const c = new OffscreenCanvas(ed.size, ed.size)
    const ctx = c.getContext('2d')!
    const s = Math.min(bmp.width, bmp.height)
    ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, ed.size, ed.size)
    bmp.close()
    ed.importImageData(ctx.getImageData(0, 0, ed.size, ed.size).data)
    bump()
  }

  async function makeClip() {
    busy = true
    status = 'Encoding…'
    try {
      const c = new OffscreenCanvas(SIZE, SIZE)
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.imageSmoothingEnabled = false
      const jpegs: Uint8Array[] = []
      for (const f of ed.frames) {
        drawPixelFrame(ctx, f, ed.size, SIZE, bg)
        jpegs.push(await toJpeg(c))
      }
      const fitted = await fitJpegFramesToBudget(jpegs, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT, MAX_UPLOAD_BYTES)
      const avi = buildMjpgAvi(fitted.frames, { fps })
      status = `Ready: ${jpegs.length} frame(s) @ ${fps} fps, ${formatBytes(avi.length)}`
      onResult(avi, fps)
    } catch (err) {
      status = (err as Error).message
    } finally {
      busy = false
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap gap-1" role="toolbar" aria-label="Drawing tools">
    {#each TOOLS as [id, icon, label]}
      <IconButton {icon} ariaLabel={label} selected={ed.tool === id} variant={ed.tool === id ? 'filled' : 'standard'} onclick={() => { ed.tool = id}} />
    {/each}
    <IconButton icon="flip" ariaLabel="Mirror drawing" selected={ed.mirror} variant={ed.mirror ? 'filled' : 'standard'} onclick={() => { ed.mirror = !ed.mirror}} />
    <IconButton icon="undo" ariaLabel="Undo" disabled={!ed.canUndo} onclick={act(() => ed.undo())} />
    <IconButton icon="redo" ariaLabel="Redo" disabled={!ed.canRedo} onclick={act(() => ed.redo())} />
  </div>

  <canvas
    bind:this={canvas}
    width="384" height="384"
    class="w-full max-w-[384px] aspect-square rounded-xl touch-none cursor-crosshair self-center border border-outline-variant"
    aria-label="Pixel canvas, {ed.size} by {ed.size}"
    onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp}
  ></canvas>

  <div class="flex flex-wrap items-center gap-2">
    <input type="color" value={ed.color} aria-label="Color" class="w-10 h-10 rounded-lg cursor-pointer" oninput={(e) => { ed.color = (e.target as HTMLInputElement).value}} />
    {#each PALETTES[palette] as c}
      <button type="button" class="w-7 h-7 rounded-full border-2 {ed.color === c ? 'border-primary' : 'border-outline-variant'}" style="background:{c}" aria-label="Color {c}" onclick={() => { ed.color = c}}></button>
    {/each}
    <select bind:value={palette} class="w-auto rounded-lg bg-surface-container text-label-md" aria-label="Palette">
      {#each Object.keys(PALETTES) as p}<option value={p}>{p}</option>{/each}
    </select>
  </div>

  <div class="flex flex-wrap items-center gap-2 text-label-md text-on-surface-variant">
    <span>Frame {ed.index + 1} / {ed.frames.length}</span>
    <IconButton icon="chevron_left" ariaLabel="Previous frame" disabled={ed.index === 0} onclick={() => { ed.index--}} />
    <IconButton icon="chevron_right" ariaLabel="Next frame" disabled={ed.index >= ed.frames.length - 1} onclick={() => { ed.index++}} />
    <IconButton icon="add" ariaLabel="New frame" disabled={ed.frames.length >= MAX_FRAMES} onclick={act(() => ed.addFrame())} />
    <IconButton icon="content_copy" ariaLabel="Duplicate frame" disabled={ed.frames.length >= MAX_FRAMES} onclick={act(() => ed.duplicateFrame())} />
    <IconButton icon="delete" ariaLabel="Delete frame" disabled={ed.frames.length < 2} onclick={act(() => ed.deleteFrame())} />
    <IconButton icon="arrow_back" ariaLabel="Move frame earlier" onclick={act(() => ed.moveFrame(-1))} />
    <IconButton icon="arrow_forward" ariaLabel="Move frame later" onclick={act(() => ed.moveFrame(1))} />
    <label class="flex items-center gap-1"><input type="checkbox" bind:checked={onion} /> Onion skin</label>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <IconButton icon="swap_horiz" ariaLabel="Flip horizontally" onclick={act(() => ed.flip(true))} />
    <IconButton icon="swap_vert" ariaLabel="Flip vertically" onclick={act(() => ed.flip(false))} />
    <IconButton icon="keyboard_arrow_up" ariaLabel="Shift up" onclick={act(() => ed.shift(0, -1))} />
    <IconButton icon="keyboard_arrow_down" ariaLabel="Shift down" onclick={act(() => ed.shift(0, 1))} />
    <IconButton icon="keyboard_arrow_left" ariaLabel="Shift left" onclick={act(() => ed.shift(-1, 0))} />
    <IconButton icon="keyboard_arrow_right" ariaLabel="Shift right" onclick={act(() => ed.shift(1, 0))} />
    <IconButton icon="layers_clear" ariaLabel="Clear frame" onclick={act(() => ed.clear())} />
    <label class="flex items-center gap-1 text-label-md">Grid
      <select value={ed.size} class="rounded-lg bg-surface-container" onchange={(e) => { ed.resize(Number((e.target as HTMLSelectElement).value)); bump() }}>
        {#each [8, 16, 24, 32] as n}<option value={n}>{n}×{n}</option>{/each}
      </select>
    </label>
    <label class="flex items-center gap-1 text-label-md">Background <input type="color" bind:value={bg} onchange={save} class="w-8 h-8 rounded" /></label>
    <label class="text-label-md cursor-pointer underline text-primary">Import image<input type="file" accept="image/*" class="sr-only" onchange={importImage} /></label>
  </div>

  <label class="flex items-center gap-3 text-label-md">Speed
    <input type="range" min="1" max="24" bind:value={fps} onchange={save} class="flex-1 accent-[var(--md-sys-color-primary)]" />
    <span class="tabular-nums w-14">{fps} fps</span>
  </label>

  <div class="flex items-center gap-3">
    <Button variant="filled" size="sm" icon="movie" disabled={busy || isWriting} onclick={makeClip}>{busy ? 'Encoding…' : 'Preview clip'}</Button>
    {#if status}<span class="text-label-md text-on-surface-variant">{status}</span>{/if}
  </div>
</div>
