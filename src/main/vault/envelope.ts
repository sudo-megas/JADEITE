/**
 * `jadeite.keys` — the cleartext key envelope, XJADEITE §4.1.
 *
 * Format version, Argon2id parameters, two salts, and two wrapped copies of
 * the DEK. Nothing here is usable without a credential; it is data-store
 * plumbing, not user configuration, and it is the one file besides the
 * database that the app manages.
 */

import { closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { BASELINE_KDF, validateKdfParams, type KdfParams } from './kdf.js'
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

export function isKeyEnvelope(v: unknown): v is KeyEnvelope {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (o['format'] !== ENVELOPE_FORMAT) return false
  if (!validateKdfParams(o['kdf'])) return false
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
 * original — on POSIX the rename is atomic, and the directory is flushed too
 * so the rename itself survives a power cut.
 */
export function writeEnvelope(envelope: KeyEnvelope, path = envelopePath()): void {
  const tmp = `${path}.tmp`
  const payload = `${JSON.stringify(envelope, null, 2)}\n`

  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, payload, 0, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }

  try {
    renameSync(tmp, path)
  } catch (e) {
    try {
      unlinkSync(tmp)
    } catch {
      /* the temp file is already gone or unreachable; the original stands */
    }
    throw e
  }

  const dirFd = openSync(dirname(path), 'r')
  try {
    fsyncSync(dirFd)
  } finally {
    closeSync(dirFd)
  }
}
