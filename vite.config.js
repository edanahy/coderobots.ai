import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
)

// LEGO Education mode runs Pyodide in a Web Worker and uses SharedArrayBuffer
// + Atomics.wait for synchronous JS→main-thread RPC. Browsers only expose
// SharedArrayBuffer when the document is cross-origin isolated, which
// requires both headers below. Production hosts must emit the same headers
// (see vercel.json). COEP 'credentialless' (not 'require-corp') keeps
// third-party fetches (Supabase, Modal, Pyodide CDN) working without CORP.
const crossOriginIsolationHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
        tailwindcss(),
        react(),
    ],
    server: {
        headers: crossOriginIsolationHeaders,
    },
    preview: {
        headers: crossOriginIsolationHeaders,
    },
})
