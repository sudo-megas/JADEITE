/**
 * The haremaltin provider — XJADEITE §14.
 *
 * Assembly only. The two transports hold the connections, `parse.ts` decides
 * what an answer means, `mapping.ts` holds §14.3's table, and this file puts a
 * `PriceProvider` face on them so that everything above can be written as though
 * the source were an ordinary function.
 *
 * `hosts` is what the registry checks against the allowlist before loading this
 * module. Naming them here rather than importing `PROVIDER_HOSTS` is deliberate:
 * a provider **declares** what it intends to contact and the registry
 * **verifies** it, so a provider written later cannot quietly widen the
 * allowlist by importing it.
 */

import type {
  Close,
  HistoryRequest,
  PriceProvider,
  PriceResult,
  Snapshot
} from '../provider.js'
import { fetchHistory } from './history.js'
import { fetchSnapshot } from './socket.js'

export const haremaltin: PriceProvider = {
  id: 'haremaltin',
  hosts: ['www.haremaltin.com', 'hrmsocketonly.haremaltin.com'],

  snapshot(signal: AbortSignal): Promise<PriceResult<Snapshot>> {
    return fetchSnapshot('haremaltin', signal)
  },

  history(request: HistoryRequest, signal: AbortSignal): Promise<PriceResult<readonly Close[]>> {
    return fetchHistory(request, signal)
  }
}
