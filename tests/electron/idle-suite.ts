/**
 * The idle-lock timer itself — freeze audit L22.
 *
 * Every other suite that touches auto-lock (`vault-suite.ts`'s `LockReason`
 * assertions, `hardening.spec.ts`'s settings test) drives `vault.lock('idle')`
 * directly or writes the setting and stops there. None of them ever call
 * `tick()` — the function that reads the OS idle clock and decides whether to
 * lock — so a `tick()` that always returned early, or compared the wrong two
 * numbers, would still leave every existing test green. This suite is the one
 * place that calls it.
 *
 * `POLL_INTERVAL_MS` (15s) is not waited on: `tick` is exported specifically so
 * this suite can invoke one poll on demand, synchronously, rather than either
 * slowing the run down or racing a real timer.
 */

import { powerMonitor } from 'electron'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import { tick } from '../../src/main/idle.js'
import * as vault from '../../src/main/vault/vault.js'
import { setSetting } from '../../src/main/vault/db/settings.js'
import { SETTING_KEYS } from '../../src/shared/ipc-contract.js'

const PASSWORD = 'kuyumcu-defteri-2026'

let dataHome: string

beforeEach(() => {
  dataHome = mkdtempSync(join(tmpdir(), 'jadeite-idle-'))
  process.env['XDG_DATA_HOME'] = dataHome
  process.env['JADEITE_DATA_HOME'] = dataHome
  vault.lock()
})

afterEach(() => {
  vault.lock()
  rmSync(dataHome, { recursive: true, force: true })
})

/**
 * Stands in for the OS idle clock for the duration of `action`. `powerMonitor`
 * is a real object Electron hands back, not a mock this suite constructs — its
 * one native-bound method is swapped out and restored, the same shape as
 * `warningsWhile` below swaps `console.warn`.
 */
function withIdleSeconds<T>(seconds: number | (() => number), action: () => T): T {
  const original = powerMonitor.getSystemIdleTime
  powerMonitor.getSystemIdleTime = typeof seconds === 'function' ? seconds : () => seconds
  try {
    return action()
  } finally {
    powerMonitor.getSystemIdleTime = original
  }
}

function withThrowingClock<T>(action: () => T): T {
  const original = powerMonitor.getSystemIdleTime
  powerMonitor.getSystemIdleTime = () => {
    throw new Error('no idle clock on this session')
  }
  try {
    return action()
  } finally {
    powerMonitor.getSystemIdleTime = original
  }
}

function warningsWhile(action: () => void): string[] {
  const captured: string[] = []
  const original = console.warn
  console.warn = (...parts: unknown[]): void => {
    captured.push(parts.map((part) => String(part)).join(' '))
  }
  try {
    action()
  } finally {
    console.warn = original
  }
  return captured
}

async function unlockedVault(autoLockMinutes: number): Promise<void> {
  const created = await vault.create(PASSWORD)
  expect(created.ok, 'vault creation failed').toBe(true)
  const db = vault.database()
  if (db === null) throw new Error('unreachable: just created')
  setSetting(db, SETTING_KEYS.autoLockMinutes, String(autoLockMinutes))
}

describe('the idle poll (L22)', () => {
  it('does nothing when no vault is open, and never consults the idle clock', () => {
    // `vault.lock()` is idempotent, so asserting `isUnlocked()` stays false
    // alone would pass identically whether or not `tick()`'s early-return
    // guard exists at all — a vault that was never open has nothing for
    // `vault.lock('idle')` to change either way. What the guard actually buys
    // is never reaching `powerMonitor.getSystemIdleTime()` in the first
    // place, so that call is counted here rather than merely given an answer.
    expect(vault.isUnlocked()).toBe(false)
    let calls = 0
    const original = powerMonitor.getSystemIdleTime
    powerMonitor.getSystemIdleTime = () => {
      calls++
      return 999_999
    }
    try {
      expect(() => tick()).not.toThrow()
    } finally {
      powerMonitor.getSystemIdleTime = original
    }
    expect(vault.isUnlocked()).toBe(false)
    expect(calls, 'a vault that was never unlocked has nothing for the idle clock to measure').toBe(0)
  })

  it('leaves the vault open while idle time is under the limit', async () => {
    await unlockedVault(1)
    withIdleSeconds(30, () => tick())
    expect(vault.isUnlocked(), 'thirty seconds of idle against a one-minute limit').toBe(true)
  })

  it('locks the vault, with reason "idle", once idle time reaches the limit', async () => {
    await unlockedVault(1)

    let reason: string | null = null
    const off = vault.onLock((r) => {
      reason = r
    })
    try {
      withIdleSeconds(60, () => tick())
    } finally {
      off()
    }

    expect(vault.isUnlocked(), 'sixty seconds of idle against a one-minute limit').toBe(false)
    expect(reason).toBe('idle')
  })

  it('locks on an idle time past the limit, not only exactly at it', async () => {
    await unlockedVault(1)
    withIdleSeconds(3600, () => tick())
    expect(vault.isUnlocked()).toBe(false)
  })

  // Kept last in this file: `reportedMissingClock` in idle.ts is module-level
  // state that latches true the first time the clock throws, for the entire
  // process, and stays true afterwards — see idle.ts's own comment on why.
  // Nothing before this test drives that branch, so ordering only matters
  // within this test itself (the second `tick()` below must be the second
  // call ever to observe a throwing clock).
  it('disables itself without locking when the OS has no idle clock, and warns once', async () => {
    await unlockedVault(1)

    const warnings = warningsWhile(() => {
      withThrowingClock(() => {
        tick()
        tick()
      })
    })

    expect(vault.isUnlocked(), 'a missing idle clock must not lock the vault').toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0] ?? '').toContain('[idle]')
  })
})
