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

  const failures = await run('JADEITE — Realisation I, Electron-hosted suites')
  app.exit(failures === 0 ? 0 : 1)
}

app.disableHardwareAcceleration()
app.whenReady().then(main).catch((error) => {
  console.error('harness crashed:', error)
  app.exit(1)
})
