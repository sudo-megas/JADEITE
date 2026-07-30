/**
 * The allowlist — XJADEITE §14, and the only widening §3.3 has ever permitted.
 *
 * Two hosts, because the source keeps its socket on a different machine from its
 * history endpoint (§14.1). They are written here, once, and read by everything
 * that needs them: the session's request filter, the chokepoint in `egress.ts`,
 * and the provider registry's check that a swapped-in provider cannot reach
 * anywhere this file does not name.
 *
 * **This module imports nothing.** Not electron, not node. That is deliberate:
 * `session.ts` runs only inside Electron's main process and `tests/unit` runs
 * under plain Node, and both have to be able to ask the same question of the
 * same code. A rule about where the owner's machine may connect is not allowed
 * to exist in two copies that can disagree.
 */

/** A host this application may contact, and the exact terms on which it may. */
interface ProviderHost {
  hostname: string
  /** The one scheme this host is reachable on. There is no http fallback. */
  protocol: 'https:' | 'wss:'
}

/**
 * Every host JADEITE is permitted to open a connection to, in its entirety.
 *
 * `www.haremaltin.com` serves `ajax/cur/history`; `hrmsocketonly.haremaltin.com`
 * serves the price socket. Nothing else in the application makes an outbound
 * request, and `scripts/audit-egress.mjs` fails the build if a URL literal
 * appears outside the two transport modules.
 */
export const PROVIDER_HOSTS: readonly ProviderHost[] = Object.freeze([
  Object.freeze({ hostname: 'www.haremaltin.com', protocol: 'https:' as const }),
  Object.freeze({ hostname: 'hrmsocketonly.haremaltin.com', protocol: 'wss:' as const })
])

/**
 * May this URL be contacted?
 *
 * One predicate, one body, four questions — because the first draft of this
 * design had the session checking hostname and protocol while the chokepoint
 * also checked port and credentials, which meant `https://www.haremaltin.com:8443/`
 * passed one gate and failed the other. An allowlist with two readings is not an
 * allowlist.
 *
 * - **Credentials.** A URL carrying `user:pass@` is refused outright. It is
 *   never something this application would construct, so its presence means the
 *   URL came from somewhere it should not have.
 * - **Port.** Empty only. A named port is refused even when it is 443, because
 *   `new URL()` normalises the default away and anything left is a redirection
 *   to somewhere else on the same name.
 * - **Hostname.** Exact, case-folded by `URL` already. No suffix matching: a
 *   test for `.endsWith('haremaltin.com')` would admit
 *   `haremaltin.com.attacker.example`, which is the classic form of this bug.
 * - **Protocol.** Bound to the host rather than checked globally, so the socket
 *   host cannot be reached over https nor the history host over wss.
 */
export function isPermittedProviderUrl(url: URL): boolean {
  if (url.username !== '' || url.password !== '') return false
  if (url.port !== '') return false

  return PROVIDER_HOSTS.some(
    (host) => host.hostname === url.hostname && host.protocol === url.protocol
  )
}

/** The same question, for callers holding a string they do not trust. */
export function isPermittedProviderHref(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  return isPermittedProviderUrl(url)
}

/** Every hostname above, for the registry's check on a provider's declared hosts. */
export function providerHostnames(): readonly string[] {
  return PROVIDER_HOSTS.map((host) => host.hostname)
}
