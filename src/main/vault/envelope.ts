/**
 * `jadeite.keys` — the cleartext key envelope, XJADEITE §4.1.
 *
 * Format version, Argon2id parameters, two salts, and two wrapped copies of
 * the DEK. Nothing here is usable without a credential; it is data-store
 * plumbing, not user configuration, and it is the one file besides the
 * database that the app manages.
 */

import { readFileSync } from 'node:fs'
import { writeFileAtomic } from './atomic.js'
import { BASELINE_KDF, isBaselineKdf, type KdfParams } from './kdf.js'
import type { WrappedKey } from './dek.js'
import { envelopePath } from './paths.js'

export const ENVELOPE_FORMAT = 1

export interface RecoverySlot extends WrappedKey {
  /** 1 for the first key ever issued; incremented on every password reset. */
  generation: number
}

export interface KeyEnvelope {
  format: number
  kdf: KdfParams
  password: WrappedKey
  recovery: RecoverySlot
  createdAt: string
  updatedAt: string
}

function isWrappedKey(v: unknown): v is WrappedKey {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o['salt'] === 'string' &&
    typeof o['iv'] === 'string' &&
    typeof o['ciphertext'] === 'string' &&
    typeof o['tag'] === 'string'
  )
}

function isRecoverySlot(v: unknown): v is RecoverySlot {
  if (typeof v !== 'object' || v === null) return false
  // Read `generation` before narrowing to WrappedKey, which has no index
  // signature to read it through afterwards.
  const generation = (v as Record<string, unknown>)['generation']
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 1) return false
  return isWrappedKey(v)
}

/**
 * Accept an envelope only if its KDF parameters are exactly the baseline.
 *
 * This is the one place that decides whether an envelope — read from the
 * local `jadeite.keys` or staged from an untrusted `.jbk` during restore — is
 * one this application will open. Every envelope this build has ever written
 * carries `BASELINE_KDF`, so anything else is either a downgrade attack riding
 * in through a backup (H1 in the freeze audit: a non-baseline-but-in-bounds
 * envelope installed by restore, then silently re-persisted by the next
 * password reset, permanently bricks the vault) or an attacker handing the
 * unlock ceremony an expensive-to-derive cost as a denial-of-service. Both are
 * closed by refusing here, before any Argon2id derivation is ever attempted
 * against parameters this build did not choose.
 */
export function isKeyEnvelope(v: unknown): v is KeyEnvelope {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (o['format'] !== ENVELOPE_FORMAT) return false
  if (!isBaselineKdf(o['kdf'])) return false
  if (!isWrappedKey(o['password'])) return false
  if (!isRecoverySlot(o['recovery'])) return false
  return typeof o['createdAt'] === 'string' && typeof o['updatedAt'] === 'string'
}

export function newEnvelope(
  password: WrappedKey,
  recovery: WrappedKey,
  kdf: KdfParams = BASELINE_KDF
): KeyEnvelope {
  const now = new Date().toISOString()
  return {
    format: ENVELOPE_FORMAT,
    kdf: { ...kdf },
    password,
    recovery: { ...recovery, generation: 1 },
    createdAt: now,
    updatedAt: now
  }
}

export function readEnvelope(path = envelopePath()): KeyEnvelope | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
  return isKeyEnvelope(parsed) ? parsed : null
}

/**
 * Replace the envelope atomically.
 *
 * A password reset rewrites both slots. If that write were interrupted
 * half-done the vault would become unopenable with either credential, so the
 * new content is written to a sibling, flushed, and then renamed over the
 * original — the four-step sequence now lives in `atomic.ts`, because a
 * database and a restore journal need exactly the same guarantee.
 */
export function writeEnvelope(envelope: KeyEnvelope, path = envelopePath()): void {
  writeFileAtomic(path, `${JSON.stringify(envelope, null, 2)}\n`)
}
