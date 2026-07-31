import { defineConfig } from '@playwright/test'

/**
 * The packaged-artefact suite, run apart from the behavioural one.
 *
 * `playwright.config.ts` points at `tests/e2e` and is run by `npm run
 * test:e2e` on every change. This one points at `tests/package`, needs an
 * `electron-builder` run to have happened first, and is driven by `npm run
 * verify:package`. Two configs rather than one with a project filter, because
 * the difference is not which tests to run but what has to exist before they
 * can run at all.
 */
export default defineConfig({
  testDir: './tests/package',
  // The first-run ceremony pays Argon2id twice, and here it pays it inside a
  // packaged app rather than a warm development one.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  // The suite drives one application through one vault from first-run onward:
  // the tests share a session in order and must not be reordered or parallelised.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  forbidOnly: true
})
