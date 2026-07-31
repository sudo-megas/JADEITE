/**
 * The year lifecycle — the parent Section 1's grid hangs from.
 *
 * `years` is the parent table of `s1_categories` and `s1_entries` (schema.ts).
 * It parented `s2_banks` and `s2_cells` too until point revision v0.8b took the
 * year out of Section 2 (§7.1, §7.3 as amended), which is why this module still
 * sits beside the sections rather than inside db/section1.ts: it was moved out
 * in Realisation IV when a second section started using it, and moving it back
 * now would churn every import for a fact that could change again.
 *
 * What did change is the answer to "what does creating a year do". It seeds one
 * grid from one donor, not two. Section 2 has one standing set of columns and
 * takes no part in a year at all — adding 2027 in Section 1 leaves Ödemeler
 * exactly as it was, which is the whole of the owner's ruling.
 *
 * No arithmetic lives here. Totals are computed by the section engines and
 * stored nowhere (§5.3).
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { SETTING_KEYS } from '../../../shared/ipc-contract.js'
import type { YearUsage } from '../../../shared/section1/types.js'
import { isValidYear } from '../../../shared/calendar.js'
import { VaultDataError } from './errors.js'
import { getSetting, setSetting } from './settings.js'

export { isValidYear }

function fail(code: string): never {
  throw new VaultDataError(code)
}

export function listYears(db: DatabaseType): number[] {
  const rows = db.prepare('SELECT year FROM years ORDER BY year ASC').all() as { year: number }[]
  return rows.map((r) => r.year)
}

export function yearExists(db: DatabaseType, year: number): boolean {
  const row = db.prepare('SELECT 1 AS present FROM years WHERE year = ?').get(year)
  return row !== undefined
}

/**
 * The accent anchor — the year the palette's accent sequence starts counting
 * from (§12.3).
 *
 * It is written once and never recomputed. Deriving it from the earliest year
 * present would make every year's colour a function of the whole dataset, so
 * back-filling one older year would repaint every workspace the owner had
 * already learnt to recognise. The accent is how a year is known at a glance;
 * it does not get to move.
 */
export function accentAnchorYear(db: DatabaseType): number {
  const stored = getSetting(db, SETTING_KEYS.accentAnchorYear)
  const parsed = stored === null ? NaN : Number.parseInt(stored, 10)
  if (isValidYear(parsed)) return parsed

  // Absent only for a vault that predates Realisation III. Repaired once, to a
  // fixed value, and then treated as frozen like any other anchor.
  const years = listYears(db)
  const repaired = years[0] ?? new Date().getFullYear()
  setSetting(db, SETTING_KEYS.accentAnchorYear, String(repaired))
  return repaired
}

/**
 * Create a year, inheriting the previous year's columns as a starting point.
 *
 * "Previous" is strictly backwards: the donor is the newest year older than
 * this one. A year created before every existing year inherits nothing, because
 * borrowing forwards would furnish a historical workspace with categories the
 * owner had not invented yet. Definitions are copied; amounts never are.
 *
 * Section 1's grid is the only one seeded. This used to carry Section 2's bank
 * columns across in the same transaction — the rollover §7.3 asked for — and
 * point revision v0.8b removed both the rollover and the year it hung from.
 * Ödemeler now holds one standing set of columns that no year creation touches.
 */
export function createYear(db: DatabaseType, year: number): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')

  const run = db.transaction(() => {
    if (yearExists(db, year)) fail('YEAR_EXISTS')

    db.prepare('INSERT INTO years (year, created_at) VALUES (?, ?)').run(
      year,
      new Date().toISOString()
    )

    const donor = db
      .prepare('SELECT year FROM years WHERE year < ? ORDER BY year DESC LIMIT 1')
      .get(year) as { year: number } | undefined

    if (donor) {
      db.prepare(
        `INSERT INTO s1_categories (year, name, kind, value_type, position)
           SELECT ?, name, kind, value_type, position
             FROM s1_categories WHERE year = ?
            ORDER BY kind, position`
      ).run(year, donor.year)
    }

    // The anchor belongs to the first year this vault ever had.
    if (getSetting(db, SETTING_KEYS.accentAnchorYear) === null) {
      setSetting(db, SETTING_KEYS.accentAnchorYear, String(year))
    }
  })

  run()
}

/**
 * The year a fresh vault opens on.
 *
 * The system clock is read for the year number. That is not OS-locale
 * detection: §13 prohibits taking the *language* or the formatting conventions
 * from the machine, and the vault already timestamps every row it writes.
 */
export function ensureAnyYear(db: DatabaseType): number {
  const existing = listYears(db)
  const first = existing[0]
  if (first !== undefined) return first

  const currentYear = new Date().getFullYear()
  createYear(db, currentYear)
  return currentYear
}

/**
 * What deleting a year would destroy, asked for before the offer is made.
 *
 * Both tables the delete cascades to are counted, so the dialogue names the
 * whole of what the button does rather than half of it — precisely the kind of
 * quiet half-truth this application exists to stop telling.
 *
 * It counted Section 2's banks and cells as well until point revision v0.8b,
 * which is no longer a half-truth but a falsehood: deleting a year cannot reach
 * Ödemeler, because Ödemeler has no year.
 */
export function yearUsage(db: DatabaseType, year: number): YearUsage {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  if (!yearExists(db, year)) fail('NO_SUCH_YEAR')

  const count = (sql: string): number => (db.prepare(sql).get(year) as { n: number }).n

  return {
    categoryCount: count('SELECT COUNT(*) AS n FROM s1_categories WHERE year = ?'),
    entryCount: count('SELECT COUNT(*) AS n FROM s1_entries WHERE year = ?')
  }
}

/**
 * Delete a year and everything in it.
 *
 * "Everything" means that year's categories and entries, which the cascade from
 * `years` takes with it (schema.ts). It reached Section 2's grid too until point
 * revision v0.8b; it no longer can, and `yearUsage` above no longer claims it.
 *
 * The last remaining year is refused. The switcher has to have somewhere to be,
 * and a vault with no years would meet the owner with a modal instead of a grid.
 *
 * The accent anchor is a settings row and is deliberately untouched: deleting
 * and recreating a year gives it back the colour it had.
 */
export function deleteYear(db: DatabaseType, year: number): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')

  const run = db.transaction(() => {
    if (!yearExists(db, year)) fail('NO_SUCH_YEAR')
    if (listYears(db).length <= 1) fail('LAST_YEAR')
    db.prepare('DELETE FROM years WHERE year = ?').run(year)
  })

  run()
}

/** The manual per-year accent override of §12.3, or null for the sequence value. */
export function setAccentOverride(db: DatabaseType, year: number, accent: string | null): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  if (!yearExists(db, year)) fail('NO_SUCH_YEAR')

  // Only a palette-shaped token is accepted. The renderer paints this straight
  // into a custom property, so anything else would be a stylesheet injection
  // with extra steps.
  const cleaned =
    accent === null || accent.trim().length === 0
      ? null
      : /^#[0-9a-fA-F]{3,8}$/.test(accent.trim())
        ? accent.trim()
        : fail('INTERNAL')

  db.prepare('UPDATE years SET accent_override = ? WHERE year = ?').run(cleaned, year)
}
