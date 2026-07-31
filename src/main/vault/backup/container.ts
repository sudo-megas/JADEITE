/**
 * The `.jbk` container — read and written here, and nowhere else.
 *
 * XJADEITE §15 specifies it as "key envelope header + SQLCipher database +
 * checksums". This module is that sentence:
 *
 * ```
 *   0..15   magic                16 bytes
 *  16..19   container format     uint32 LE
 *  20..23   header length        uint32 LE
 *  24..31   payload length       uint64 LE
 *  32..63   SHA-256 of header    32 bytes
 *  64..95   SHA-256 of payload   32 bytes
 *  96..     header               UTF-8 JSON, `headerBytes` long
 *   ...     payload              the SQLCipher database, `payloadBytes` long
 * ```
 *
 * **This is the only untrusted input the application has** (REALISATION.md,
 * Realisation IX). Everything else it reads it wrote itself, and the one other
 * door — the price provider — carries numbers, not structure. So the rules
 * `prices/parse.ts` follows apply here twice over: nothing throws past this
 * module, every length is bounded before it is allocated, and every rejection
 * is named rather than merely counted.
 *
 * The payload is *not* re-encrypted. The database is already sealed by the DEK,
 * and re-sealing it would mean a second key derivation over a key Argon2id
 * already stretched, plus a second copy of the plaintext in memory to do it
 * with. The envelope travels beside it, exactly as it does at rest — which is
 * what makes §4.4's second row true: a backup carries the credentials that were
 * in force when it was taken.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

import {
  CONTAINER_FORMAT,
  SECTION_KEYS,
  type ContainerRejection,
  type SectionStamps
} from '../../../shared/backup/types.js'
import { isKeyEnvelope, type KeyEnvelope } from '../envelope.js'

const MAGIC = Buffer.from('JADEITE-BACKUP\x1a\x00', 'latin1')

const OFF_FORMAT = 16
const OFF_HEADER_LENGTH = 20
const OFF_PAYLOAD_LENGTH = 24
const OFF_HEADER_DIGEST = 32
const OFF_PAYLOAD_DIGEST = 64
export const PREAMBLE_BYTES = 96

/**
 * Bounds, checked before anything is allocated or sliced.
 *
 * A declared length is an attacker-chosen integer until it has been compared
 * with the file that declares it. The header cap is generous for a document
 * whose largest field is a base64 key envelope; the payload cap is far above
 * any vault this application can produce by hand and far below a number that
 * would exhaust the machine.
 */
export const MAX_HEADER_BYTES = 64 * 1024
export const MAX_PAYLOAD_BYTES = 256 * 1024 * 1024

/** Written into the container, and validated on the way back out. */
export interface BackupHeader {
  container: number
  /** This vault's lineage, minted at creation and never changed (schema v5). */
  vaultId: string
  /** `PRAGMA user_version` of the database in the payload. */
  schemaVersion: number
  /** The JADEITE that wrote the container. */
  appVersion: string
  createdAt: string
  sections: SectionStamps
  /** `jadeite.keys` as it stood when the backup was taken (§4.4). */
  envelope: KeyEnvelope
}

export interface BackupContainer {
  header: BackupHeader
  payload: Buffer
}

export type ContainerRead =
  | { ok: true; value: BackupContainer }
  | { ok: false; reason: ContainerRejection }

/** A vault id is 16 random bytes, lower-case hex. Anything else is not one. */
function isVaultId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v)
}

/**
 * The bound that matters most in this file, and the least obvious.
 *
 * `createdAt`, `appVersion` and the four section stamps are the only header
 * fields the restore screen puts in front of the owner, and until the hardening
 * pass they were checked for being strings and nothing else. The header may be
 * 64 KiB, so a crafted container could have placed sixty-four kilobytes of
 * chosen text beside the credential prompt — on the one surface in this
 * application whose entire job is §15's *explicit confirmation*. React's
 * escaping prevents a script; it does not prevent an `appVersion` reading
 * "0.9.0 — verified, no credential required".
 *
 * The fuzz suite could not have found this. Its subject is which malformed
 * containers are rejected, and a header with a very long `appVersion` is not
 * malformed by any rule that existed to test.
 *
 * A version string and an ISO-8601 timestamp fit in tens of bytes. The
 * timestamps are shape-checked as well as bounded, because a date is the one
 * field here the interface actually parses.
 */
const MAX_LABEL_LENGTH = 64
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]{8,15}Z$/

function isLabel(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_LABEL_LENGTH
}

function isTimestamp(v: unknown): v is string {
  return isLabel(v) && ISO_TIMESTAMP.test(v)
}

function isSectionStamps(v: unknown): v is SectionStamps {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  for (const key of SECTION_KEYS) {
    const stamp = o[key]
    if (stamp !== null && !isTimestamp(stamp)) return false
  }
  return true
}

export function isBackupHeader(v: unknown): v is BackupHeader {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (o['container'] !== CONTAINER_FORMAT) return false
  if (!isVaultId(o['vaultId'])) return false
  const schema = o['schemaVersion']
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) return false
  if (!isLabel(o['appVersion'])) return false
  if (!isTimestamp(o['createdAt'])) return false
  if (!isSectionStamps(o['sections'])) return false
  return isKeyEnvelope(o['envelope'])
}

function digest(bytes: Buffer): Buffer {
  return createHash('sha256').update(bytes).digest()
}

/**
 * Compare two digests without leaking where they first differ.
 *
 * A checksum over a backup is an integrity check and not a secret, so the
 * timing here buys little. It costs nothing either, and the habit is the one
 * worth having in a file that also compares things that *are* secret.
 */
function digestsMatch(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Seal a header and a database into the bytes that become a `.jbk` file.
 *
 * The header is validated on the way out as well as on the way in. Without
 * that, a caller could write a container this very module will refuse to read —
 * a `vaultId` that is not sixteen hex bytes, a `schemaVersion` of zero — and
 * the mistake would surface at restore time, on the day the owner needs the
 * file, rather than at backup time while they are watching.
 */
export function writeContainer(header: BackupHeader, payload: Buffer): Buffer {
  if (!isBackupHeader(header)) throw new Error('backup header is not well formed')

  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
  if (headerBytes.length > MAX_HEADER_BYTES) {
    throw new Error('backup header exceeds the container limit')
  }
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new Error('backup payload exceeds the container limit')
  }

  const preamble = Buffer.alloc(PREAMBLE_BYTES)
  MAGIC.copy(preamble, 0)
  preamble.writeUInt32LE(CONTAINER_FORMAT, OFF_FORMAT)
  preamble.writeUInt32LE(headerBytes.length, OFF_HEADER_LENGTH)
  preamble.writeBigUInt64LE(BigInt(payload.length), OFF_PAYLOAD_LENGTH)
  digest(headerBytes).copy(preamble, OFF_HEADER_DIGEST)
  digest(payload).copy(preamble, OFF_PAYLOAD_DIGEST)

  return Buffer.concat([preamble, headerBytes, payload])
}

/**
 * Read a candidate file. Never throws; every failure is a named reason.
 *
 * The order of the checks is the safety. Magic before version, so a JPEG is
 * told it is a JPEG rather than "an unsupported JADEITE format". Lengths before
 * slices, so a declared size can never index past the buffer. Digests before
 * the header is parsed, so `JSON.parse` only ever sees bytes that arrived
 * intact. Schema last, because it is the only rejection that means *update the
 * application* rather than *find a better file*.
 *
 * @param maxSchemaVersion the newest `user_version` this build can migrate to.
 */
export function readContainer(bytes: Buffer, maxSchemaVersion: number): ContainerRead {
  // The magic is checked against whatever bytes exist, before the length is
  // judged. Testing the length first would tell someone who chose a text file
  // by mistake that their *backup* is damaged — a far worse sentence to read
  // on the day a disk dies than "that is not a JADEITE backup".
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) return { ok: false, reason: 'magic' }
  if (bytes.length < PREAMBLE_BYTES) return { ok: false, reason: 'truncated' }

  const format = bytes.readUInt32LE(OFF_FORMAT)
  if (format !== CONTAINER_FORMAT) return { ok: false, reason: 'format' }

  const headerBytes = bytes.readUInt32LE(OFF_HEADER_LENGTH)
  const payloadBytes = bytes.readBigUInt64LE(OFF_PAYLOAD_LENGTH)
  if (headerBytes > MAX_HEADER_BYTES) return { ok: false, reason: 'oversize' }
  if (payloadBytes > BigInt(MAX_PAYLOAD_BYTES)) return { ok: false, reason: 'oversize' }

  // Declared and actual must agree exactly. A file longer than it says it is
  // has had something appended to it, which is as much a reason to refuse as a
  // file that ends early.
  const declared = BigInt(PREAMBLE_BYTES) + BigInt(headerBytes) + payloadBytes
  if (BigInt(bytes.length) !== declared) return { ok: false, reason: 'truncated' }

  const headerSlice = bytes.subarray(PREAMBLE_BYTES, PREAMBLE_BYTES + headerBytes)
  const payload = bytes.subarray(PREAMBLE_BYTES + headerBytes)

  if (!digestsMatch(digest(headerSlice), bytes.subarray(OFF_HEADER_DIGEST, OFF_HEADER_DIGEST + 32))) {
    return { ok: false, reason: 'header-checksum' }
  }
  if (
    !digestsMatch(digest(payload), bytes.subarray(OFF_PAYLOAD_DIGEST, OFF_PAYLOAD_DIGEST + 32))
  ) {
    return { ok: false, reason: 'payload-checksum' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(headerSlice.toString('utf8'))
  } catch {
    return { ok: false, reason: 'header' }
  }
  if (!isBackupHeader(parsed)) return { ok: false, reason: 'header' }

  // `migrate` walks forward only and silently ignores a version it has never
  // heard of, so a container from a newer JADEITE would open here, skip every
  // migration, and present a database this build cannot read correctly — with
  // no error anywhere. That is precisely the rig-to-laptop case backups exist
  // for, so it is refused here rather than discovered later.
  //
  // The ceiling is proved before it is compared. `a > NaN` is false, so a
  // ceiling that arrived as NaN would not raise anything — it would quietly
  // accept every schema, disabling this check at the moment it matters and
  // leaving no trace that it had.
  if (!Number.isInteger(maxSchemaVersion)) return { ok: false, reason: 'schema' }
  if (parsed.schemaVersion > maxSchemaVersion) return { ok: false, reason: 'schema' }

  // Copied out of the candidate buffer so the container does not retain a view
  // onto bytes the caller may reuse.
  return { ok: true, value: { header: parsed, payload: Buffer.from(payload) } }
}

/** The digest a `backup_log` row records, and the one the owner can compare. */
export function payloadChecksum(payload: Buffer): string {
  return digest(payload).toString('hex')
}
