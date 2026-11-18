<script lang="ts">
  import { qrPayload, defaultQrForm, type QrForm, type QrKind } from './qr-payloads'
  import SegmentedButton from './m3/SegmentedButton.svelte'

  interface Props {
    isWriting: boolean
    qrUrl: string
    qrDarkColor: string
    qrLightColor: string
    qrDotStyle: string
    qrOutsideMode: string
    qrZoom: number
    qrRotation: number
  }

  let {
    isWriting,
    qrUrl = $bindable(),
    qrDarkColor = $bindable(),
    qrLightColor = $bindable(),
    qrDotStyle = $bindable(),
    qrOutsideMode = $bindable(),
    qrZoom = $bindable(),
    qrRotation = $bindable(),
  }: Props = $props()

  // The form is kept in this browser only; App renders whatever string qrUrl holds.
  const KEY = 'auracast.qr'
  function load(): QrForm {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
      if (v && typeof v === 'object') return { ...defaultQrForm(qrUrl), ...v }
    } catch { /* fall through */ }
    return defaultQrForm(qrUrl)
  }
  let form: QrForm = $state(load())
  $effect(() => {
    const payload = qrPayload(form)
    if (payload !== qrUrl) qrUrl = payload
    try { localStorage.setItem(KEY, JSON.stringify(form)) } catch { /* private mode */ }
  })

  const KINDS: { value: QrKind; label: string; icon: string }[] = [
    { value: 'link', label: 'Link', icon: 'link' },
    { value: 'contact', label: 'Contact', icon: 'contact_page' },
    { value: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
    { value: 'text', label: 'Text', icon: 'notes' },
  ]
  // Long codes get dense and hard to scan from a small round screen.
  let dense = $derived(qrUrl.length > 300)
</script>

<div class="flex flex-col gap-5">
  <SegmentedButton segments={KINDS} bind:value={form.kind} name="What the QR code holds" fullWidth />

  {#if form.kind === 'link'}
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">URL</span>
      <input type="url" inputmode="url" autocomplete="url" spellcheck="false" bind:value={form.url} placeholder="https://example.com" disabled={isWriting} />
    </label>
  {:else if form.kind === 'contact'}
    <p class="m-0 text-body-sm text-on-surface-variant">People scan it and their phone offers to save you as a contact. Anyone who can see your badge can scan it, so only add what you're happy to share. Fill in only what you need: fewer fields make a code that's easier to scan.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label class="flex flex-col gap-2"><span class="text-label-md text-on-surface-variant">Name</span><input type="text" autocomplete="name" bind:value={form.name} disabled={isWriting} /></label>
      <label class="flex flex-col gap-2"><span class="text-label-md text-on-surface-variant">Company</span><input type="text" autocomplete="organization" bind:value={form.company} disabled={isWriting} /></label>
      <label class="flex flex-col gap-2"><span class="text-label-md text-on-surface-variant">Job title</span><input type="text" autocomplete="organization-title" bind:value={form.title} disabled={isWriting} /></label>
      <label class="flex flex-col gap-2"><span class="text-label-md text-on-surface-variant">Phone</span><input type="tel" autocomplete="tel" bind:value={form.phone} disabled={isWriting} /></label>
      <label class="flex flex-col gap-2"><span class="text-label-md text-on-surface-variant">Email</span><input type="email" autocomplete="email" bind:value={form.email} disabled={isWriting} /></label>
      <label class="flex flex-col gap-2"><span class="text-label-md text-on-surface-variant">Website</span><input type="url" inputmode="url" autocomplete="url" bind:value={form.website} disabled={isWriting} /></label>
    </div>
  {:else if form.kind === 'wifi'}
    <p class="m-0 text-body-sm text-on-surface-variant">People scan it to join the network. Anyone who can see your badge can scan it and read the password.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label class="flex flex-col gap-2"><span class="text-label-md text-on-surface-variant">Network name</span><input type="text" autocomplete="off" spellcheck="false" bind:value={form.ssid} disabled={isWriting} /></label>
      <label class="flex flex-col gap-2"><span class="text-label-md text-on-surface-variant">Password</span><input type="text" autocomplete="off" spellcheck="false" bind:value={form.password} disabled={isWriting || form.security === 'nopass'} /></label>
      <label class="flex flex-col gap-2">
        <span class="text-label-md text-on-surface-variant">Security</span>
        <select bind:value={form.security} disabled={isWriting}>
          <option value="WPA">WPA / WPA2 / WPA3</option>
          <option value="WEP">WEP (old)</option>
          <option value="nopass">None (open network)</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-label-md self-end h-10"><input type="checkbox" bind:checked={form.hidden} disabled={isWriting} /> Hidden network</label>
    </div>
  {:else}
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Text</span>
      <textarea bind:value={form.text} rows="3" maxlength="300" placeholder="Shown on the phone after scanning" disabled={isWriting}></textarea>
    </label>
  {/if}
  <p class="m-0 -mt-2 text-body-sm text-on-surface-variant">
    {#if !qrUrl}Fill in the details above to make the code.{:else if dense}This code is long, so it's dense and harder to scan. Leave out fields you don't need.{:else}Saved in this browser only.{/if}
  </p>

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Dark modules</span>
      <input type="color" bind:value={qrDarkColor} disabled={isWriting} />
    </label>
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Light modules</span>
      <input type="color" bind:value={qrLightColor} disabled={isWriting} />
    </label>
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Dot style</span>
      <select bind:value={qrDotStyle} disabled={isWriting}>
        <option value="square">Square</option>
        <option value="round">Round</option>
        <option value="squircle">Squircle</option>
      </select>
    </label>
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Outside dots</span>
      <select bind:value={qrOutsideMode} disabled={isWriting}>
        <option value="on">Enabled</option>
        <option value="off">Disabled</option>
      </select>
    </label>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Zoom <span class="tabular text-on-surface">{qrZoom.toFixed(2)}×</span></span>
      <input type="range" min="0.85" max="1.45" step="0.01" bind:value={qrZoom} disabled={isWriting} />
    </label>
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Rotation <span class="tabular text-on-surface">{qrRotation.toFixed(0)}°</span></span>
      <input type="range" min="-180" max="180" step="45" bind:value={qrRotation} disabled={isWriting} />
    </label>
  </div>
</div>
