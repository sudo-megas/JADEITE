/**
 * The rule: nothing derived from the vault survives a lock.
 *
 * The main process is careful about this — locking zeroises the data-encryption
 * key and closes the database (main/vault/vault.ts). The renderer has to be
 * equally careful, and it is easy not to be: a Zustand store is module state,
 * so it outlives the component that reads it. A section unmounts when the lock
 * screen appears and its store quietly keeps a plaintext copy of the owner's
 * money until the process exits.
 *
 * So the invariant is named once, here, rather than re-established by each
 * section remembering to do it. A store holding anything read out of the vault
 * registers its own reset; App calls `forgetVaultData()` the moment the vault
 * reports itself locked, whether that was the idle timer, Ctrl+L, or a password
 * reset.
 *
 * Realisations IV to VI add one `registerVaultScoped` call each and inherit the
 * behaviour. Appearance and language are deliberately *not* registered: they
 * live in config.json, outside the vault, and the lock screen needs them (§4.1).
 */

type Reset = () => void

const resets = new Set<Reset>()

/**
 * Declare that this store holds vault data, and how to empty it.
 *
 * Called at module scope, so registration happens on import and cannot be
 * missed by a component that never mounted.
 */
export function registerVaultScoped(reset: Reset): void {
  resets.add(reset)
}

/** Empty every vault-backed store. Safe to call when nothing is loaded. */
export function forgetVaultData(): void {
  for (const reset of resets) reset()
}
