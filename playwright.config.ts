import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Each spec drives a whole ceremony, and Argon2id is deliberately slow.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  // One Electron app at a time: they would otherwise contend for the display.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  forbidOnly: true
})
