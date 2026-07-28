/**
 * The §3.3 hardening posture, checked from inside the renderer itself.
 *
 * These assert what an attacker who reached the renderer would actually find,
 * rather than what the configuration claims.
 */

import { expect, test } from '@playwright/test'

import { launchFresh, type Session } from './fixtures.js'

let session: Session

test.beforeEach(async () => {
  session = await launchFresh()
})

test.afterEach(async () => {
  await session?.close()
})

test('the renderer has no Node.js reachable from it', async () => {
  const exposure = await session.page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    module: typeof (globalThis as Record<string, unknown>)['module'],
    Buffer: typeof (globalThis as Record<string, unknown>)['Buffer'],
    global: typeof (globalThis as Record<string, unknown>)['global']
  }))

  expect(exposure).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    Buffer: 'undefined',
    global: 'undefined'
  })
})

test('the bridge exposes the contract and nothing more', async () => {
  const surface = await session.page.evaluate(() => {
    const api = window.jadeite
    return {
      top: Object.keys(api).sort(),
      vault: Object.keys(api.vault).sort(),
      settings: Object.keys(api.settings).sort()
    }
  })

  expect(surface.top).toEqual(['settings', 'vault'])
  expect(surface.vault).toEqual(['create', 'lock', 'onLocked', 'reset', 'status', 'unlock'])
  expect(surface.settings).toEqual(['get', 'set'])
})

test('no key material or filesystem path is reachable through the bridge', async () => {
  const status = await session.page.evaluate(() => window.jadeite.vault.status())
  expect(Object.keys(status).sort()).toEqual(['exists', 'locked'])
})

test('settings are refused while the vault is locked', async () => {
  const result = await session.page.evaluate(() => window.jadeite.settings.get('language'))
  expect(result).toEqual({ ok: false, error: 'LOCKED' })
})

test('a malformed IPC payload is refused rather than crashing the app', async () => {
  const results = await session.page.evaluate(async () => {
    const api = window.jadeite as unknown as {
      vault: { unlock(v: unknown): Promise<unknown>; create(v: unknown): Promise<unknown> }
    }
    return {
      nullPassword: await api.vault.unlock(null),
      numberPassword: await api.vault.unlock(12345),
      objectPassword: await api.vault.create({ evil: true })
    }
  })

  expect(results.nullPassword).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })
  expect(results.numberPassword).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })
  expect(results.objectPassword).toEqual({ ok: false, error: 'WEAK_PASSWORD' })

  // Still alive and still responsive.
  expect(await session.page.evaluate(() => window.jadeite.vault.status())).toEqual({
    exists: false,
    locked: true
  })
})

test('the renderer cannot reach the network', async () => {
  const outcome = await session.page.evaluate(async () => {
    try {
      await fetch('https://example.com/', { mode: 'no-cors' })
      return 'allowed'
    } catch (e) {
      return `blocked: ${(e as Error).name}`
    }
  })
  expect(outcome).toMatch(/^blocked/)
})

test('a strict content security policy is in force', async () => {
  const policy = await session.page.evaluate(
    () =>
      document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content') ?? ''
  )

  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain("connect-src 'none'")
  expect(policy).toContain("object-src 'none'")
  expect(policy).toContain("frame-ancestors 'none'")
  expect(policy).not.toContain('unsafe-eval')
})

test('inline script injection is refused by the policy', async () => {
  const executed = await session.page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>)['__jadeiteInjected'] = false
    const script = document.createElement('script')
    script.textContent = 'window.__jadeiteInjected = true'
    document.head.appendChild(script)
    return (window as unknown as Record<string, unknown>)['__jadeiteInjected']
  })
  expect(executed).toBe(false)
})
