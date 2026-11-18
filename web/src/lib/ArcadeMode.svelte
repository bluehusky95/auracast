<script lang="ts">
  /**
   * Arcade mode: play a game here, record 6 seconds, send the recording.
   */
  import { onMount } from 'svelte'
  import { Arcade, GAMES, type GameKind } from './arcade'
  import { buildMjpgAvi } from '../avi-builder'
  import { toJpeg, SIZE } from '../patterns/helpers'
  import { fitJpegFramesToBudget, MAX_UPLOAD_BYTES, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT } from './image-processing'
  import Button from './m3/Button.svelte'
  import IconButton from './m3/IconButton.svelte'

  interface Props {
    onResult: (avi: Uint8Array, fps: number) => void
    busy: boolean
    isWriting: boolean
  }
  let { onResult, busy = $bindable(false), isWriting }: Props = $props()

  const REC_SECONDS = 6, REC_FPS = 10
  let canvas: HTMLCanvasElement | null = $state(null)
  let statusText = $state('')
  let kind: GameKind = $state('snake')
  let recording = $state(false)
  let recLeft = $state(0)
  const arcade = new Arcade(() => { statusText = arcade.status() })

  onMount(() => {
    arcade.select(kind)
    let raf = 0, last = performance.now()
    const loop = (now: number) => {
      arcade.tick(Math.min(0.05, (now - last) / 1000))
      last = now
      const ctx = canvas?.getContext('2d')
      if (ctx) arcade.draw(ctx)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  })

  function pick(k: GameKind) { if (recording) return; kind = k; arcade.select(k) }

  const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'])
  function onKey(e: KeyboardEvent, down: boolean) {
    const k = e.code === 'Space' ? 'Space' : e.key
    if (!KEYS.has(k) && e.key !== 'p' && e.key !== 'Enter') return
    e.preventDefault()
    if (!down) { arcade.held.delete(k); return }
    if (e.key === 'p') return arcade.togglePause()
    if (!arcade.game.running) { if (k === 'Space' || e.key === 'Enter') arcade.start(); return }
    arcade.held.add(k)
    arcade.direction(k)
  }

  function logical(e: PointerEvent): [number, number] {
    const r = canvas!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * 368, ((e.clientY - r.top) / r.height) * 368]
  }
  function onPointer(e: PointerEvent, phase: 'down' | 'move' | 'up') {
    if (phase === 'down') {
      canvas!.focus()
      if (!arcade.game.running) { arcade.start(); return }
    }
    if (phase === 'move' && e.buttons === 0 && e.pointerType !== 'mouse') return
    arcade.pointer(...logical(e), phase)
  }
  const pad = (k: string, down: boolean) => {
    if (down) { if (!arcade.game.running) arcade.start(); arcade.held.add(k); arcade.direction(k) } else arcade.held.delete(k)
  }

  async function record() {
    if (!arcade.game.running) arcade.start()
    canvas?.focus()
    recording = true
    busy = true
    try {
      const off = new OffscreenCanvas(SIZE, SIZE)
      const ctx = off.getContext('2d', { willReadFrequently: true })!
      // Capture in real time first (cheap bitmaps), encode afterwards, so
      // slow JPEG encoding can't stretch the recording.
      const shots: ImageBitmap[] = []
      const t0 = performance.now()
      for (let i = 0; i < REC_SECONDS * REC_FPS; i++) {
        const wait = t0 + (i * 1000) / REC_FPS - performance.now()
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        recLeft = Math.ceil(REC_SECONDS - i / REC_FPS)
        arcade.draw(ctx)
        shots.push(await createImageBitmap(off))
      }
      statusText = 'Encoding…'
      const jpegs: Uint8Array[] = []
      for (const shot of shots) {
        ctx.drawImage(shot, 0, 0)
        shot.close()
        jpegs.push(await toJpeg(off))
      }
      const fitted = await fitJpegFramesToBudget(jpegs, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT, MAX_UPLOAD_BYTES)
      onResult(buildMjpgAvi(fitted.frames, { fps: REC_FPS }), REC_FPS)
      statusText = 'Recording ready. Send it from the preview.'
    } finally {
      recording = false
      busy = false
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Game">
    {#each GAMES as [id, name]}
      <Button variant={kind === id ? 'filled' : 'tonal'} size="sm" disabled={recording} onclick={() => pick(id)}>{name}</Button>
    {/each}
  </div>
  <p class="text-body-sm text-on-surface-variant m-0">{GAMES.find((g) => g[0] === kind)?.[2]} Press P to pause.</p>

  <canvas
    bind:this={canvas}
    width="368" height="368"
    tabindex="0"
    class="w-full max-w-[368px] aspect-square rounded-full self-center touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    aria-label="{GAMES.find((g) => g[0] === kind)?.[1]} game. {statusText}"
    onkeydown={(e) => onKey(e, true)}
    onkeyup={(e) => onKey(e, false)}
    onpointerdown={(e) => onPointer(e, 'down')}
    onpointermove={(e) => onPointer(e, 'move')}
    onpointerup={(e) => onPointer(e, 'up')}
  ></canvas>

  <div class="grid grid-cols-3 gap-1 self-center w-36" aria-label="On-screen arrows">
    <span></span>
    <IconButton icon="keyboard_arrow_up" ariaLabel="Up" onpointerdown={() => pad('ArrowUp', true)} onpointerup={() => pad('ArrowUp', false)} />
    <span></span>
    <IconButton icon="keyboard_arrow_left" ariaLabel="Left" onpointerdown={() => pad('ArrowLeft', true)} onpointerup={() => pad('ArrowLeft', false)} />
    <IconButton icon={statusText === 'Paused' ? 'play_arrow' : 'pause'} ariaLabel="Pause or resume" onclick={() => arcade.togglePause()} />
    <IconButton icon="keyboard_arrow_right" ariaLabel="Right" onpointerdown={() => pad('ArrowRight', true)} onpointerup={() => pad('ArrowRight', false)} />
    <span></span>
    <IconButton icon="keyboard_arrow_down" ariaLabel="Down" onpointerdown={() => pad('ArrowDown', true)} onpointerup={() => pad('ArrowDown', false)} />
    <span></span>
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <Button variant="filled" size="sm" icon="fiber_manual_record" disabled={recording || isWriting} onclick={record}>
      {recording ? `Recording… ${recLeft}s` : `Record ${REC_SECONDS} s for the badge`}
    </Button>
    <span class="text-label-md text-on-surface-variant" aria-live="polite">{statusText}</span>
  </div>
</div>
