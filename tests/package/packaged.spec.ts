/**
 * The built application, started and driven — Realisation X.
 *
 * Everything else in `tests/` runs against the project directory: the
 * development Electron, `out/` on disk, `node_modules/` fully present. That is
 * the right instrument for behaviour and the wrong one for packaging, because
 * the two questions Realisation X asks about the artefact cannot be reached
 * from there at all.
 *
 * The first is whether the `files:` exclusions removed something the app needs.
 * They take what JADEITE itself contributes to an installation from 99 MB to
 * 8.3 MB — `app.asar` 68 MB → 4.4 MB, its unpacked sidecar 31 MB → 3.9 MB, 1769
 * entries → 456 — by dropping three renderer libraries the bundler had already
 * inlined and the SQLite amalgamation the native module was compiled from. The
 * install as a whole goes 409 MB → 318 MB, and the arithmetic between those two
 * pairs is worth stating rather than leaving to be noticed: the remaining
 * 310 MB is Electron, which is the framework's price and not something a
 * `files:` list can argue with. Every exclusion is dead
 * *by argument*, and the argument is exactly the kind that is right until it is
 * not: argon2 resolves its binary through node-gyp-build and better-sqlite3
 * through `bindings`, both of which walk candidate paths at require time rather
 * than importing a fixed one. An exclusion one directory too wide produces an
 * application that builds, packages, installs, and throws at unlock — on a
 * machine that never built it, which is the only kind that will ever run it.
 * No unit test sees this, because no unit test loads an asar.
 *
 * The second is the shape of the artefact itself: that the exclusions landed at
 * all. A negation pattern that matches nothing is not an error in
 * electron-builder; it is silence. So the asar is opened and read here rather
 * than trusted, and the same assertions that prove the fat is gone would fail
 * if a pattern were quietly matching nothing.
 *
 * This suite is deliberately outside `tests/e2e/`, under its own Playwright
 * config, and is not run by `npm run test:e2e`. It needs a packaged build,
 * which takes minutes; making the ordinary loop pay that is how a slow suite
 * stops being run. `npm run verify:package` builds and runs it in one step.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { listPackage } from '@electron/asar'
import { expect, test } from '@playwright/test'

import {
  createVaultAndEnter,
  launchPackagedFresh,
  projectRoot,
  type Session
} from '../e2e/fixtures.js'

const unpackedRoot = resolve(projectRoot, 'release/linux-unpacked')
const asarPath = resolve(unpackedRoot, 'resources/app.asar')

/**
 * The six destinations of §2, by the test id each section's root carries.
 *
 * Written out rather than imported from `src/renderer/src/shell/destinations.ts`
 * on purpose. This suite's subject is a *built* application, and importing the
 * source list would let a destination be renamed in both places at once and
 * still pass — the packaged app would stop opening a section and the test that
 * exists to notice would have moved with it.
 */
const DESTINATIONS = [
  'section1',
  'section2',
  'section3',
  'section4',
  'overview',
  'altinEgrisi'
] as const

/** Everything the exclusions claim to have removed. */
const EXCLUDED = [
  'node_modules/echarts',
  'node_modules/zrender',
  'node_modules/@tanstack',
  'node_modules/better-sqlite3-multiple-ciphers/deps',
  'node_modules/better-sqlite3-multiple-ciphers/build/Release/obj',
  'node_modules/better-sqlite3-multiple-ciphers/src'
]

/** What must survive them, on pain of an application that cannot open a vault. */
const REQUIRED = [
  'out/main/index.js',
  'out/renderer/index.html',
  'package.json',
  'build/icon.png'
]

test.describe('the packaged application', () => {
  let session: Session
  /** Renderer console errors, which §3 Definition of Done puts at zero. */
  const consoleErrors: string[] = []
  /** Anything the page threw that nobody caught. */
  const pageErrors: string[] = []

  test.beforeAll(async () => {
    session = await launchPackagedFresh()
    session.page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    session.page.on('pageerror', (error) => pageErrors.push(error.message))
  })

  test.afterAll(async () => {
    await session?.close()
  })

  test('starts from its own binary and reaches the first-run ceremony', async () => {
    // Reaching this screen already proves more than it looks like. The window
    // is drawn by the renderer chunk inside the asar, over file://, under the
    // build-time CSP — none of which the development launch exercises.
    await expect(session.page.getByTestId('password')).toBeVisible()
  })

  test('creates a vault, which is the whole native-module question', async () => {
    // Argon2id derivation and a SQLCipher database, in one ceremony: if either
    // native module failed to resolve its binary out of `app.asar.unpacked`
    // after the exclusions, this is where it stops. It is the reason this file
    // exists.
    const recoveryKey = await createVaultAndEnter(session)
    expect(recoveryKey.length).toBeGreaterThan(0)
    await expect(session.page.getByTestId('shell')).toBeVisible()
  })

  for (const destination of DESTINATIONS) {
    test(`opens ${destination}`, async () => {
      await session.page.getByTestId(`nav-${destination}`).click()
      await expect(session.page.getByTestId(destination)).toBeVisible()
    })
  }

  test('opens Altın Eğrisi with its chart module intact', async () => {
    // Named separately from the loop above because of what it proves. The
    // section imports `Chart.tsx`, which imports echarts at module scope — and
    // echarts is one of the three packages the exclusions delete from the asar.
    // If the bundler had *not* inlined it, this import would throw as the
    // section mounted and the destination would never render. Opening it is the
    // measurement behind the claim in electron-builder.yml.
    await session.page.getByTestId('nav-altinEgrisi').click()
    await expect(session.page.getByTestId('altinEgrisi')).toBeVisible()
  })

  test('reaches the lock screen inside the §3.4 budget', async () => {
    // The reference rig's ceiling is 1.5 s. This is the packaged application on
    // whichever machine is running the suite, so a failure here is a signal to
    // measure rather than a verdict on the owner's hardware — the two rigs of
    // §3.4 are checked by the owner, on the owner's rigs, from the installed
    // package. What this asserts is that packaging did not *introduce* a cost:
    // the same code, started the way it will really be started.
    const coldStart = session.coldStartMs()
    expect(coldStart, 'the app did not report a cold-start measurement').not.toBeNull()
    console.log(`    packaged launch to lock screen: ${coldStart} ms (budget 1500 ms)`)
    expect(coldStart!).toBeLessThanOrEqual(1500)
  })

  test('logged no console error and threw nothing on the happy path', () => {
    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})

/**
 * The asar's file list, read once and lazily.
 *
 * Lazily because Playwright runs a describe body at *collection* time: reading
 * the archive there would make a missing package an unreadable ENOENT during
 * collection, before `launchPackagedFresh` ever gets to say which command to
 * run.
 */
let cachedEntries: string[] | null = null
function asarEntries(): string[] {
  if (cachedEntries === null) {
    if (!existsSync(asarPath)) {
      throw new Error(
        `No packaged application at ${asarPath}. Run \`npm run verify:package\` first.`
      )
    }
    cachedEntries = listPackage(asarPath, { isPack: false })
  }
  return cachedEntries
}

test.describe('the artefact the exclusions produced', () => {
  test('no longer carries anything the exclusions name', () => {
    const entries = asarEntries()
    // A negation pattern that matches nothing is silent in electron-builder, so
    // the absence is asserted rather than assumed. `listPackage` returns paths
    // rooted at '/', hence the leading separator.
    const survivors = EXCLUDED.filter((excluded) =>
      entries.some((entry) => entry.startsWith(`/${excluded}`))
    )
    expect(survivors, 'these were excluded and are still in the asar').toEqual([])
  })

  test('still carries everything the application loads', () => {
    const entries = asarEntries()
    const missing = REQUIRED.filter((required) => !entries.includes(`/${required}`))
    expect(missing, 'these must be in the asar for the app to run').toEqual([])
  })

  test('keeps the two native modules and their binaries', () => {
    // Excluded *from the asar* by `asarUnpack`, so they are absent from the
    // listing above by design and present on disk instead. The `.node` files
    // are what argon2 and better-sqlite3 actually load.
    for (const binary of [
      'resources/app.asar.unpacked/node_modules/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node',
      'resources/app.asar.unpacked/node_modules/argon2/package.json'
    ]) {
      expect(() => readFileSync(resolve(unpackedRoot, binary))).not.toThrow()
    }
  })

  test('is a fraction of the size it was, and the count says where it went', () => {
    const entries = asarEntries()
    // 1769 entries at v0.9c, of which 1271 were echarts, zrender and @tanstack.
    // A floor of the same kind `locale-parity` uses, in the other direction: it
    // fails if the fat comes back, and does not fail merely because the
    // application grew a file.
    expect(entries.length).toBeLessThan(600)
  })
})
