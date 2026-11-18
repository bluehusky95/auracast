/**
 * Saved designs, kept in this browser's IndexedDB. Each item is a finished
 * badge payload (JPEG still or MJPEG AVI), so it can be re-sent as is.
 * Idea from Badge Studio's db.js (MIT).
 */
import { jpegFrames } from './badge-codec'
import { MAX_UPLOAD_BYTES } from './image-processing'

export interface LibraryItem {
  id: string
  name: string
  createdAt: number
  bytes: Uint8Array
  thumb: Uint8Array // first JPEG frame
}

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('This browser cannot store a library. Download your designs instead.'))
    const req = indexedDB.open('auracast-library', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('items', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbp = null; reject(new Error('Could not open the saved-designs library.')) }
  })
  return dbp
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction('items', mode)
    const req = fn(t.objectStore('items'))
    t.oncomplete = () => resolve(req.result)
    t.onerror = t.onabort = () => reject(new Error('Library read/write failed (storage may be full).'))
  })
}

export const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8
export const isAvi = (b: Uint8Array) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46

/** Reject anything that isn't a badge-sized JPEG or AVI (imported files are untrusted). */
export function validatePayload(bytes: Uint8Array): void {
  if (!isJpeg(bytes) && !isAvi(bytes)) throw new Error('Only JPEG stills and MJPEG AVI clips can be saved.')
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('File is larger than the badge limit (900 KB).')
  if (!jpegFrames(bytes).length) throw new Error('No JPEG frames found in that file.')
}

export async function listItems(): Promise<LibraryItem[]> {
  const all = await tx<LibraryItem[]>('readonly', (s) => s.getAll())
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveItem(bytes: Uint8Array, name: string): Promise<LibraryItem> {
  validatePayload(bytes)
  const item: LibraryItem = { id: crypto.randomUUID(), name: name.slice(0, 60) || 'Untitled', createdAt: Date.now(), bytes, thumb: jpegFrames(bytes)[0] }
  await tx('readwrite', (s) => s.put(item))
  return item
}

export const deleteItem = (id: string) => tx('readwrite', (s) => s.delete(id))

const b64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s) }
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function exportLibrary(items: LibraryItem[]): Blob {
  const data = { app: 'auracast-library', version: 1, items: items.map((i) => ({ name: i.name, createdAt: i.createdAt, data: b64(i.bytes) })) }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

/** Import a library JSON export, or a single .avi / .jpg file. Returns how many were added. */
export async function importFile(file: File): Promise<number> {
  if (file.size > 64 * 1024 * 1024) throw new Error('That file is too large to import.')
  if (/\.json$/i.test(file.name) || file.type === 'application/json') {
    const data = JSON.parse(await file.text())
    if (data?.app !== 'auracast-library' || !Array.isArray(data.items)) throw new Error('Not an AuraCast library export.')
    let n = 0
    for (const it of data.items) {
      if (typeof it?.data !== 'string') continue
      try { await saveItem(unb64(it.data), String(it.name ?? 'Imported')); n++ } catch { /* skip bad entries */ }
    }
    return n
  }
  await saveItem(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.[^.]+$/, ''))
  return 1
}
