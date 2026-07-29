/**
 * The error a storage module throws so the IPC layer can turn it into a Result.
 *
 * Every repository throws a coded error rather than returning one, because a
 * `Result` cannot travel out of a SQLite transaction callback without the
 * transaction believing it succeeded. The code is a short string from the
 * section's own `*ErrorCode` union; the IPC layer maps anything it does not
 * recognise to `INTERNAL`, so a new code cannot leak an unhandled shape to the
 * renderer by being forgotten in one place.
 *
 * The base class exists because the year lifecycle (db/years.ts) is shared by
 * two sections and cannot know which one is asking. Both `Section1Error` and
 * `Section2Error` extend it, so either IPC layer can catch the base and still
 * receive the year's own failures.
 */

export class VaultDataError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'VaultDataError'
  }
}
