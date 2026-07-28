/**
 * Where the vault lives — XJADEITE §5.1.
 *
 * Linux:   ~/.local/share/jadeite/
 * Windows: %APPDATA%\jadeite\   (Realisation XI)
 *
 * Deliberately not Electron's `userData`: Chromium scatters its own caches
 * through that directory, and §4.1 requires the data directory to hold exactly
 * two app-managed files.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const APP_DIR_NAME = 'jadeite'

export function vaultDirectory(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA']
    if (appData) return join(appData, APP_DIR_NAME)
    return join(homedir(), 'AppData', 'Roaming', APP_DIR_NAME)
  }
  const xdgData = process.env['XDG_DATA_HOME']
  const base = xdgData && xdgData.length > 0 ? xdgData : join(homedir(), '.local', 'share')
  return join(base, APP_DIR_NAME)
}

export function databasePath(): string {
  return join(vaultDirectory(), 'jadeite.db')
}

export function envelopePath(): string {
  return join(vaultDirectory(), 'jadeite.keys')
}

/** Create the data directory if absent. Owner-only permissions on POSIX. */
export function ensureVaultDirectory(): string {
  const dir = vaultDirectory()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  return dir
}

export function vaultExists(): boolean {
  return existsSync(envelopePath()) && existsSync(databasePath())
}
