/**
 * The chokepoint — every outbound connection in this application passes here.
 *
 * §3.3 says egress is blocked at the session level, and for the history request
 * that is literally true: it is issued through Electron's `net`, which rides
 * Chromium's stack and is therefore seen — and cancellable — by
 * `webRequest.onBeforeRequest`. **Measured, not assumed:** a probe at the start
 * of this Realisation issued a `net.request` against a local server with the
 * filter installed, saw the filter fire, and saw `cancel: true` produce
 * `net::ERR_BLOCKED_BY_CLIENT`.
 *
 * The same probe established the reason this module exists. Node's global
 * `fetch` was **not** seen by the filter at all, and cancelling did not stop it
 * reaching the server. The price socket uses Node's global `WebSocket`, which is
 * the same stack. So for the socket there is no session to enforce anything, and
 * the honest description — the one `docs/realisation-vii.md` carries rather than
 * a claim that the session covers everything — is: renderer traffic and
 * Chromium-stack main traffic are governed by the session, and Node-stack main
 * traffic is governed here.
 *
 * **This module imports nothing from electron.** `SECURITY_FLAGS` lives in a
 * file whose module scope reads `app.isPackaged`, so importing it would make
 * this untestable under vitest, which runs in plain Node. The dev flag is
 * therefore a parameter and the two transport modules pass it in.
 */

import { isPermittedProviderUrl } from './hosts.js'

/**
 * A refusal by the chokepoint.
 *
 * This is an assertion failure, not a user-facing state. The only two call sites
 * pass module constants that are members of `PROVIDER_HOSTS` by construction,
 * and `scripts/audit-egress.mjs` fails the build if a third URL literal appears
 * in a transport module — so reaching this in a shipped build means the build
 * gate was subverted, not that the owner's network misbehaved. It deliberately
 * has no locale string: there is no sentence to show someone, because there is
 * nothing they could do about it.
 */
export class EgressRefused extends Error {
  override readonly name = 'EgressRefused'
  constructor(readonly attempted: string) {
    super('egress refused: the URL is not an allowlisted provider host')
  }
}

/**
 * Refuse anything the allowlist does not name, and hand back the parsed URL.
 *
 * Returning the `URL` rather than a boolean is the point: a caller that wants to
 * connect has to come through here to get a usable object, so "check then use"
 * cannot drift into "use". The alternative — a `canFetch()` predicate the caller
 * is trusted to consult — puts the rule and its enforcement in different places,
 * which is the arrangement this whole module exists to refuse.
 */
export function assertPermittedEgress(rawUrl: string, options: { warn?: boolean } = {}): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    if (options.warn === true) console.warn('[egress] refused (unparseable)', rawUrl)
    throw new EgressRefused(rawUrl)
  }

  if (!isPermittedProviderUrl(url)) {
    if (options.warn === true) console.warn('[egress] refused', rawUrl)
    throw new EgressRefused(rawUrl)
  }

  return url
}
