import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * What the About page states about the build, compiled in rather than fetched.
 *
 * These three could have been a preload channel. They are not, and the reason is
 * `tests/e2e/hardening.spec.ts`, which asserts the bridge's exact key list so
 * that growing it is a decision somebody made rather than a thing that happened.
 * A version string, a date and a licence are fixed at build time and identical
 * for every vault, so a channel would widen the boundary to carry three
 * constants — and the boundary is the security posture of §3.3.
 *
 * `releaseDate` is read from `package.json` beside `version`, so the two values
 * that must move together at a release are edited in one place. A non-standard
 * field there has precedent: `allowScripts` is already one.
 *
 * `LICENSE` is the GPL-3.0 text the repository already ships, read here rather
 * than copied into the renderer tree, because two copies of a licence is exactly
 * how they drift apart.
 */
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string
  releaseDate: string
  homepage: string
}
const buildConstants = {
  __APP_VERSION__: JSON.stringify(manifest.version),
  __RELEASE_DATE__: JSON.stringify(manifest.releaseDate),
  // The repository address, which the packages also carry — pacman's `url`,
  // the deb's `Homepage:`. It joins the two constants above at Realisation X
  // for their reason rather than a new one: the About page had it as a literal
  // and electron-builder read it from `.git/config`, so the screen and the
  // package listing stated the same fact from two places and one of them was
  // not in the repository. Same argument as `LICENSE` below.
  __REPOSITORY_URL__: JSON.stringify(manifest.homepage),
  __LICENCE_TEXT__: JSON.stringify(readFileSync(resolve(root, 'LICENSE'), 'utf8'))
}

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
    define: buildConstants,
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
