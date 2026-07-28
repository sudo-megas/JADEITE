import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * A packaged renderer is loaded over file://, where no response headers exist
 * and the session-level CSP of src/main/security/session.ts therefore cannot
 * reach it. The policy is stamped into the document instead — at build time
 * only, so the development server keeps the looser policy that HMR needs.
 */
function contentSecurityPolicyMeta(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "media-src 'none'",
    "worker-src 'none'"
  ].join('; ')

  return {
    name: 'jadeite-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        /<head>/i,
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    // The renderer is sandboxed, so the preload bundle must be CommonJS and
    // must not pull in anything beyond electron's own contextBridge/ipcRenderer.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    resolve: {
      alias: { '@shared': resolve(root, 'src/shared') }
    },
    plugins: [react(), contentSecurityPolicyMeta()],
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/renderer/index.html') }
      }
    }
  }
})
