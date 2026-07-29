/**
 * The registry that carries the rule "nothing from the vault survives a lock".
 *
 * Only the registry is exercised here. The stores that register with it live in
 * the renderer and reach for `window.jadeite`, which the main-process type
 * project deliberately knows nothing about — widening it to type `window` would
 * cost a real guard against main-process code using DOM APIs. That the Section 1
 * store actually empties is proved where it is observable instead: lock with a
 * year open, unlock, and see the section come back from the vault rather than
 * from memory (tests/e2e/section1.spec.ts).
 */

import { describe, expect, it } from 'vitest'

import { forgetVaultData, registerVaultScoped } from '../../src/renderer/src/store/vault-scoped.js'

describe('forgetVaultData', () => {
  it('runs every registered reset', () => {
    const cleared: string[] = []
    registerVaultScoped(() => cleared.push('one'))
    registerVaultScoped(() => cleared.push('two'))

    forgetVaultData()

    expect(cleared).toContain('one')
    expect(cleared).toContain('two')
  })

  it('is safe to call repeatedly, and when nothing was ever loaded', () => {
    let count = 0
    registerVaultScoped(() => {
      count += 1
    })

    const before = count
    forgetVaultData()
    forgetVaultData()

    // Locking an already-locked vault must not be an error; the main process
    // treats lock() as idempotent and so does this.
    expect(count).toBe(before + 2)
  })
})
