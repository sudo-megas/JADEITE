/**
 * Where the vault lives — XJADEITE §5.1.
 *
 * Linux:   ~/.local/share/jadeite/
 * Windows: %LOCALAPPDATA%\jadeite\   (Realisation XI)
 *
 * Deliberately not Electron's `userData`: Chromium scatters its own caches
 * through that directory, and §4.1 requires the data directory to hold exactly
 * two app-managed files.
 *
 * Windows takes LOCALAPPDATA rather than APPDATA, which is the split the XDG
 * pair already makes on Linux: roaming carries configuration, local carries
 * data. §5.1 first named APPDATA for both, which collapsed the two directories
 * into one and made `config.json` a third file beside the two §4.1 permits. It
 * also meant an encrypted database roamed between machines on a domain profile,
 * which is not something this application should ever ask a network to carry.
 *
 * `JADEITE_DATA_HOME` overrides all of it, and the suites isolate themselves
 * with it because they must: `XDG_DATA_HOME` is inert on the win32 branch, so
 * until this existed a test run on Windows addressed the owner's real vault.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const APP_DIR_NAME = 'jadeite'

export function vaultDirectory(): string {
  const override = process.env['JADEITE_DATA_HOME']
  if (override && override.length > 0) return join(override, APP_DIR_NAME)
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA']
    if (localAppData) return join(localAppData, APP_DIR_NAME)
    return join(homedir(), 'AppData', 'Local', APP_DIR_NAME)
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
