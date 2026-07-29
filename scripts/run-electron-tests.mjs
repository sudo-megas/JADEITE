/**
 * Bundle the Electron-hosted suites and run them in Electron.
 *
 * The bundle is written outside the app's build output so a test harness can
 * never end up inside a packaged artefact. XDG_DATA_HOME is redirected so the
 * suites can never touch the owner's real vault.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import electron from 'electron'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The bundle must live inside the project tree so that `require` of the
// externalised native modules resolves against the project's node_modules.
// node_modules/.cache is already ignored and is never packaged.
const buildDir = join(root, 'node_modules/.cache/jadeite-tests')
mkdirSync(buildDir, { recursive: true })
const bundlePath = join(buildDir, 'suites.cjs')

const workDir = mkdtempSync(join(tmpdir(), 'jadeite-tests-'))
const dataHome = join(workDir, 'xdg')

let exitCode = 1
try {
  await build({
    entryPoints: [join(root, 'tests/electron/index.ts')],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    sourcemap: 'inline',
    // Electron and the native modules must be required at runtime, not inlined.
    external: ['electron', 'better-sqlite3-multiple-ciphers', 'argon2']
  })

  const result = spawnSync(electron, ['--no-sandbox', bundlePath], {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      XDG_DATA_HOME: dataHome,
      XDG_CONFIG_HOME: join(workDir, 'config'),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      // The crash-recovery suite re-launches this same bundle as a child that
      // gets killed mid-session.
      JADEITE_TEST_BUNDLE: bundlePath
    }
  })
  exitCode = result.status ?? 1
} finally {
  rmSync(workDir, { recursive: true, force: true })
  rmSync(buildDir, { recursive: true, force: true })
}

process.exit(exitCode)
