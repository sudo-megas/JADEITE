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

/**
 * Flush a directory entry, so a rename into it survives a power cut.
 *
 * **Nothing on Windows, deliberately, and it must stay that way.** There is no
 * directory-sync primitive there. libuv opens the handle happily — `fs__open`
 * sets `FILE_FLAG_BACKUP_SEMANTICS`, so `openSync(dir, 'r')` succeeds — but the
 * handle it returns carries `GENERIC_READ` alone, and `fs__fsync` is a bare
 * `FlushFileBuffers`, which wants `GENERIC_WRITE` and answers a directory with
 * `ERROR_ACCESS_DENIED`. Node raises that as `EACCES: permission denied, fsync`.
 *
 * This is the last statement of `writeFileAtomic`, *after* the rename has already
 * happened, so without the guard every atomic write on Windows would do its work
 * correctly and then throw — and the callers all read a throw as failure. A vault
 * could never be created there: `vault.create()` would leave `jadeite.keys` on
 * disk with no database beside it, report `INTERNAL`, and fail identically on
 * every retry for as long as the machine stood.
 *
 * The durability the module header argues for still holds, by a different route.
 * The file's own bytes were flushed before the rename, and NTFS journals the
 * `MoveFileEx` metadata transaction that the rename compiles to — so the entry
 * pointing at those bytes is as crash-ordered as the flush would have made it.
 * SQLite reaches the same conclusion in its own `os_win.c`, where the directory
 * sync is a no-op for exactly this reason.
 *
 * A guard rather than a `try`/`catch`: on Linux this flush is load-bearing, and
 * swallowing an `EIO` there would quietly give up the property the whole module
 * exists to provide.
 */
export function fsyncDirectory(path: string): void {
  if (process.platform === 'win32') return
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
