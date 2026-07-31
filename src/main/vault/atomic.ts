/**
 * Replace a file so that a power cut cannot leave half of one behind.
 *
 * Write to a sibling, flush the sibling, rename it over the target, flush the
 * directory. On POSIX the rename is atomic, so a reader sees either the whole
 * old file or the whole new one; the directory flush is what makes the rename
 * itself survive the cut rather than merely the bytes it points at.
 *
 * This was `writeEnvelope`'s private business until Realisation IX needed the
 * same discipline for a database and for a restore journal. Three copies of a
 * four-step sequence is three chances to omit the fourth step — which is
 * exactly what had already happened once, in `config/app-config.ts`, where the
 * directory flush was missing.
 */

import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'

/** Flush a directory entry, so a rename into it survives a power cut. */
export function fsyncDirectory(path: string): void {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

/**
 * Write `contents` to `path`, atomically, owner-only.
 *
 * The temporary sibling is removed if the rename fails, so a failed write
 * leaves the original standing and no litter beside it.
 */
export function writeFileAtomic(path: string, contents: Buffer | string, mode = 0o600): void {
  const tmp = `${path}.tmp`

  const fd = openSync(tmp, 'w', mode)
  try {
    if (typeof contents === 'string') {
      writeSync(fd, contents, 0, 'utf8')
    } else {
      writeSync(fd, contents, 0, contents.length)
    }
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

  fsyncDirectory(dirname(path))
}
