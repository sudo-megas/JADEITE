/**
 * The data-encryption key and its wrapping — XJADEITE §4.2.
 *
 * A random 256-bit DEK seals the database and never changes for the life of
 * the vault. It is stored only in wrapped form, twice: once under the master
 * password, once under the current recovery key. Changing a credential
 * re-wraps; it never re-encrypts the database.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import type { KdfParams } from './kdf.js'

export const DEK_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16

export type SlotName = 'password' | 'recovery'

export interface WrappedKey {
  salt: string
  iv: string
  ciphertext: string
  tag: string
}

export function generateDek(): Buffer {
  return randomBytes(DEK_LENGTH)
}

/**
 * Bind the envelope's public parameters into the ciphertext.
 *
 * The KDF parameters live in cleartext on disk. Feeding them to AES-GCM as
 * additional authenticated data means an attacker who edits them down to
 * something cheap gets an authentication failure, not a faster crack.
 *
 * Built by hand rather than via JSON.stringify so the byte sequence can never
 * shift with a serialiser change.
 */
export function additionalData(format: number, kdf: KdfParams, slot: SlotName): Buffer {
  return Buffer.from(
    `jadeite:envelope:v${format}|${kdf.algorithm}|m=${kdf.memoryCost}|t=${kdf.timeCost}|p=${kdf.parallelism}|slot=${slot}`,
    'utf8'
  )
}

export function wrapDek(
  dek: Buffer,
  kek: Buffer,
  salt: Buffer,
  aad: Buffer
): WrappedKey {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', kek, iv)
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  }
}

/**
 * Unwrap, or return null.
 *
 * A wrong credential and a tampered envelope both surface as null — one
 * failure mode, no oracle telling an attacker which of the two happened.
 */
export function unwrapDek(wrapped: WrappedKey, kek: Buffer, aad: Buffer): Buffer | null {
  try {
    const iv = Buffer.from(wrapped.iv, 'base64')
    const tag = Buffer.from(wrapped.tag, 'base64')
    const ciphertext = Buffer.from(wrapped.ciphertext, 'base64')
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return null

    const decipher = createDecipheriv('aes-256-gcm', kek, iv)
    decipher.setAAD(aad)
    decipher.setAuthTag(tag)
    const dek = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return dek.length === DEK_LENGTH ? dek : null
  } catch {
    return null
  }
}

/**
 * Overwrite key material in place.
 *
 * Buffers can be wiped; JavaScript strings cannot, which is why credentials
 * are converted to keys as early as possible and the DEK itself never becomes
 * a string except as the hex handed to SQLCipher at open time.
 */
export function zeroise(...buffers: (Buffer | null | undefined)[]): void {
  for (const b of buffers) {
    if (b && b.length > 0) b.fill(0)
  }
}

/** Constant-time comparison, for the rare places a secret is compared at all. */
export function secretEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
