<script lang="ts">
  // "My badge": files stored on the badge (thumbnails, download, delete,
  // format) and clock sync. Protocol ported from Badge Studio (MIT).
  import {
    browseFilesE87,
    previewFileE87,
    readFileE87,
    deleteFileE87,
    formatStorageE87,
    syncTimeE87,
    type E87BadgeFile,
    type E87Connection,
  } from './e87-protocol'
  import { Button as M3Button, IconButton as M3IconButton } from './m3'

  interface Props {
    conn: E87Connection | null
    run: <T>(label: string, fn: (c: E87Connection) => Promise<T>) => Promise<T | undefined>
    log: (msg: string) => void
    setStatus: (s: string) => void
    disabled?: boolean
  }
  let { conn, run, log, setStatus, disabled = false }: Props = $props()

  let files: E87BadgeFile[] = $state([])
  let thumbs: Record<string, string> = $state({})
  let loading = $state(false)
  let loaded = $state(false)
  let busyKey = $state('')
  let readProgress = $state('')

  const key = (f: E87BadgeFile) => `${f.path}/${f.name}:${f.cluster}`
  const isMedia = (f: E87BadgeFile) => /\.(avi|jpe?g)$/i.test(f.name)

  // Drop thumbnails when the badge changes or disconnects.
  $effect(() => {
    if (!conn) {
      for (const url of Object.values(thumbs)) URL.revokeObjectURL(url)
      files = []
      thumbs = {}
      loaded = false
    }
  })

  async function refresh(): Promise<void> {
    loading = true
    try {
      const list = await run('List badge files', (c) => browseFilesE87(c, log))
      if (!list) return
      files = list
      loaded = true
      setStatus(`Badge has ${list.length} file(s).`)
      // Thumbnails one at a time: BLE carries one transfer at once.
      for (const f of list.filter(isMedia)) {
        if (!conn || files !== list) break
        const jpeg = await run(`Preview ${f.name}`, (c) => previewFileE87(c, f, log))
        if (jpeg) thumbs = { ...thumbs, [key(f)]: URL.createObjectURL(new Blob([jpeg as BlobPart], { type: 'image/jpeg' })) }
      }
    } finally {
      loading = false
    }
  }

  async function download(f: E87BadgeFile): Promise<void> {
    busyKey = key(f)
    try {
      const res = await run(`Download ${f.name}`, (c) => readFileE87(c, f, log, {
        onProgress: (got, size) => { readProgress = size ? `${Math.round(got / size * 100)}%` : `${Math.round(got / 1024)} KB` },
      }))
      if (!res) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([res.data as BlobPart]))
      a.download = f.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      setStatus(`Downloaded ${f.name} (${res.data.length.toLocaleString()} bytes).`)
    } finally {
      busyKey = ''
      readProgress = ''
    }
  }

  async function remove(f: E87BadgeFile): Promise<void> {
    if (!confirm(`Delete ${f.name} from the badge? This cannot be undone.`)) return
    busyKey = key(f)
    try {
      const ok = await run(`Delete ${f.name}`, async (c) => { await deleteFileE87(c, f, log); return true })
      if (!ok) return
      const k = key(f)
      if (thumbs[k]) URL.revokeObjectURL(thumbs[k])
      files = files.filter((x) => key(x) !== k)
      setStatus(`Deleted ${f.name}.`)
    } finally {
      busyKey = ''
    }
  }

  async function format(): Promise<void> {
    if (!confirm('Erase ALL media stored on the badge? This cannot be undone.')) return
    if (!confirm('Really erase everything? The badge will be empty.')) return
    loading = true
    try {
      const ok = await run('Format storage', async (c) => { await formatStorageE87(c, log); return true })
      if (ok) { files = []; thumbs = {}; setStatus('Badge storage erased.') }
    } finally {
      loading = false
    }
  }

  async function syncClock(): Promise<void> {
    const ok = await run('Clock sync', async (c) => { await syncTimeE87(c, log); return true })
    if (ok) setStatus(`Badge clock set to ${new Date().toLocaleTimeString()}.`)
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap gap-2">
    <M3Button variant="filled" size="sm" icon="refresh" disabled={!conn || disabled || loading} onclick={refresh}>
      {loading ? 'Reading…' : loaded ? 'Refresh files' : 'Show files'}
    </M3Button>
    <M3Button variant="tonal" size="sm" icon="schedule" disabled={!conn || disabled || loading} onclick={syncClock}>Sync clock</M3Button>
    <M3Button variant="text" size="sm" icon="delete_sweep" disabled={!conn || disabled || loading} onclick={format}>Erase all</M3Button>
  </div>

  {#if !conn}
    <p class="text-body-md text-on-surface-variant">Connect the badge to see what's stored on it.</p>
  {:else if loaded && files.length === 0}
    <p class="text-body-md text-on-surface-variant">No files on the badge.</p>
  {:else if files.length}
    <ul class="grid grid-cols-2 sm:grid-cols-3 gap-3 list-none p-0 m-0">
      {#each files as f (key(f))}
        <li class="rounded-2xl bg-surface-container p-2 flex flex-col gap-2 min-w-0">
          <div class="aspect-square rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center">
            {#if thumbs[key(f)]}
              <img src={thumbs[key(f)]} alt={f.name} class="w-full h-full object-cover" />
            {:else}
              <span class="material-symbols-outlined text-on-surface-variant" aria-hidden="true">{isMedia(f) ? 'image' : 'draft'}</span>
            {/if}
          </div>
          <div class="text-label-md text-on-surface truncate" title={(f.path ? f.path + '/' : '') + f.name}>{f.name}</div>
          <div class="flex justify-end gap-1">
            {#if busyKey === key(f) && readProgress}<span class="text-label-sm text-on-surface-variant self-center mr-auto">{readProgress}</span>{/if}
            <M3IconButton icon="download" ariaLabel="Download {f.name}" disabled={disabled || loading || !!busyKey} onclick={() => download(f)} />
            <M3IconButton icon="delete" ariaLabel="Delete {f.name}" disabled={disabled || loading || !!busyKey} onclick={() => remove(f)} />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
