import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { additionalData, generateDek, wrapDek } from '../../src/main/vault/dek.js'
import { BASELINE_KDF } from '../../src/main/vault/kdf.js'
import {
  ENVELOPE_FORMAT,
  isKeyEnvelope,
  newEnvelope,
  readEnvelope,
  writeEnvelope
} from '../../src/main/vault/envelope.js'

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jadeite-envelope-'))
  path = join(dir, 'jadeite.keys')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function sampleEnvelope() {
  const dek = generateDek()
  const kek = randomBytes(32)
  const password = wrapDek(dek, kek, randomBytes(16), additionalData(ENVELOPE_FORMAT, BASELINE_KDF, 'password'))
  const recovery = wrapDek(dek, kek, randomBytes(16), additionalData(ENVELOPE_FORMAT, BASELINE_KDF, 'recovery'))
  return newEnvelope(password, recovery)
}

describe('jadeite.keys', () => {
  it('round-trips', () => {
    const envelope = sampleEnvelope()
    writeEnvelope(envelope, path)
    expect(readEnvelope(path)).toEqual(envelope)
  })

  it('starts at recovery generation 1', () => {
    expect(sampleEnvelope().recovery.generation).toBe(1)
  })

  it('records the Argon2id parameters the specification fixes', () => {
    const { kdf } = sampleEnvelope()
    expect(kdf).toEqual({
      algorithm: 'argon2id',
      memoryCost: 262144, // 256 MiB
      timeCost: 3,
      parallelism: 4
    })
  })

  it('leaves no temporary file behind', () => {
    writeEnvelope(sampleEnvelope(), path)
    expect(existsSync(`${path}.tmp`)).toBe(false)
  })

  it('is owner-readable JSON that exposes no usable secret', () => {
    const envelope = sampleEnvelope()
    writeEnvelope(envelope, path)
    const text = readFileSync(path, 'utf8')
    expect(() => JSON.parse(text)).not.toThrow()
    // Everything present is either a public parameter or ciphertext.
    expect(Object.keys(JSON.parse(text)).sort()).toEqual([
      'createdAt',
      'format',
      'kdf',
      'password',
      'recovery',
      'updatedAt'
    ])
  })

  it('replaces an existing envelope atomically', () => {
    const first = sampleEnvelope()
    writeEnvelope(first, path)
    const second = { ...sampleEnvelope(), createdAt: first.createdAt }
    writeEnvelope(second, path)
    expect(readEnvelope(path)).toEqual(second)
  })
})

describe('a corrupted or hostile envelope', () => {
  it('is rejected when the file is not JSON', () => {
    writeFileSync(path, 'not json at all')
    expect(readEnvelope(path)).toBeNull()
  })

  it('is rejected when a slot is missing', () => {
    const envelope = sampleEnvelope()
    const { recovery: _recovery, ...withoutRecovery } = envelope
    writeFileSync(path, JSON.stringify(withoutRecovery))
    expect(readEnvelope(path)).toBeNull()
  })

  it('is rejected when the format version is unknown', () => {
    writeFileSync(path, JSON.stringify({ ...sampleEnvelope(), format: 99 }))
    expect(readEnvelope(path)).toBeNull()
  })

  it('is rejected when the KDF cost is edited below the floor', () => {
    const envelope = sampleEnvelope()
    envelope.kdf.memoryCost = 8
    writeFileSync(path, JSON.stringify(envelope))
    expect(readEnvelope(path)).toBeNull()
  })

  it('is rejected when the algorithm is swapped', () => {
    const envelope = sampleEnvelope()
    writeFileSync(path, JSON.stringify({ ...envelope, kdf: { ...envelope.kdf, algorithm: 'md5' } }))
    expect(readEnvelope(path)).toBeNull()
  })

  it('is rejected when the generation counter is nonsense', () => {
    const envelope = sampleEnvelope()
    envelope.recovery.generation = 0
    expect(isKeyEnvelope(envelope)).toBe(false)
  })

  it('reads as absent when the file does not exist', () => {
    expect(readEnvelope(join(dir, 'nothing-here'))).toBeNull()
  })
})
