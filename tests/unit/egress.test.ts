/**
 * The allowlist, and the chokepoint that reads it.
 *
 * §14 makes the price provider the only network egress in the application, so
 * this table is the whole of what JADEITE is permitted to connect to. Each
 * refusal below is a real way an allowlist gets past — a scheme downgrade, a
 * named port, embedded credentials, and the three shapes of hostname confusion
 * that a naive `endsWith` admits.
 *
 * These modules import nothing from electron precisely so that this file can
 * exist: vitest runs under plain Node, and a rule about where the owner's
 * machine may connect should be testable without booting a browser.
 */

import { describe, expect, it } from 'vitest'

import {
  PROVIDER_HOSTS,
  isPermittedProviderHref,
  isPermittedProviderUrl,
  providerHostnames
} from '../../src/main/prices/hosts.js'
import { EgressRefused, assertPermittedEgress } from '../../src/main/prices/egress.js'

const HISTORY = 'https://www.haremaltin.com/ajax/cur/history'
const SOCKET = 'wss://hrmsocketonly.haremaltin.com/socket.io/?EIO=4&transport=websocket'

/** Twelve URLs: the two that work, and ten ways of nearly being them. */
const TABLE: readonly { url: string; permitted: boolean; why: string }[] = [
  { url: HISTORY, permitted: true, why: 'the history endpoint, §14.1' },
  { url: SOCKET, permitted: true, why: 'the price socket, §14.1' },

  { url: 'http://www.haremaltin.com/ajax/cur/history', permitted: false, why: 'scheme downgraded to http' },
  { url: 'https://hrmsocketonly.haremaltin.com/', permitted: false, why: 'socket host over https' },
  { url: 'wss://www.haremaltin.com/', permitted: false, why: 'history host over wss' },
  { url: 'https://www.haremaltin.com:8443/', permitted: false, why: 'a named port' },
  { url: 'https://user:secret@www.haremaltin.com/', permitted: false, why: 'embedded credentials' },
  { url: 'https://haremaltin.com/', permitted: false, why: 'the apex, which is not the named host' },
  { url: 'https://evil.www.haremaltin.com/', permitted: false, why: 'a prefixed subdomain' },
  {
    url: 'https://www.haremaltin.com.attacker.example/',
    permitted: false,
    why: 'the suffix attack an endsWith test would admit'
  },
  { url: 'https://example.com/', permitted: false, why: 'an unrelated host' },
  { url: 'file:///etc/passwd', permitted: false, why: 'not a network scheme at all' }
]

describe('the provider allowlist (§14)', () => {
  for (const { url, permitted, why } of TABLE) {
    it(`${permitted ? 'permits' : 'refuses'} ${url} — ${why}`, () => {
      expect(isPermittedProviderHref(url)).toBe(permitted)
    })
  }

  it('refuses a string that is not a URL at all', () => {
    expect(isPermittedProviderHref('haremaltin.com')).toBe(false)
    expect(isPermittedProviderHref('')).toBe(false)
    expect(isPermittedProviderHref('   ')).toBe(false)
  })

  it('names exactly two hosts, and they are frozen', () => {
    expect(PROVIDER_HOSTS).toHaveLength(2)
    expect(providerHostnames()).toEqual(['www.haremaltin.com', 'hrmsocketonly.haremaltin.com'])
    expect(Object.isFrozen(PROVIDER_HOSTS)).toBe(true)
  })

  it('asks the same question of a URL object as of its href', () => {
    for (const { url, permitted } of TABLE) {
      // `file:` and the credentialled form both parse, so both reach here.
      expect(isPermittedProviderUrl(new URL(url))).toBe(permitted)
    }
  })
})

describe('the chokepoint', () => {
  it('returns the parsed URL for a permitted target, so a caller cannot skip it', () => {
    const url = assertPermittedEgress(HISTORY)
    expect(url.hostname).toBe('www.haremaltin.com')
    expect(url.pathname).toBe('/ajax/cur/history')
  })

  it('throws EgressRefused for every refused row of the table', () => {
    for (const { url, permitted } of TABLE) {
      if (permitted) continue
      expect(() => assertPermittedEgress(url)).toThrow(EgressRefused)
    }
  })

  it('throws rather than returning for an unparseable target', () => {
    expect(() => assertPermittedEgress('not a url')).toThrow(EgressRefused)
  })

  it('carries what was attempted, so a dev-mode warning can name it', () => {
    try {
      assertPermittedEgress('https://example.com/')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error instanceof EgressRefused).toBe(true)
      expect((error as EgressRefused).attempted).toBe('https://example.com/')
    }
  })
})
