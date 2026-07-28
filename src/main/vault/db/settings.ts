/**
 * Settings live inside the encrypted vault (§4.1, §16.5).
 *
 * There is no .toml, no .lua, no dotfile: nothing about JADEITE is
 * configurable from outside JADEITE.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { DEFAULT_SETTINGS } from '../../../shared/ipc-contract.js'

export function getSetting(db: DatabaseType, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (row) return row.value
  return DEFAULT_SETTINGS[key] ?? null
}

export function setSetting(db: DatabaseType, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

/** Write the defaults that a fresh vault should carry (§13: Turkish default). */
export function seedDefaultSettings(db: DatabaseType): void {
  const insert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING'
  )
  const run = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insert.run(key, value)
    }
  })
  run()
}
