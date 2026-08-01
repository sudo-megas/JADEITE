/**
 * `config.json` — the unencrypted application configuration.
 *
 * The owner's amendment to §4.1/§16.5: appearance and language are needed
 * *before* the vault opens, and a lock screen that cannot honour the owner's
 * palette or language is a worse outcome than a plain file holding two
 * preferences.
 *
 * The split is by sensitivity, not by convenience:
 *
 *   this file  — how the app looks and which language it speaks
 *   the vault  — everything about what the owner has, owes and earns,
 *                plus the security settings that govern access to it
 *
 * What this file leaks to anyone who reads it: that JADEITE is installed, and
 * a colour and language preference. It contains nothing about money, and
 * nothing that helps open the vault.
 *
 * Appearance and language live *only* here — they are deliberately not also
 * stored in the vault. Two copies of one truth is the failure that let the
 * source workbook's bank list diverge from itself, and it is not repeated.
 *
 * It also lives in a different directory from the vault, so the data
 * directory still holds exactly the two files §4.1 names.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_APP_CONFIG, type AppConfig } from '../../shared/ipc-contract.js'
import { isKnownPaletteId } from '../../shared/theme/palettes/index.js'

export const CONFIG_FORMAT = 1

const APP_DIR_NAME = 'jadeite'

/**
 * Linux:   `~/.config/jadeite/` — configuration, per the XDG convention, kept
 *          separate from `~/.local/share/jadeite/` where the vault lives.
 * Windows: `%APPDATA%\jadeite\` — the roaming half of the same split, with the
 *          vault in `%LOCALAPPDATA%`. Chromium's own profile lands here too,
 *          exactly as it does in `~/.config/jadeite/` on Linux; §4.1 constrains
 *          the *data* directory, and that one still holds its two files.
 *
 * `JADEITE_CONFIG_HOME` overrides both, and is how the suites stay off the
 * owner's real configuration — `XDG_CONFIG_HOME` never reached the win32 branch.
 */
export function configDirectory(): string {
  const override = process.env['JADEITE_CONFIG_HOME']
  if (override && override.length > 0) return join(override, APP_DIR_NAME)
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA']
    if (appData) return join(appData, APP_DIR_NAME)
    return join(homedir(), 'AppData', 'Roaming', APP_DIR_NAME)
  }
  const xdgConfig = process.env['XDG_CONFIG_HOME']
  const base = xdgConfig && xdgConfig.length > 0 ? xdgConfig : join(homedir(), '.config')
  return join(base, APP_DIR_NAME)
}

export function configPath(): string {
  return join(configDirectory(), 'config.json')
}

function ensureConfigDirectory(): void {
  const dir = configDirectory()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
}

/**
 * Read what is there, keep what is valid, default the rest.
 *
 * This file is hand-editable by construction, so every field is treated as
 * untrusted: an unknown palette or a language that does not exist falls back
 * rather than propagating a bad value into the UI.
 */
export function readAppConfig(): AppConfig {
  let parsed: unknown
  try {
    // A byte-order mark decodes to a leading U+FEFF, and `JSON.parse` rejects
    // it — which would land in the catch below and answer with defaults, so a
    // hand edit would look like it had been ignored and the owner's palette and
    // language would silently revert. This file is hand-editable by
    // construction, and on Windows the editors most likely to do the editing add
    // a BOM without being asked: PowerShell's `Set-Content` and Notepad's
    // "UTF-8 with BOM" both do. Stripping it is the difference between honouring
    // the edit and quietly discarding it.
    parsed = JSON.parse(readFileSync(configPath(), 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return { ...DEFAULT_APP_CONFIG }
  }

  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_APP_CONFIG }
  const raw = parsed as Record<string, unknown>

  const palette = raw['palette']
  const language = raw['language']

  return {
    format: CONFIG_FORMAT,
    palette:
      typeof palette === 'string' && isKnownPaletteId(palette)
        ? palette
        : DEFAULT_APP_CONFIG.palette,
    language: language === 'tr' || language === 'en' ? language : DEFAULT_APP_CONFIG.language
  }
}

/** Replace the file atomically, so a crash mid-write cannot truncate it. */
export function writeAppConfig(config: AppConfig): void {
  ensureConfigDirectory()

  const path = configPath()
  const tmp = `${path}.tmp`
  const payload = `${JSON.stringify(config, null, 2)}\n`

  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, payload, 0, 'utf8')
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
      /* already gone; the previous file still stands */
    }
    throw e
  }
}

/** Apply a partial change and persist it, returning the config now in force. */
export function updateAppConfig(patch: Partial<AppConfig>): AppConfig {
  const current = readAppConfig()
  const next: AppConfig = {
    format: CONFIG_FORMAT,
    palette:
      typeof patch.palette === 'string' && isKnownPaletteId(patch.palette)
        ? patch.palette
        : current.palette,
    language:
      patch.language === 'tr' || patch.language === 'en' ? patch.language : current.language
  }
  writeAppConfig(next)
  return next
}
