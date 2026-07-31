import { defineConfig } from '@playwright/test'

/**
 * The palette sweep, which produces evidence rather than a verdict.
 *
 * A third config for a third kind of run. `playwright.config.ts` is behaviour
 * and runs constantly; `playwright.package.config.ts` reads a built artefact
 * and runs when something is packaged; this one drives the packaged application
 * through twenty windows and photographs each, for a judgement only the owner
 * can make (X's visual sweep) and a comparison only Realisation XI will need
 * (rendering parity against Linux).
 *
 * It is not run by `npm test` or `npm run test:e2e` — nothing downstream
 * depends on it and it needs a packaged build. `npm run sweep:palettes`.
 */
export default defineConfig({
  testDir: './tests/sweep',
  // Ten palettes and a first-run ceremony inside one test, twice.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  forbidOnly: true
})
