import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  DEK_LENGTH,
  additionalData,
  generateDek,
  secretEquals,
  unwrapDek,
  wrapDek,
  zeroise
} from '../../src/main/vault/dek.js'
import { BASELINE_KDF, type KdfParams } from '../../src/main/vault/kdf.js'

const FORMAT = 1
const aadFor = (kdf: KdfParams = BASELINE_KDF, slot: 'password' | 'recovery' = 'password') =>
  additionalData(FORMAT, kdf, slot)

describe('the data-encryption key', () => {
  it('is 256 bits and never repeats', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const dek = generateDek()
      expect(dek).toHaveLength(DEK_LENGTH)
      seen.add(dek.toString('hex'))
    }
    expect(seen.size).toBe(100)
  })
})

describe('wrapping', () => {
  it('round-trips under the same key', () => {
    const dek = generateDek()
    const kek = randomBytes(32)
    const salt = randomBytes(16)
    const wrapped = wrapDek(dek, kek, salt, aadFor())
    const out = unwrapDek(wrapped, kek, aadFor())
    expect(out).not.toBeNull()
    expect(secretEquals(out!, dek)).toBe(true)
  })

  it('produces a different ciphertext every time, from a fresh nonce', () => {
    const dek = generateDek()
    const kek = randomBytes(32)
    const salt = randomBytes(16)
    const a = wrapDek(dek, kek, salt, aadFor())
    const b = wrapDek(dek, kek, salt, aadFor())
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.iv).not.toBe(b.iv)
  })

  it('refuses the wrong key', () => {
    const wrapped = wrapDek(generateDek(), randomBytes(32), randomBytes(16), aadFor())
    expect(unwrapDek(wrapped, randomBytes(32), aadFor())).toBeNull()
  })
})

describe('tampering with the cleartext envelope', () => {
  const dek = generateDek()
  const kek = randomBytes(32)
  const salt = randomBytes(16)

  it('fails when the KDF cost is edited down', () => {
    // The attack this defends against: the envelope is cleartext on disk, so
    // an attacker rewrites 256 MiB down to something they can brute-force.
    const wrapped = wrapDek(dek, kek, salt, aadFor(BASELINE_KDF))
    const weakened: KdfParams = { ...BASELINE_KDF, memoryCost: 8192, timeCost: 1 }
    expect(unwrapDek(wrapped, kek, aadFor(weakened))).toBeNull()
  })

  it('fails when a slot is moved to the other slot', () => {
    const wrapped = wrapDek(dek, kek, salt, aadFor(BASELINE_KDF, 'password'))
    expect(unwrapDek(wrapped, kek, aadFor(BASELINE_KDF, 'recovery'))).toBeNull()
  })

  it('fails when the ciphertext is altered', () => {
    const wrapped = wrapDek(dek, kek, salt, aadFor())
    const bytes = Buffer.from(wrapped.ciphertext, 'base64')
    bytes[0] = bytes[0]! ^ 0xff
    expect(
      unwrapDek({ ...wrapped, ciphertext: bytes.toString('base64') }, kek, aadFor())
    ).toBeNull()
  })

  it('fails when the tag is altered', () => {
    const wrapped = wrapDek(dek, kek, salt, aadFor())
    const tag = Buffer.from(wrapped.tag, 'base64')
    tag[0] = tag[0]! ^ 0xff
    expect(unwrapDek({ ...wrapped, tag: tag.toString('base64') }, kek, aadFor())).toBeNull()
  })

  it('fails on a truncated nonce rather than throwing', () => {
    const wrapped = wrapDek(dek, kek, salt, aadFor())
    expect(unwrapDek({ ...wrapped, iv: 'AAAA' }, kek, aadFor())).toBeNull()
  })

  it('returns null rather than throwing on outright garbage', () => {
    expect(
      unwrapDek({ salt: '!', iv: '!', ciphertext: '!', tag: '!' }, randomBytes(32), aadFor())
    ).toBeNull()
  })
})

describe('zeroise', () => {
  it('wipes key material in place', () => {
    const buf = randomBytes(32)
    zeroise(buf)
    expect(buf.every((b) => b === 0)).toBe(true)
  })

  it('tolerates null and undefined', () => {
    expect(() => zeroise(null, undefined)).not.toThrow()
  })
})
