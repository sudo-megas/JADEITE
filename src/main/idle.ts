/**
 * Auto-lock on idle — Realisation I scope, default 10 minutes.
 *
 * Idle is measured from the operating system's own input clock rather than
 * from renderer activity, so a window left open behind other work still locks,
 * and a renderer that stops responding cannot hold the vault open.
 */

import { powerMonitor } from 'electron'
import * as vault from './vault/vault.js'

const POLL_INTERVAL_MS = 15_000

let timer: NodeJS.Timeout | null = null

// Logged once rather than every fifteen seconds forever: a session without an
// idle clock does not regain one mid-run, so one line is the whole story and
// a repeat every tick would just be noise around it.
let reportedMissingClock = false

function tick(): void {
  if (!vault.isUnlocked()) return

  const limitSeconds = vault.autoLockMinutes() * 60
  let idleSeconds: number
  try {
    idleSeconds = powerMonitor.getSystemIdleTime()
  } catch {
    // Some session types do not expose an idle clock. Leaving the vault open is
    // the wrong failure: without a reliable idle signal, do nothing here and
    // let explicit locking and suspend handling carry the responsibility.
    if (!reportedMissingClock) {
      reportedMissingClock = true
      console.warn(
        '[idle] no system idle clock on this session — auto-lock on idle is disabled; ' +
          'suspend and lock-screen handling still apply'
      )
    }
    return
  }

  if (idleSeconds >= limitSeconds) vault.lock('idle')
}

export function startIdleWatch(): void {
  if (timer) return
  timer = setInterval(tick, POLL_INTERVAL_MS)
  timer.unref()

  // Locking the screen or suspending the machine should not leave a decrypted
  // database sitting in memory.
  powerMonitor.on('suspend', () => vault.lock('idle'))
  powerMonitor.on('lock-screen', () => vault.lock('idle'))
}

export function stopIdleWatch(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
