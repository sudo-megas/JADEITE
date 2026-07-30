/**
 * Entry point for the Electron-hosted suites.
 *
 * No window is ever created: these exercise the vault layer in the runtime
 * that ships it, and need no display.
 */

import { app } from 'electron'
import { resetHooks, run } from './harness.js'
import { crashWriter } from './crash-writer.js'

async function main(): Promise<void> {
  // Relaunched by the crash-recovery suite as the process that dies mid-write.
  if (process.env['JADEITE_TEST_ROLE'] === 'crash-writer') {
    await crashWriter()
    return
  }

  // Imported for their side effect of registering tests, in this order.
  await import('./storage-suite.js')
  resetHooks()
  await import('./vault-suite.js')
  resetHooks()
  await import('./crash-suite.js')
  resetHooks()
  await import('./section1-suite.js')
  resetHooks()
  await import('./section2-suite.js')
  resetHooks()
  await import('./section3-suite.js')
  resetHooks()
  await import('./prices-suite.js')
  // Load-bearing: the egress suite declares no hooks of its own, so without a
  // reset here every one of its tests would inherit prices-suite's beforeEach
  // and open a SQLCipher vault it never uses.
  resetHooks()
  await import('./egress-suite.js')
  resetHooks()
  await import('./section4-suite.js')

  const failures = await run('JADEITE — Electron-hosted suites')
  app.exit(failures === 0 ? 0 : 1)
}

app.disableHardwareAcceleration()
app.whenReady().then(main).catch((error) => {
  console.error('harness crashed:', error)
  app.exit(1)
})
