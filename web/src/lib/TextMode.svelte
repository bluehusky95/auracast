<script lang="ts">
  import { TEXT_EFFECTS, TEXT_FONTS, type TextEffect } from '../text-generator'
  import * as TextGen from '../text-generator'
  // Debug hook for the Playwright text-effect audit harness
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __AURACAST_TEXT__: typeof TextGen }).__AURACAST_TEXT__ = TextGen
  }
  import { MAX_UPLOAD_BYTES } from './image-processing'
  import FrameRateControls from './FrameRateControls.svelte'
  import SegmentedButton from './m3/SegmentedButton.svelte'
  import { Button, IconButton } from './m3'
  import { defaultTextLayout, type TextLayout, type VAlign } from '../text-layout'

  interface Props {
    isWriting: boolean
    isGeneratingPreview: boolean
    isGeneratingPattern: boolean // reused: text generation reuses the same flag
    text: string
    textEffect: TextEffect
    textFontId: string
    textColor: string
    textBackground: string
    textFps: number
    textFrames: number
    textLayout: TextLayout
    /** Extra messages that take turns with `text`. */
    textPages: string[]
    onGeneratePreview: () => void
    onGenerateStill: () => void
  }

  let {
    isWriting, isGeneratingPreview, isGeneratingPattern,
    text = $bindable(),
    textEffect = $bindable(),
    textFontId = $bindable(),
    textColor = $bindable(),
    textBackground = $bindable(),
    textFps = $bindable(),
    textFrames = $bindable(),
    textLayout = $bindable(),
    textPages = $bindable(),
    onGeneratePreview, onGenerateStill,
  }: Props = $props()

  const PRESETS = [
    { label: 'White on black',  fg: '#f5f7ff', bg: '#000000' },
    { label: 'Hot pink',        fg: '#ff2f9c', bg: '#1a0010' },
    { label: 'Neon green',      fg: '#3effb6', bg: '#001a0a' },
    { label: 'Cyber cyan',      fg: '#3fd2fb', bg: '#000820' },
    { label: 'Warning yellow',  fg: '#ffe23f', bg: '#1a1300' },
    { label: 'Sunset orange',   fg: '#ff7a3f', bg: '#1a0a00' },
  ]

  // Same font and weight App uses to render, so the size hint matches the output.
  let laid = $derived(TextGen.measureTextLayout(
    text, (TEXT_FONTS.find((f) => f.id === textFontId) ?? TEXT_FONTS[0]).stack, 800, textLayout,
  ))
  const POSITIONS: { value: VAlign; label: string }[] = [
    { value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' },
  ]

  function setAuto(on: boolean) {
    // Turning auto off starts the slider at the size auto had picked.
    if (!on) textLayout.size = Math.round(laid.baseSize)
    textLayout.autoSize = on
  }
  function setScale(i: number, v: number) {
    const next = [...textLayout.lineScale]
    for (let k = next.length; k < i; k++) next[k] = 100
    next[i] = v
    textLayout.lineScale = next
  }

  let selectedEffectDef = $derived(TEXT_EFFECTS.find(e => e.id === textEffect) ?? TEXT_EFFECTS[0])
  let pageCount = $derived(textPages.filter((p) => p.trim()).length)
  // Static with extra messages becomes a slideshow, so it needs frames too.
  let isStatic = $derived(selectedEffectDef.id === 'static' && pageCount === 0)
  let secsEach = $derived((textFrames / (1 + pageCount) / textFps).toFixed(1))

  function estimatedSize(): number {
    const bpf = selectedEffectDef.bytesPerFrame
    const f = isStatic ? 1 : textFrames
    return f * (bpf + 80) + 6000
  }

  function maxFramesForCap(): number {
    const bpf = selectedEffectDef.bytesPerFrame
    return Math.max(8, Math.floor((MAX_UPLOAD_BYTES - 6000) / (bpf + 80)))
  }

  let lastSig = $state('')
  const DEBOUNCE = 280

  $effect(() => {
    if (isWriting || isGeneratingPreview || isGeneratingPattern) return
    if (!text.trim() && textEffect !== 'static') return
    const sig = `${text}|${textEffect}|${textFontId}|${textColor}|${textBackground}|${textFrames}|${textFps}|${JSON.stringify(textLayout)}|${JSON.stringify(textPages)}`
    if (sig === lastSig) return
    const t = setTimeout(() => {
      lastSig = sig
      if (isStatic) onGenerateStill()
      else onGeneratePreview()
    }, DEBOUNCE)
    return () => clearTimeout(t)
  })

  // Clamp frames when switching to a heavier effect.
  $effect(() => {
    if (isStatic) return
    const cap = maxFramesForCap()
    if (textFrames > cap) textFrames = cap
  })
</script>

<div class="flex flex-col gap-5">
  <label class="flex flex-col gap-2">
    <span class="text-label-md text-on-surface-variant">{textPages.length ? 'Message 1' : 'Text'}</span>
    <textarea
      bind:value={text}
      placeholder="Hello world"
      maxlength="120"
      rows="3"
      autocomplete="off"
      autocapitalize="sentences"
      disabled={isWriting}
      class="resize-y"
    ></textarea>
    <span class="text-body-sm text-on-surface-variant">Press Enter for a new line.{textEffect === 'marquee' ? (textLayout.rim ? ' Marquee spins the curved lines.' : ' Marquee scrolls everything as one line.') : ''}</span>
  </label>

  {#each textPages as _, i}
    <div class="flex gap-2 items-end">
      <label class="flex flex-col gap-2 flex-1">
        <span class="text-label-md text-on-surface-variant">Message {i + 2}</span>
        <textarea bind:value={textPages[i]} placeholder="Another message" maxlength="120" rows="2" autocomplete="off" disabled={isWriting} class="resize-y"></textarea>
      </label>
      <IconButton icon="delete" ariaLabel="Remove message {i + 2}" disabled={isWriting} onclick={() => { textPages = textPages.filter((_, k) => k !== i) }} />
    </div>
  {/each}
  <div class="flex flex-wrap items-center gap-3 -mt-2">
    {#if textPages.length < 3}
      <Button variant="text" size="sm" icon="add" disabled={isWriting} onclick={() => { textPages = [...textPages, ''] }}>Add message</Button>
    {/if}
    {#if pageCount}
      <span class="text-body-sm text-on-surface-variant">Messages take turns, about {secsEach} s each. Change frames or speed below to adjust.</span>
    {/if}
  </div>

  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {#each TEXT_EFFECTS as eff}
      <button
        type="button"
        class="group relative flex flex-col items-start gap-1 rounded-2xl px-4 py-3 text-left border transition-[colors,box-shadow,transform] duration-150 ease-m3-standard isolate active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface {textEffect === eff.id
          ? 'border-primary bg-primary-container/30 shadow-elev-1'
          : 'border-outline-variant bg-surface-container-low hover:border-primary/60 hover:bg-surface-container'}"
        onclick={() => (textEffect = eff.id)}
        disabled={isWriting}
      >
        <span class="text-title-sm text-on-surface font-medium">{eff.name}</span>
        <span class="text-body-sm text-on-surface-variant leading-tight">{eff.description}</span>
      </button>
    {/each}
  </div>

  <div class="flex flex-wrap gap-5 items-end">
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Color</span>
      <input type="color" bind:value={textColor} disabled={isWriting} />
    </label>
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Background</span>
      <input type="color" bind:value={textBackground} disabled={isWriting} />
    </label>
    <label class="flex flex-col gap-2 min-w-[180px]">
      <span class="text-label-md text-on-surface-variant">Font</span>
      <select bind:value={textFontId} disabled={isWriting}>
        {#each TEXT_FONTS as f}
          <option value={f.id}>{f.label}</option>
        {/each}
      </select>
    </label>
  </div>

  <section class="flex flex-col gap-4 rounded-2xl border border-outline-variant p-4" aria-label="Text layout">
    <label class="flex items-center gap-2 text-label-md">
      <input type="checkbox" bind:checked={textLayout.rim} disabled={isWriting} />
      Curve the first line along the top edge (and the last line along the bottom)
    </label>
    <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
      <label class="flex items-center gap-2 text-label-md">
        <input type="checkbox" checked={textLayout.autoSize} onchange={(e) => setAuto(e.currentTarget.checked)} disabled={isWriting} />
        Auto size
      </label>
      <label class="flex items-center gap-2 text-label-md flex-1 min-w-[220px]">
        Size
        <input type="range" min="12" max="200" bind:value={textLayout.size} disabled={isWriting || textLayout.autoSize} class="flex-1 accent-[var(--md-sys-color-primary)]" />
        <span class="w-14 text-right tabular-nums">{textLayout.autoSize ? Math.round(laid.baseSize) : textLayout.size} px</span>
      </label>
    </div>
    {#if !textLayout.autoSize && !laid.fits}
      <p class="text-label-md text-error m-0" role="status">Text runs off the round screen. Make it smaller or shorter, or turn on Auto size.</p>
    {/if}

    {#if laid.lines.length > 1}
      <div class="flex flex-col gap-2">
        <span class="text-label-md text-on-surface-variant">Size of each line</span>
        {#each laid.lines as ln, i}
          <label class="flex items-center gap-2 text-label-md">
            <span class="w-28 truncate" title={ln.text}>{i + 1}. {ln.text.trim() || '(blank)'}</span>
            <input type="range" min="30" max="150" step="5" value={textLayout.lineScale[i] ?? 100} oninput={(e) => setScale(i, +e.currentTarget.value)} disabled={isWriting} class="flex-1 accent-[var(--md-sys-color-primary)]" aria-label="Line {i + 1} size" />
            <span class="w-12 text-right tabular-nums">{textLayout.lineScale[i] ?? 100}%</span>
          </label>
        {/each}
      </div>
    {/if}

    <div class="grid sm:grid-cols-2 gap-x-6 gap-y-3">
      <label class="flex items-center gap-2 text-label-md">
        <span class="w-24">Line spacing</span>
        <input type="range" min="0.8" max="2" step="0.05" bind:value={textLayout.lineSpacing} disabled={isWriting} class="flex-1 accent-[var(--md-sys-color-primary)]" />
        <span class="w-10 text-right tabular-nums">{textLayout.lineSpacing.toFixed(2)}</span>
      </label>
      <label class="flex items-center gap-2 text-label-md">
        <span class="w-24">Letter spacing</span>
        <input type="range" min="-4" max="24" bind:value={textLayout.letterSpacing} disabled={isWriting} class="flex-1 accent-[var(--md-sys-color-primary)]" />
        <span class="w-10 text-right tabular-nums">{textLayout.letterSpacing}</span>
      </label>
      <label class="flex items-center gap-2 text-label-md">
        <span class="w-24">Outline</span>
        <input type="range" min="0" max="12" bind:value={textLayout.outline} disabled={isWriting} class="flex-1 accent-[var(--md-sys-color-primary)]" />
        <span class="w-10 text-right tabular-nums">{textLayout.outline}</span>
      </label>
      <div class="flex items-center gap-5 text-label-md">
        <label class="flex items-center gap-2"><input type="checkbox" bind:checked={textLayout.shadow} disabled={isWriting} /> Shadow</label>
        <label class="flex items-center gap-2">Outline &amp; shadow colour <input type="color" bind:value={textLayout.edgeColor} disabled={isWriting} /></label>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      {#if !textLayout.rim}
        <span class="text-label-md text-on-surface-variant">Position</span>
        <SegmentedButton segments={POSITIONS} bind:value={textLayout.vAlign} name="Vertical position" />
      {/if}
      <button type="button" class="ml-auto text-label-md text-primary underline-offset-2 hover:underline disabled:opacity-50" disabled={isWriting} onclick={() => { textLayout = defaultTextLayout() }}>Reset layout</button>
    </div>
  </section>

  <div class="flex flex-wrap gap-2">
    {#each PRESETS as p}
      <button
        type="button"
        class="rounded-full px-4 py-2 text-label-md font-medium border border-outline-variant transition-[transform,border-color] duration-150 ease-m3-standard hover:-translate-y-0.5 hover:border-primary active:scale-[0.97] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        onclick={() => { textColor = p.fg; textBackground = p.bg }}
        disabled={isWriting}
        style="background:{p.bg}; color:{p.fg};"
      >{p.label}</button>
    {/each}
  </div>

  {#if !isStatic}
    <FrameRateControls
      bind:frames={textFrames}
      bind:fps={textFps}
      maxFrames={maxFramesForCap()}
      minFrames={6}
      framesStep={2}
      minFps={2}
      estSize={estimatedSize()}
      overBudget={estimatedSize() > MAX_UPLOAD_BYTES}
      budgetBytes={MAX_UPLOAD_BYTES}
      disabled={isWriting}
    />
  {:else}
    <p class="text-body-sm text-on-surface-variant">Generates a single still image, no animation.</p>
  {/if}
</div>
