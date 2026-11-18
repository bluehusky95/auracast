import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Built file names never contain "-h" or "help": pupblue.com deploys with the
// neocities command, which reads either anywhere in its arguments as its help
// option and silently uploads nothing (helpers-<hash>.js went missing that
// way). The hash follows a dot, so one starting with "h" can't make "-h".
const safe = (name: string) => name.replace(/help/gi, 'hlp').replace(/-h/gi, '_h')
const stem = (file: string) => file.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
const safeNames = {
  hashCharacters: 'hex' as const, // 0-9a-f: no hyphen inside a hash either
  entryFileNames: (c: { name: string }) => `assets/${safe(c.name)}.[hash].js`,
  chunkFileNames: (c: { name: string }) => `assets/${safe(c.name)}.[hash].js`,
  assetFileNames: (a: { names?: string[]; name?: string }) =>
    `assets/${safe(stem(a.names?.[0] ?? a.name ?? 'asset'))}.[hash][extname]`,
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), basicSsl()],
  base: process.env.BASE_PATH,
  // jpeg-js (used to produce badge-compatible JPEGs with standard Huffman
  // tables) imports Node's `Buffer`. Polyfill it in the browser bundle.
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'jpeg-js'],
  },
  server: {
    // Safari and Firefox on this machine can use the dev UI while the
    // Python relay owns Bluetooth. The relay listens on 127.0.0.1:8787.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
        },
        ...safeNames,
      },
    },
  },
  worker: { rollupOptions: { output: safeNames } },
})
