/**
 * The `.jbk` container, read as though a stranger had written it.
 *
 * `container.ts` parses the only untrusted input JADEITE has (REALISATION.md,
 * Realisation IX): every other file the application opens it wrote itself, and
 * the one other door — the price provider — carries numbers rather than
 * structure. So the question asked here is not "does a backup round-trip",
 * which is four tests below, but "is there a sequence of bytes that gets past
 * the parser, or that makes it throw past its caller".
 *
 * This belongs in-process under Vitest rather than in
 * `tests/electron/backup-suite.ts` because container parsing is pure byte
 * handling: no SQLCipher, no key derivation, no Electron. That is exactly what
 * makes the sweeps below affordable — 768 single-bit flips through the
 * preamble, 128 more through the body, 165 truncations — in a fraction of a
 * second each. The other half of the claim cannot be proved here at all: that a
 * *restored* database actually opens needs the real SQLCipher binding, which is
 * built for Electron's ABI and will not load under plain Node. So the suite
 * splits along the line the binding draws. Bytes here; databases there.
 *
 * Two habits run through the file. Every mutation is applied to a container
 * that is asserted to read cleanly first, so each rejection is caused by
 * exactly one introduced fault. And the container layout is re-implemented in
 * `forge()` below rather than imported, so that a test claiming "the header
 * digest catches this" is not merely agreeing with the writer about where the
 * header digest lives.
 */

import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  CONTAINER_FORMAT,
  rejectionToError,
  type BackupErrorCode,
  type ContainerRejection
} from '@shared/backup/types'
import {
  MAX_HEADER_BYTES,
  MAX_PAYLOAD_BYTES,
  PREAMBLE_BYTES,
  isBackupHeader,
  payloadChecksum,
  readContainer,
  writeContainer,
  type BackupHeader
} from '../../src/main/vault/backup/container.js'
import { additionalData, generateDek, wrapDek } from '../../src/main/vault/dek.js'
import { ENVELOPE_FORMAT, newEnvelope, type KeyEnvelope } from '../../src/main/vault/envelope.js'
import { BASELINE_KDF } from '../../src/main/vault/kdf.js'

/**
 * The layout of §15, written out a second time.
 *
 * Deliberately not imported from the module under test. If `container.ts` moved
 * the payload digest, importing its offsets would move this file's expectations
 * with it and every checksum test would keep passing against the wrong bytes.
 */
const MAGIC = Buffer.from('JADEITE-BACKUP\x1a\x00', 'latin1')
const OFF_FORMAT = 16
const OFF_HEADER_LENGTH = 20
const OFF_PAYLOAD_LENGTH = 24
const OFF_HEADER_DIGEST = 32
const OFF_PAYLOAD_DIGEST = 64

/** The schema this notional build can migrate to; the ceiling for `readContainer`. */
const SCHEMA_VERSION = 5

function sha256(bytes: Buffer): Buffer {
  return createHash('sha256').update(bytes).digest()
}

function sampleEnvelope(): KeyEnvelope {
  const dek = generateDek()
  const kek = randomBytes(32)
  const password = wrapDek(
    dek,
    kek,
    randomBytes(16),
    additionalData(ENVELOPE_FORMAT, BASELINE_KDF, 'password')
  )
  const recovery = wrapDek(
    dek,
    kek,
    randomBytes(16),
    additionalData(ENVELOPE_FORMAT, BASELINE_KDF, 'recovery')
  )
  return newEnvelope(password, recovery)
}

/** One envelope for the whole file: the sweeps rebuild headers, not key material. */
const ENVELOPE = sampleEnvelope()

function sampleHeader(overrides: Partial<BackupHeader> = {}): BackupHeader {
  return {
    container: CONTAINER_FORMAT,
    vaultId: randomBytes(16).toString('hex'),
    schemaVersion: SCHEMA_VERSION,
    appVersion: '0.9.0',
    createdAt: '2026-07-31T09:15:00.000Z',
    sections: {
      s1: '2026-07-30T18:02:11.000Z',
      s2: null,
      s3: '2026-07-31T08:59:00.000Z',
      s4: null
    },
    envelope: ENVELOPE,
    ...overrides
  }
}

/** Small enough that a sweep can hash it hundreds of times without noticing. */
function samplePayload(bytes = 4096): Buffer {
  return randomBytes(bytes)
}

function sampleContainer(payload: Buffer = samplePayload(), header = sampleHeader()): Buffer {
  return writeContainer(header, payload)
}

/** A preamble built by hand, so a length can be declared without being backed. */
function forgePreamble(headerLength: number, payloadLength: bigint): Buffer {
  const preamble = Buffer.alloc(PREAMBLE_BYTES)
  MAGIC.copy(preamble, 0)
  preamble.writeUInt32LE(CONTAINER_FORMAT, OFF_FORMAT)
  preamble.writeUInt32LE(headerLength, OFF_HEADER_LENGTH)
  preamble.writeBigUInt64LE(payloadLength, OFF_PAYLOAD_LENGTH)
  return preamble
}

/**
 * Assemble a container from arbitrary header bytes, digests recomputed.
 *
 * The recomputation is the point, and it is a real trap: replace the header
 * JSON in a written container and leave the digest at offset 32 alone, and the
 * reader answers 'header-checksum' before it ever parses. Every "this JSON is
 * not a header" test would then pass while proving nothing about the header
 * validator at all.
 */
function forge(headerBytes: Buffer, payload: Buffer): Buffer {
  const preamble = forgePreamble(headerBytes.length, BigInt(payload.length))
  sha256(headerBytes).copy(preamble, OFF_HEADER_DIGEST)
  sha256(payload).copy(preamble, OFF_PAYLOAD_DIGEST)
  return Buffer.concat([preamble, headerBytes, payload])
}

function forgeHeader(header: unknown, payload: Buffer = samplePayload(64)): Buffer {
  return forge(Buffer.from(JSON.stringify(header), 'utf8'), payload)
}

/** Copy, then damage the copy. Nothing in this file mutates a shared container. */
function patched(container: Buffer, patch: (bytes: Buffer) => void): Buffer {
  const copy = Buffer.from(container)
  patch(copy)
  return copy
}

/**
 * The outcome of a read as one comparable word.
 *
 * Folding "it threw" into the same vocabulary as the eight rejections is what
 * lets a 768-iteration sweep assert *never throws* without 768 try blocks: a
 * throw simply shows up as an outcome no region allows.
 */
type Outcome = ContainerRejection | 'accepted' | 'threw'

/** Every rejection this file has actually provoked; asserted at the very end. */
const REACHED = new Set<ContainerRejection>()

function outcome(bytes: Buffer, maxSchemaVersion = SCHEMA_VERSION): Outcome {
  try {
    const read = readContainer(bytes, maxSchemaVersion)
    if (!read.ok) REACHED.add(read.reason)
    return read.ok ? 'accepted' : read.reason
  } catch {
    return 'threw'
  }
}

/** Unwrap a container that must read cleanly, so the tests below can narrow. */
function accepted(bytes: Buffer, maxSchemaVersion = SCHEMA_VERSION) {
  const read = readContainer(bytes, maxSchemaVersion)
  if (!read.ok) throw new Error(`expected an accepted container, got '${read.reason}'`)
  return read.value
}

function without(header: BackupHeader, key: keyof BackupHeader): unknown {
  const copy: Record<string, unknown> = { ...header }
  delete copy[key]
  return copy
}

describe('a container the application wrote', () => {
  it('round-trips a header and a payload, byte for byte', () => {
    const header = sampleHeader()
    const payload = samplePayload()
    const value = accepted(sampleContainer(payload, header))
    expect(value.header).toEqual(header)
    expect(value.payload.equals(payload)).toBe(true)
  })

  it('round-trips an empty payload', () => {
    const header = sampleHeader()
    const value = accepted(sampleContainer(Buffer.alloc(0), header))
    expect(value.header).toEqual(header)
    expect(value.payload).toHaveLength(0)
  })

  it('round-trips a few hundred kilobytes', () => {
    const payload = samplePayload(300 * 1024)
    const value = accepted(sampleContainer(payload))
    expect(value.payload).toHaveLength(300 * 1024)
    expect(Buffer.compare(value.payload, payload)).toBe(0)
  })

  it("copies the payload out, rather than keeping a view on the caller's buffer", () => {
    const payload = samplePayload(256)
    const container = sampleContainer(payload)
    const value = accepted(container)
    const asRead = Buffer.from(value.payload)
    // A caller that reuses its read buffer must not silently rewrite the
    // database it has just been handed.
    container.fill(0)
    expect(value.payload.equals(asRead)).toBe(true)
  })

  it('lays the preamble out exactly as §15 documents it', () => {
    const header = sampleHeader()
    const payload = samplePayload(1024)
    const container = sampleContainer(payload, header)
    const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')

    expect(PREAMBLE_BYTES).toBe(96)
    expect(container.subarray(0, 16).equals(MAGIC)).toBe(true)
    expect(container.readUInt32LE(OFF_FORMAT)).toBe(CONTAINER_FORMAT)
    expect(container.readUInt32LE(OFF_HEADER_LENGTH)).toBe(headerBytes.length)
    expect(container.readBigUInt64LE(OFF_PAYLOAD_LENGTH)).toBe(BigInt(payload.length))
    expect(container.subarray(OFF_HEADER_DIGEST, OFF_HEADER_DIGEST + 32)).toEqual(
      sha256(headerBytes)
    )
    expect(container.subarray(OFF_PAYLOAD_DIGEST, OFF_PAYLOAD_DIGEST + 32)).toEqual(sha256(payload))
    expect(container).toHaveLength(PREAMBLE_BYTES + headerBytes.length + payload.length)
  })

  it('is read back identically by the layout this test re-implements', () => {
    // If `forge` and `writeContainer` disagree, every forged case below is
    // testing something other than what it claims to.
    const header = sampleHeader()
    const payload = samplePayload(512)
    const forged = forgeHeader(header, payload)
    expect(forged.equals(sampleContainer(payload, header))).toBe(true)
    expect(outcome(forged)).toBe('accepted')
  })

  it('refuses to write a header past the container limit', () => {
    // Padded through the envelope rather than through `appVersion`, which is
    // now bounded at sixty-four characters and would be refused a step earlier
    // as a malformed header. The envelope's base64 fields are checked for being
    // strings and not for length, so they are what can still make a header too
    // large — and this test is about the size cap, not about the field.
    const envelope = sampleEnvelope()
    const huge = sampleHeader({
      envelope: { ...envelope, password: { ...envelope.password, salt: 'A'.repeat(MAX_HEADER_BYTES) } }
    })
    expect(() => writeContainer(huge, samplePayload(16))).toThrow(/exceeds the container limit/)
  })

  it('refuses to write a header it would itself refuse to read', () => {
    // The write-side validation added during the hardening pass. Without it a
    // bad container is discovered at restore time, on the day it is needed,
    // rather than at backup time while the owner is watching.
    expect(() => writeContainer(sampleHeader({ vaultId: 'not-hex' }), samplePayload(16))).toThrow(
      /not well formed/
    )
  })

  it('refuses a header whose rendered fields are unbounded', () => {
    // `appVersion`, `createdAt` and the section stamps are the only fields the
    // restore screen shows the owner. A container carrying sixty-four kilobytes
    // of chosen text in one of them would put it beside the credential prompt —
    // the one surface whose job is §15's explicit confirmation. Valid JSON, a
    // valid envelope, and refused.
    const cases: Record<string, unknown>[] = [
      { appVersion: 'v'.repeat(65) },
      { appVersion: '' },
      { createdAt: 'yesterday, around four' },
      { createdAt: '2026-07-31' },
      { sections: { s1: 'when the owner felt like it', s2: null, s3: null, s4: null } }
    ]

    let tested = 0
    for (const patch of cases) {
      const forged = forgeHeader({ ...sampleHeader(), ...patch }, samplePayload(32))
      expect(outcome(forged), `${JSON.stringify(patch)} was not refused`).toBe('header')
      tested++
    }
    expect(tested).toBe(5)
  })

  it('accepts a schema exactly at the ceiling this build can migrate to', () => {
    const container = sampleContainer(samplePayload(64), sampleHeader({ schemaVersion: 5 }))
    expect(accepted(container, 5).header.schemaVersion).toBe(5)
  })
})

describe('payloadChecksum', () => {
  it('is the hex SHA-256 the backup_log records', () => {
    const payload = samplePayload(1024)
    const hex = payloadChecksum(payload)
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
    expect(hex).toBe(sha256(payload).toString('hex'))
  })

  it('agrees with the digest sealed into the container', () => {
    const payload = samplePayload(2048)
    const container = sampleContainer(payload)
    expect(container.subarray(OFF_PAYLOAD_DIGEST, OFF_PAYLOAD_DIGEST + 32).toString('hex')).toBe(
      payloadChecksum(payload)
    )
  })

  it('has a defined answer for an empty database', () => {
    expect(payloadChecksum(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })
})

describe('every rejection has a name, and each one can be reached', () => {
  it("'magic' — a file that was never a backup", () => {
    const notOurs = Buffer.concat([Buffer.from('SQLite format 3\x00'), samplePayload(512)])
    expect(outcome(notOurs)).toBe('magic')
  })

  it("'truncated' — a backup that stops early", () => {
    const container = sampleContainer()
    expect(outcome(container)).toBe('accepted')
    expect(outcome(container.subarray(0, container.length - 1))).toBe('truncated')
  })

  it("'format' — a container version this build does not know", () => {
    const container = sampleContainer()
    const future = patched(container, (b) => b.writeUInt32LE(CONTAINER_FORMAT + 1, OFF_FORMAT))
    expect(outcome(future)).toBe('format')
  })

  it("'oversize' — a declared header beyond what this build will allocate", () => {
    const preamble = forgePreamble(MAX_HEADER_BYTES + 1, 0n)
    expect(outcome(preamble)).toBe('oversize')
  })

  it("'oversize' — a declared payload beyond what this build will allocate", () => {
    // Header length 0, so the header cap cannot fire first and mask this.
    const preamble = forgePreamble(0, BigInt(MAX_PAYLOAD_BYTES) + 1n)
    expect(outcome(preamble)).toBe('oversize')
  })

  it("'header' — JSON that is not a header", () => {
    const payload = samplePayload(64)
    expect(outcome(forgeHeader(sampleHeader(), payload))).toBe('accepted')
    expect(outcome(forgeHeader({ container: 1, but: 'nothing else' }, payload))).toBe('header')
  })

  it("'header-checksum' — the header's bytes no longer match their digest", () => {
    const container = sampleContainer()
    const edited = patched(container, (b) => {
      b[PREAMBLE_BYTES] = b[PREAMBLE_BYTES]! ^ 0x01
    })
    expect(outcome(edited)).toBe('header-checksum')
  })

  it("'payload-checksum' — the database's bytes no longer match theirs", () => {
    const container = sampleContainer()
    expect(outcome(container)).toBe('accepted')
    const headerLength = container.readUInt32LE(OFF_HEADER_LENGTH)
    const edited = patched(container, (b) => {
      const at = PREAMBLE_BYTES + headerLength
      b[at] = b[at]! ^ 0xff
    })
    expect(outcome(edited)).toBe('payload-checksum')
  })

  it("'schema' — a database newer than this build can migrate", () => {
    // The rig-to-laptop data-loss trap, and the reason this rejection exists at
    // all: `migrate` walks forward only and ignores a version it has never
    // heard of, so a container from a newer JADEITE would open, skip every
    // migration, and hand back a database this build reads wrongly with no
    // error anywhere. Refused here instead, while the owner still has the file.
    const container = sampleContainer(samplePayload(64), sampleHeader({ schemaVersion: 6 }))
    expect(outcome(container, 6)).toBe('accepted')
    expect(outcome(container, 5)).toBe('schema')
  })

})

describe('every bit of the preamble, flipped', () => {
  /**
   * Which refusal each region owes.
   *
   * The two length fields are given a set rather than a single reason because
   * the answer depends on the bit: a low bit of the header length makes the
   * file disagree with itself ('truncated'), while a high one pushes the
   * declared size past the cap ('oversize'). Both are refusals, which is the
   * invariant that matters; the sets are asserted exactly so that a region
   * silently collapsing to one answer is still caught.
   */
  const REGIONS: readonly {
    name: string
    from: number
    to: number
    allowed: readonly ContainerRejection[]
  }[] = [
    { name: 'magic', from: 0, to: 16, allowed: ['magic'] },
    { name: 'container format', from: 16, to: 20, allowed: ['format'] },
    { name: 'header length', from: 20, to: 24, allowed: ['truncated', 'oversize'] },
    { name: 'payload length', from: 24, to: 32, allowed: ['truncated', 'oversize'] },
    { name: 'header digest', from: 32, to: 64, allowed: ['header-checksum'] },
    { name: 'payload digest', from: 64, to: 96, allowed: ['payload-checksum'] }
  ]

  it('describes the whole preamble and nothing beyond it', () => {
    let covered = 0
    let next = 0
    for (const region of REGIONS) {
      expect(region.from).toBe(next)
      covered += region.to - region.from
      next = region.to
    }
    expect(covered).toBe(PREAMBLE_BYTES)
    expect(next).toBe(96)
  })

  it('is refused for all 768 single-bit corruptions, and never throws', () => {
    const container = sampleContainer(samplePayload(1024))
    expect(outcome(container)).toBe('accepted')

    let tested = 0
    const everything = new Set<Outcome>()
    for (const region of REGIONS) {
      const seen = new Set<Outcome>()
      for (let i = region.from; i < region.to; i++) {
        for (let bit = 0; bit < 8; bit++) {
          const got = outcome(patched(container, (b) => (b[i] = b[i]! ^ (1 << bit))))
          expect(
            region.allowed.includes(got as ContainerRejection),
            `byte ${i} bit ${bit} (${region.name}) gave '${got}'`
          ).toBe(true)
          seen.add(got)
          everything.add(got)
          tested++
        }
      }
      // Each region reaches every refusal it is credited with, so a set of two
      // cannot quietly become a region that only ever answers one of them.
      expect([...seen].sort(), region.name).toEqual([...region.allowed].sort())
    }

    expect(tested).toBe(96 * 8)
    expect(tested).toBe(768)
    expect(everything.has('accepted')).toBe(false)
    expect(everything.has('threw')).toBe(false)
  })
})

describe('corruption inside the body', () => {
  const SAMPLES = 64

  it('is caught by the payload digest, sampled across the whole payload', () => {
    const payload = samplePayload(4096)
    const container = sampleContainer(payload)
    expect(outcome(container)).toBe('accepted')

    const step = Math.floor(payload.length / SAMPLES)
    expect(step).toBeGreaterThan(0)

    let tested = 0
    for (let n = 0; n < SAMPLES; n++) {
      const at = PREAMBLE_BYTES + container.readUInt32LE(OFF_HEADER_LENGTH) + n * step
      const got = outcome(patched(container, (b) => (b[at] = b[at]! ^ 0x5a)))
      expect(got, `payload byte ${n * step} gave '${got}'`).toBe('payload-checksum')
      tested++
    }
    expect(tested).toBe(64)
  })

  it('is caught by the header digest before the JSON is ever parsed', () => {
    const container = sampleContainer(samplePayload(1024))
    expect(outcome(container)).toBe('accepted')
    const headerLength = container.readUInt32LE(OFF_HEADER_LENGTH)
    expect(headerLength).toBeGreaterThan(SAMPLES)

    const step = Math.floor(headerLength / SAMPLES)
    let tested = 0
    for (let n = 0; n < SAMPLES; n++) {
      const at = PREAMBLE_BYTES + n * step
      const got = outcome(patched(container, (b) => (b[at] = b[at]! ^ 0x5a)))
      expect(got, `header byte ${n * step} gave '${got}'`).toBe('header-checksum')
      tested++
    }
    expect(tested).toBe(64)
  })

  it('is caught even when the corruption is a valid JSON edit', () => {
    // A header edited to claim a different vault is still a digest failure:
    // the checksum is over bytes, not over meaning.
    const header = sampleHeader()
    const container = sampleContainer(samplePayload(64), header)
    const original = Buffer.from(JSON.stringify(header), 'utf8')
    const forgedJson = Buffer.from(
      JSON.stringify({ ...header, vaultId: 'f'.repeat(32) }),
      'utf8'
    )
    expect(forgedJson).toHaveLength(original.length)
    const swapped = patched(container, (b) => forgedJson.copy(b, PREAMBLE_BYTES))
    expect(outcome(swapped)).toBe('header-checksum')
  })
})

describe('a file that ends early, or does not end where it says', () => {
  it('refuses every length from nothing up to the first body bytes', () => {
    const container = sampleContainer(samplePayload(1024))
    let tested = 0
    for (let length = 0; length <= PREAMBLE_BYTES + 63; length++) {
      const got = outcome(container.subarray(0, length))
      // A cut that lands inside the magic leaves a file that no longer
      // announces itself as a backup, and it is told so. Only once all sixteen
      // magic bytes survive is 'this is a JADEITE backup, and it ends early'
      // a true sentence — which is the distinction the two reasons exist to
      // draw, and the reason the magic is compared before the length.
      const expected = length < MAGIC.length ? 'magic' : 'truncated'
      expect(got, `a ${length}-byte file gave '${got}'`).toBe(expected)
      tested++
    }
    expect(tested).toBe(96 + 64)
    expect(tested).toBe(160)
  })

  it('refuses a cut anywhere inside the header or the payload', () => {
    const container = sampleContainer(samplePayload(1024))
    const headerLength = container.readUInt32LE(OFF_HEADER_LENGTH)
    const cuts = [
      PREAMBLE_BYTES + 1,
      PREAMBLE_BYTES + headerLength - 1,
      PREAMBLE_BYTES + headerLength,
      PREAMBLE_BYTES + headerLength + 1,
      Math.floor(container.length / 2),
      container.length - 1
    ]
    let tested = 0
    for (const cut of cuts) {
      expect(outcome(container.subarray(0, cut)), `cut at ${cut}`).toBe('truncated')
      tested++
    }
    expect(tested).toBe(6)
  })

  it('refuses a file longer than it says it is', () => {
    // Declared and actual must agree exactly: something appended to a backup is
    // as much a reason to refuse as something missing from one.
    const container = sampleContainer(samplePayload(256))
    expect(outcome(Buffer.concat([container, Buffer.from([0])]))).toBe('truncated')
    expect(outcome(Buffer.concat([container, samplePayload(4096)]))).toBe('truncated')
    expect(outcome(Buffer.concat([container, container]))).toBe('truncated')
  })

  it('refuses a file with something prepended', () => {
    const container = sampleContainer(samplePayload(256))
    expect(outcome(Buffer.concat([Buffer.from([0]), container]))).toBe('magic')
  })
})

describe('a declared length that lies', () => {
  it('refuses a header length of every dishonest shape, without throwing', () => {
    const container = sampleContainer(samplePayload(1024))
    const cases: readonly { why: string; length: number; expected: ContainerRejection }[] = [
      { why: 'the largest uint32 there is', length: 0xffffffff, expected: 'oversize' },
      { why: 'one byte past the cap', length: MAX_HEADER_BYTES + 1, expected: 'oversize' },
      { why: 'exactly the cap, unbacked', length: MAX_HEADER_BYTES, expected: 'truncated' },
      { why: 'longer than the file', length: 60_000, expected: 'truncated' },
      { why: 'zero', length: 0, expected: 'truncated' }
    ]
    let tested = 0
    for (const { why, length, expected } of cases) {
      const lying = patched(container, (b) => b.writeUInt32LE(length, OFF_HEADER_LENGTH))
      expect(outcome(lying), `header length ${length} (${why})`).toBe(expected)
      tested++
    }
    expect(tested).toBe(5)
  })

  it('refuses a payload length of every dishonest shape, without throwing', () => {
    const container = sampleContainer(samplePayload(1024))
    const cases: readonly { why: string; length: bigint; expected: ContainerRejection }[] = [
      { why: 'the largest uint64 there is', length: 0xffffffffffffffffn, expected: 'oversize' },
      { why: 'one byte past the cap', length: BigInt(MAX_PAYLOAD_BYTES) + 1n, expected: 'oversize' },
      { why: 'exactly the cap, unbacked', length: BigInt(MAX_PAYLOAD_BYTES), expected: 'truncated' },
      { why: 'far past the end of the file', length: 1n << 40n, expected: 'oversize' },
      { why: 'zero', length: 0n, expected: 'truncated' }
    ]
    let tested = 0
    for (const { why, length, expected } of cases) {
      const lying = patched(container, (b) => b.writeBigUInt64LE(length, OFF_PAYLOAD_LENGTH))
      expect(outcome(lying), `payload length ${length} (${why})`).toBe(expected)
      tested++
    }
    expect(tested).toBe(5)
  })

  it('answers a 256 MiB claim from a 96-byte file immediately', () => {
    // The proof that nothing was allocated is the named reason coming back at
    // all: both checks sit above the first slice. The clock is a second opinion,
    // loose enough to survive a busy machine.
    const started = Date.now()
    expect(outcome(forgePreamble(0, BigInt(MAX_PAYLOAD_BYTES)))).toBe('truncated')
    expect(outcome(forgePreamble(0, BigInt(MAX_PAYLOAD_BYTES) * 1024n))).toBe('oversize')
    expect(outcome(forgePreamble(MAX_HEADER_BYTES, 0n))).toBe('truncated')
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('refuses a boundary moved between header and payload', () => {
    // Both lengths edited so the file still adds up. Only the digests can tell
    // that the split point has moved, and they do.
    const payload = samplePayload(1024)
    const container = sampleContainer(payload)
    const body = BigInt(container.length - PREAMBLE_BYTES)

    const allHeader = patched(container, (b) => {
      b.writeUInt32LE(Number(body), OFF_HEADER_LENGTH)
      b.writeBigUInt64LE(0n, OFF_PAYLOAD_LENGTH)
    })
    const allPayload = patched(container, (b) => {
      b.writeUInt32LE(0, OFF_HEADER_LENGTH)
      b.writeBigUInt64LE(body, OFF_PAYLOAD_LENGTH)
    })
    const shifted = patched(container, (b) => {
      const headerLength = container.readUInt32LE(OFF_HEADER_LENGTH)
      b.writeUInt32LE(headerLength + 1, OFF_HEADER_LENGTH)
      b.writeBigUInt64LE(BigInt(payload.length) - 1n, OFF_PAYLOAD_LENGTH)
    })

    expect(outcome(allHeader)).toBe('header-checksum')
    expect(outcome(allPayload)).toBe('header-checksum')
    expect(outcome(shifted)).toBe('header-checksum')
  })
})

describe('the header must be a header, not merely JSON', () => {
  const base = sampleHeader()

  /**
   * Everything `isBackupHeader` owes a `false` to.
   *
   * Driven through the predicate directly because it is an export in its own
   * right and because a table this long does not need a container built around
   * each row; the representatives below prove the predicate is what
   * `readContainer` consults.
   */
  const NOT_HEADERS: readonly { why: string; header: unknown }[] = [
    { why: 'null', header: null },
    { why: 'an array', header: [base] },
    { why: 'a number', header: 5 },
    { why: 'a string', header: JSON.stringify(base) },
    { why: 'no vaultId at all', header: without(base, 'vaultId') },
    { why: 'a vaultId in upper case', header: { ...base, vaultId: base.vaultId.toUpperCase() } },
    { why: 'a vaultId one nibble short', header: { ...base, vaultId: base.vaultId.slice(0, 31) } },
    { why: 'a vaultId that is not hex', header: { ...base, vaultId: 'g'.repeat(32) } },
    { why: 'a vaultId that is a number', header: { ...base, vaultId: 12345 } },
    { why: 'a vaultId with a hyphen in it', header: { ...base, vaultId: `${base.vaultId.slice(0, 31)}-` } },
    { why: 'no container version', header: without(base, 'container') },
    { why: 'a container version from the future', header: { ...base, container: 2 } },
    { why: 'a container version as a string', header: { ...base, container: '1' } },
    { why: 'a schema version of zero', header: { ...base, schemaVersion: 0 } },
    { why: 'a fractional schema version', header: { ...base, schemaVersion: 5.5 } },
    { why: 'a schema version as a string', header: { ...base, schemaVersion: '5' } },
    { why: 'no appVersion', header: without(base, 'appVersion') },
    { why: 'an appVersion that is a number', header: { ...base, appVersion: 9 } },
    { why: 'no createdAt', header: without(base, 'createdAt') },
    { why: 'no sections', header: without(base, 'sections') },
    { why: 'a section stamp that is a number', header: { ...base, sections: { ...base.sections, s3: 42 } } },
    { why: 'a section stamp that is an object', header: { ...base, sections: { ...base.sections, s1: {} } } },
    { why: 'a missing section stamp', header: { ...base, sections: { s1: null, s2: null, s3: null } } },
    { why: 'sections that are not an object', header: { ...base, sections: 'none' } },
    { why: 'no envelope', header: without(base, 'envelope') },
    { why: 'an envelope from another format', header: { ...base, envelope: { ...base.envelope, format: 99 } } },
    {
      why: 'an envelope with its KDF cost edited down',
      header: { ...base, envelope: { ...base.envelope, kdf: { ...base.envelope.kdf, memoryCost: 8 } } }
    },
    {
      why: 'an envelope with an impossible recovery generation',
      header: {
        ...base,
        envelope: { ...base.envelope, recovery: { ...base.envelope.recovery, generation: 0 } }
      }
    },
    { why: 'an envelope missing its password slot', header: { ...base, envelope: { ...base.envelope, password: undefined } } }
  ]

  it('accepts the header the writer produces', () => {
    expect(isBackupHeader(base)).toBe(true)
  })

  it('refuses all 29 malformed headers', () => {
    expect(NOT_HEADERS).toHaveLength(29)
    let tested = 0
    for (const { why, header } of NOT_HEADERS) {
      expect(isBackupHeader(header), `accepted a header with ${why}`).toBe(false)
      tested++
    }
    expect(tested).toBe(29)
  })

  it("reports a malformed header as 'header', not as a checksum failure", () => {
    // Every case here is forged with its digest recomputed. Skip that and the
    // reader answers 'header-checksum' first, and none of these prove anything.
    const payload = samplePayload(64)
    const representatives: readonly { why: string; header: unknown }[] = [
      { why: 'no vaultId', header: without(base, 'vaultId') },
      { why: 'a malformed vaultId', header: { ...base, vaultId: 'not-a-vault-id' } },
      // The header's `container` and the preamble's format field are separate
      // versions of separate things, so a wrong `container` is 'header' rather
      // than 'format'; the preamble here still says 1.
      { why: 'a container version from the future', header: { ...base, container: 2 } },
      { why: 'a numeric section stamp', header: { ...base, sections: { ...base.sections, s2: 7 } } },
      { why: 'a broken envelope', header: { ...base, envelope: { ...base.envelope, format: 99 } } },
      { why: 'an array where an object belongs', header: [1, 2, 3] }
    ]
    expect(outcome(forgeHeader(base, payload))).toBe('accepted')

    let tested = 0
    for (const { why, header } of representatives) {
      const got = outcome(forgeHeader(header, payload))
      expect(got, `${why} gave '${got}'`).toBe('header')
      tested++
    }
    expect(tested).toBe(6)
  })

  it('reports header bytes that are not JSON at all as a header failure', () => {
    const payload = samplePayload(64)
    const notJson: readonly Buffer[] = [
      Buffer.from('', 'utf8'),
      Buffer.from('not json at all', 'utf8'),
      Buffer.from('{"container":1', 'utf8'),
      Buffer.from('{"container":1}{"container":1}', 'utf8'),
      Buffer.from('undefined', 'utf8'),
      // Bytes that are not valid UTF-8, so the decode yields replacement
      // characters and the parse fails rather than the decode throwing.
      Buffer.from([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28]),
      randomBytes(256)
    ]
    let tested = 0
    for (const headerBytes of notJson) {
      const got = outcome(forge(headerBytes, payload))
      expect(got, `header bytes ${headerBytes.toString('hex').slice(0, 24)} gave '${got}'`).toBe(
        'header'
      )
      tested++
    }
    expect(tested).toBe(7)
  })

  it('refuses a header that is valid JSON of the wrong primitive kind', () => {
    const payload = samplePayload(64)
    for (const value of [null, 5, true, 'a string', []]) {
      expect(outcome(forgeHeader(value, payload))).toBe('header')
    }
  })
})

describe('files that are not backups at all', () => {
  it('refuses an empty file, and calls it what it is', () => {
    // Not 'truncated'. An empty file is not a damaged backup, and telling
    // someone whose disk has just died that their backup is corrupt — when
    // they have merely picked the wrong file — is the worse of the two
    // mistakes to make.
    expect(outcome(Buffer.alloc(0))).toBe('magic')
  })

  it('refuses a JPEG', () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.from('JFIF\x00', 'latin1'),
      randomBytes(4096)
    ])
    expect(outcome(jpeg)).toBe('magic')
  })

  it('refuses a file of random bytes', () => {
    let tested = 0
    for (let n = 0; n < 32; n++) {
      const got = outcome(randomBytes(1024))
      expect(got, `random file ${n} gave '${got}'`).toBe('magic')
      tested++
    }
    expect(tested).toBe(32)
  })

  it('refuses a text file', () => {
    expect(outcome(Buffer.from('the quick brown fox\n'.repeat(64), 'utf8'))).toBe('magic')
  })

  it('refuses the magic and nothing else', () => {
    expect(outcome(MAGIC)).toBe('truncated')
    expect(outcome(Buffer.concat([MAGIC, Buffer.alloc(PREAMBLE_BYTES - MAGIC.length - 1)]))).toBe(
      'truncated'
    )
  })

  it('refuses a zero-filled preamble that carries the magic', () => {
    const zeroed = Buffer.alloc(PREAMBLE_BYTES)
    MAGIC.copy(zeroed, 0)
    // The format field reads 0, which is not this build's container version.
    expect(outcome(zeroed)).toBe('format')
  })

  it('refuses an empty container whose digests were never written', () => {
    // Lengths honest, magic and format right, digests left as zeroes.
    expect(outcome(forgePreamble(0, 0n))).toBe('header-checksum')
  })

  it('refuses the magic followed by a real container, offset by one', () => {
    const container = sampleContainer(samplePayload(256))
    expect(outcome(container.subarray(1))).toBe('magic')
  })
})

describe('bytes chosen at random', () => {
  /**
   * The single-bit sweeps above are exhaustive but orderly: one fault at a
   * time, in a known place. These two are the opposite claim — that nothing
   * about the parser depends on damage being tidy. A thousand reads is the
   * cheapest evidence there is that no input path throws.
   */
  it('never accepts and never throws on a container damaged at random', () => {
    const container = sampleContainer(samplePayload(2048))
    expect(outcome(container)).toBe('accepted')

    let tested = 0
    for (let n = 0; n < 500; n++) {
      const wounds = 1 + (n % 7)
      const damaged = patched(container, (b) => {
        for (let w = 0; w < wounds; w++) {
          const at = randomBytes(4).readUInt32LE(0) % b.length
          b[at] = b[at]! ^ (1 + (randomBytes(1)[0]! % 255))
        }
      })
      const got = outcome(damaged)
      expect(got === 'accepted' || got === 'threw', `${wounds} wounds gave '${got}'`).toBe(false)
      tested++
    }
    expect(tested).toBe(500)
  })

  it('never accepts and never throws on a file of random length and content', () => {
    let tested = 0
    for (let n = 0; n < 500; n++) {
      const length = randomBytes(2).readUInt16LE(0) % 600
      const got = outcome(randomBytes(length))
      expect(got === 'accepted' || got === 'threw', `${length} random bytes gave '${got}'`).toBe(
        false
      )
      tested++
    }
    expect(tested).toBe(500)
  })
})

describe('rejectionToError', () => {
  /**
   * The eight engineering facts, and the four sentences the owner is told.
   *
   * Typed as a total record so that a ninth rejection added to
   * `ContainerRejection` fails the typecheck here before it can quietly fall
   * through the switch, and counted at runtime so that it fails the test too.
   */
  const EXPECTED: Record<ContainerRejection, BackupErrorCode> = {
    magic: 'NOT_A_BACKUP',
    header: 'NOT_A_BACKUP',
    format: 'FUTURE_FORMAT',
    schema: 'FUTURE_SCHEMA',
    truncated: 'DAMAGED',
    oversize: 'DAMAGED',
    'header-checksum': 'DAMAGED',
    'payload-checksum': 'DAMAGED'
  }

  it('maps all eight rejections, and there are exactly eight', () => {
    const reasons = Object.keys(EXPECTED) as ContainerRejection[]
    expect(reasons).toHaveLength(8)

    let tested = 0
    for (const reason of reasons) {
      expect(rejectionToError(reason), `'${reason}' mapped wrongly`).toBe(EXPECTED[reason])
      tested++
    }
    expect(tested).toBe(8)
  })

  it('narrows to the four answers that change what the owner does next', () => {
    const answers = new Set(
      (Object.keys(EXPECTED) as ContainerRejection[]).map((reason) => rejectionToError(reason))
    )
    expect([...answers].sort()).toEqual(['DAMAGED', 'FUTURE_FORMAT', 'FUTURE_SCHEMA', 'NOT_A_BACKUP'])
  })

  it('says "not a backup" for a stranger and "damaged" for a hurt one', () => {
    expect(rejectionToError('magic')).toBe('NOT_A_BACKUP')
    expect(rejectionToError('payload-checksum')).toBe('DAMAGED')
    expect(rejectionToError('schema')).toBe('FUTURE_SCHEMA')
  })
})

describe('the eight reasons, counted over everything above', () => {
  /**
   * Last on purpose: Vitest runs a file's tests in source order, so by the time
   * this one runs, every case in this file has contributed whatever refusal it
   * provoked to `REACHED`. Listing the eight in a literal proves nothing; this
   * fails when a reason becomes unreachable — a check that can no longer fire,
   * or one that starts answering under a different name.
   */
  it('were each provoked by real bytes, not merely named', () => {
    expect([...REACHED].sort()).toEqual([
      'format',
      'header',
      'header-checksum',
      'magic',
      'oversize',
      'payload-checksum',
      'schema',
      'truncated'
    ])
    expect(REACHED.size).toBe(8)
  })
})
