/**
 * Key derivation — XJADEITE §4.2.
 *
 * Argon2id turns a credential into a 32-byte key-encryption key. The cost is
 * deliberate: it is password-entry time, and §3.4 excludes it from the
 * cold-start budget for exactly that reason.
 */

import argon2 from 'argon2'

export interface KdfParams {
  algorithm: 'argon2id'
  /** Kibibytes. 262144 KiB = 256 MiB. */
  memoryCost: number
  timeCost: number
  parallelism: number
}

/** Baseline parameters, recorded in the envelope and fixed at vault creation. */
export const BASELINE_KDF: Readonly<KdfParams> = Object.freeze({
  algorithm: 'argon2id',
  memoryCost: 262144,
  timeCost: 3,
  parallelism: 4
})

export const KEK_LENGTH = 32
export const SALT_LENGTH = 16

/**
 * Reject parameters that would silently weaken the vault.
 *
 * The envelope is cleartext on disk, so an attacker can edit it. The
 * parameters are additionally bound into the AES-GCM additional authenticated
 * data (see `dek.ts`), which makes tampering fail the tag rather than succeed
 * with a cheap KDF — this check is the second line, not the first.
 */
export function validateKdfParams(p: unknown): p is KdfParams {
  if (typeof p !== 'object' || p === null) return false
  const q = p as Record<string, unknown>
  return (
    q['algorithm'] === 'argon2id' &&
    typeof q['memoryCost'] === 'number' &&
    Number.isInteger(q['memoryCost']) &&
    q['memoryCost'] >= 65536 &&
    q['memoryCost'] <= 4194304 &&
    typeof q['timeCost'] === 'number' &&
    Number.isInteger(q['timeCost']) &&
    q['timeCost'] >= 2 &&
    q['timeCost'] <= 32 &&
    typeof q['parallelism'] === 'number' &&
    Number.isInteger(q['parallelism']) &&
    q['parallelism'] >= 1 &&
    q['parallelism'] <= 16
  )
}

export async function deriveKek(
  credential: string,
  salt: Buffer,
  params: KdfParams
): Promise<Buffer> {
  if (salt.length < 8) throw new Error('salt too short')
  const kek = await argon2.hash(credential, {
    type: argon2.argon2id,
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
    hashLength: KEK_LENGTH,
    salt,
    raw: true
  })
  return Buffer.from(kek)
}
