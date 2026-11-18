<script lang="ts">
  // Saved designs: send again, download, delete, import/export.
  import { onMount } from 'svelte'
  import { listItems, deleteItem, exportLibrary, importFile, isJpeg, type LibraryItem } from './library'
  import { formatBytes } from './utils'
  import { Button as M3Button, IconButton as M3IconButton } from './m3'

  interface Props {
    onSend: (bytes: Uint8Array) => void
    canSend: boolean
    refreshKey?: number
  }
  let { onSend, canSend, refreshKey = 0 }: Props = $props()

  let items: LibraryItem[] = $state([])
  let thumbs: Record<string, string> = $state({})
  let error = $state('')
  let note = $state('')

  async function load() {
    try {
      items = await listItems()
      for (const it of items) thumbs[it.id] ??= URL.createObjectURL(new Blob([it.thumb as BlobPart], { type: 'image/jpeg' }))
      error = ''
    } catch (e) { error = (e as Error).message }
  }
  onMount(() => () => { for (const u of Object.values(thumbs)) URL.revokeObjectURL(u) })
  $effect(() => { void refreshKey; void load() })

  function save(blob: Blob, name: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function remove(it: LibraryItem) {
    if (!confirm(`Delete "${it.name}" from your saved designs?`)) return
    await deleteItem(it.id)
    URL.revokeObjectURL(thumbs[it.id])
    delete thumbs[it.id]
    await load()
  }

  async function onImport(e: Event) {
    const input = e.target as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    let n = 0
    error = ''
    for (const f of files) {
      try { n += await importFile(f) } catch (err) { error = `${f.name}: ${(err as Error).message}` }
    }
    note = `Imported ${n} design(s).`
    await load()
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap gap-2 items-center">
    <label class="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-secondary-container text-on-secondary-container text-label-lg cursor-pointer">
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span>Import
      <input type="file" accept=".json,.avi,.jpg,.jpeg,application/json,video/x-msvideo,image/jpeg" multiple class="sr-only" onchange={onImport} />
    </label>
    <M3Button variant="text" size="sm" icon="download" disabled={!items.length} onclick={() => save(exportLibrary(items), `auracast-library-${new Date().toISOString().slice(0, 10)}.json`)}>Export all</M3Button>
    {#if note}<span class="text-label-md text-on-surface-variant">{note}</span>{/if}
  </div>
  {#if error}<p class="text-label-md text-error m-0">{error}</p>{/if}

  {#if !items.length}
    <p class="text-body-md text-on-surface-variant m-0">Nothing saved yet. Use <b>Save</b> under the preview to keep a design here. Saved designs stay in this browser only.</p>
  {:else}
    <ul class="grid grid-cols-2 sm:grid-cols-3 gap-3 list-none p-0 m-0">
      {#each items as it (it.id)}
        <li class="rounded-2xl bg-surface-container p-2 flex flex-col gap-2 min-w-0">
          <img src={thumbs[it.id]} alt={it.name} class="aspect-square w-full rounded-full object-cover bg-black" />
          <div class="text-label-md text-on-surface truncate" title={it.name}>{it.name}</div>
          <div class="text-label-sm text-on-surface-variant">{isJpeg(it.bytes) ? 'Still' : 'Clip'} · {formatBytes(it.bytes.length)}</div>
          <div class="flex justify-end gap-1">
            <M3IconButton icon="send" ariaLabel="Send {it.name} to badge" disabled={!canSend} onclick={() => onSend(it.bytes)} />
            <M3IconButton icon="download" ariaLabel="Download {it.name}" onclick={() => save(new Blob([it.bytes as BlobPart]), `${it.name}.${isJpeg(it.bytes) ? 'jpg' : 'avi'}`)} />
            <M3IconButton icon="delete" ariaLabel="Delete {it.name}" onclick={() => remove(it)} />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
