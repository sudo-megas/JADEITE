/**
 * Which vault this is, and when each of its sections was last touched.
 *
 * Both are read only when a backup is sealed (§15). Nothing else in the
 * application has a reason to know them, and nothing writes them from here —
 * the identity is minted once by the v5 migration and the stamps are kept by
 * that migration's triggers, so there is no write path to get wrong.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { SETTING_KEYS } from '../../../shared/ipc-contract.js'
import { SECTION_KEYS, type SectionStamps } from '../../../shared/backup/types.js'
import { getSetting } from './settings.js'

/**
 * This vault's lineage id.
 *
 * Present in every vault from schema v5 onward. It answers null only for a
 * database that has not been migrated, which `openDatabase` makes unreachable
 * — the caller still handles it, because a backup that claimed an empty
 * lineage would compare equal to the next one.
 */
export function vaultId(db: DatabaseType): string | null {
  return getSetting(db, SETTING_KEYS.vaultId)
}

/** Per-section edit times for the container header. Null means never, or unknown. */
export function sectionStamps(db: DatabaseType): SectionStamps {
  const stamps: Record<string, string | null> = {}
  for (const key of SECTION_KEYS) {
    stamps[key] = getSetting(db, SETTING_KEYS.sectionTouchedAt[key])
  }
  return stamps as SectionStamps
}
