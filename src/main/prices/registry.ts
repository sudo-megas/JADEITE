/**
 * Which provider is in force, and the check that it cannot reach anywhere new.
 *
 * §14 requires the provider to be swappable "without touching anything else".
 * That is a claim about coupling, and the way to keep it honest is to have more
 * than one implementation from the first day — so the mocks below are shipped
 * code, not test scaffolding. They are what lets five of this rung's seven
 * acceptance checks be proved without a single network call, and when the
 * unofficial source changes shape (§14 says it will), they are what the
 * replacement is written against.
 */

import { app } from 'electron'

import { providerHostnames } from './hosts.js'
import type { PriceProvider } from './provider.js'

export const PROVIDER_IDS = Object.freeze([
  'haremaltin',
  'mock',
  'mock-b',
  'offline-mock'
] as const)
export type ProviderId = (typeof PROVIDER_IDS)[number]

function isProviderId(value: string | undefined): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)
}

/**
 * The provider this run will use.
 *
 * **A packaged build is always the real one** and consults nothing outside
 * itself, which is what keeps this clear of §16.6: there is no configuration
 * file, and no shipped installation can be pointed elsewhere.
 *
 * Unpackaged, the default is the **mock** — inverted from the obvious choice, on
 * purpose. `npm run test:e2e` builds unpackaged and drives the real application,
 * so defaulting to haremaltin would mean one forgetful end-to-end test quietly
 * opening a socket to a third party. Making the real source opt-in turns that
 * from a silent accident into a deliberate line in a test file, and lets the
 * rung honestly claim that no test in any layer touches the network.
 *
 * The rejected alternative was a vault setting. It would be a user-facing choice
 * about something the owner cannot meaningfully decide — there is exactly one
 * real source — and it would let a packaged application be aimed at a mock.
 */
export function selectedProviderId(): ProviderId {
  if (app.isPackaged) return 'haremaltin'
  const named = process.env['JADEITE_PRICE_PROVIDER']
  return isProviderId(named) ? named : 'mock'
}

/**
 * Load a provider, and refuse one that names a host the allowlist does not.
 *
 * `PriceProvider.hosts` would otherwise be decoration. Checking it here means a
 * provider that would have been refused at the chokepoint mid-fetch — after the
 * interface had already told the owner it was refreshing — fails at load
 * instead, where the failure is legible.
 *
 * The import is dynamic so that nothing pulls a transport into the main bundle's
 * start-up path: §3.4's cold-start budget is measured from launch to the lock
 * screen, and a module that only matters after the vault is open has no business
 * being parsed before it.
 */
export async function loadProvider(id: ProviderId): Promise<PriceProvider> {
  const provider = await importProvider(id)
  const allowed = providerHostnames()
  const stray = provider.hosts.filter((host) => !allowed.includes(host))
  if (stray.length > 0) {
    throw new Error(
      `provider ${provider.id} names host(s) outside the allowlist: ${stray.join(', ')}`
    )
  }
  return provider
}

async function importProvider(id: ProviderId): Promise<PriceProvider> {
  switch (id) {
    case 'haremaltin':
      return (await import('./haremaltin/index.js')).haremaltin
    case 'mock':
      return (await import('./mock/index.js')).mock
    case 'mock-b':
      return (await import('./mock/index.js')).mockB
    case 'offline-mock':
      return (await import('./mock/index.js')).offlineMock
  }
}
