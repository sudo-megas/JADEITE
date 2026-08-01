/**
 * `config.json` — the unencrypted half of the split.
 *
 * This file is hand-editable by construction, so the tests that matter are
 * the ones about hostile and broken content.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  CONFIG_FORMAT,
  configDirectory,
  configPath,
  readAppConfig,
  updateAppConfig,
  writeAppConfig
} from '../../src/main/config/app-config.js'
import { DEFAULT_APP_CONFIG } from '../../src/shared/ipc-contract.js'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'jadeite-config-'))
  process.env['XDG_CONFIG_HOME'] = home
  process.env['JADEITE_CONFIG_HOME'] = home
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env['XDG_CONFIG_HOME']
  delete process.env['JADEITE_CONFIG_HOME']
})

describe('where it lives', () => {
  it('sits under the config home, not beside the vault', () => {
    expect(configDirectory()).toBe(join(home, 'jadeite'))
    expect(configPath()).toBe(join(home, 'jadeite', 'config.json'))
  })

  it('honours the override when it changes', () => {
    process.env['JADEITE_CONFIG_HOME'] = join(home, 'elsewhere')
    expect(configDirectory()).toBe(join(home, 'elsewhere', 'jadeite'))
  })

  // XDG is the POSIX branch's own convention and the win32 branch never consults
  // it. Asserting it on every platform is what let this suite address the
  // owner's real configuration when it ran on Windows.
  it.skipIf(process.platform === 'win32')('honours XDG_CONFIG_HOME where XDG applies', () => {
    delete process.env['JADEITE_CONFIG_HOME']
    process.env['XDG_CONFIG_HOME'] = join(home, 'elsewhere')
    expect(configDirectory()).toBe(join(home, 'elsewhere', 'jadeite'))
  })

  it.runIf(process.platform === 'win32')('takes APPDATA on Windows, and ignores XDG', () => {
    delete process.env['JADEITE_CONFIG_HOME']
    process.env['XDG_CONFIG_HOME'] = join(home, 'ignored')
    expect(configDirectory()).toBe(join(process.env['APPDATA'] as string, 'jadeite'))
  })
})

describe('reading', () => {
  it('returns defaults when nothing has been written', () => {
    expect(readAppConfig()).toEqual({ ...DEFAULT_APP_CONFIG, format: CONFIG_FORMAT })
  })

  it('defaults to Turkish and Default Dark — the same as the fallbacks', () => {
    const config = readAppConfig()
    expect(config.language).toBe('tr')
    expect(config.palette).toBe('default-dark')
  })

  it('round-trips what was written', () => {
    writeAppConfig({ format: CONFIG_FORMAT, palette: 'nord', language: 'en' })
    expect(readAppConfig()).toEqual({ format: CONFIG_FORMAT, palette: 'nord', language: 'en' })
  })
})

describe('a file someone edited by hand', () => {
  const write = (content: string): void => {
    updateAppConfig({}) // create the directory
    writeFileSync(configPath(), content)
  }

  it('survives outright garbage', () => {
    write('this is not json')
    expect(readAppConfig()).toEqual({ ...DEFAULT_APP_CONFIG, format: CONFIG_FORMAT })
  })

  it('survives a JSON array where an object belongs', () => {
    write('[1, 2, 3]')
    expect(readAppConfig().palette).toBe('default-dark')
  })

  it('falls back on an unknown palette rather than propagating it', () => {
    write(JSON.stringify({ format: 1, palette: 'solarized-fuchsia', language: 'tr' }))
    expect(readAppConfig().palette).toBe('default-dark')
  })

  it('falls back on an unsupported language', () => {
    write(JSON.stringify({ format: 1, palette: 'nord', language: 'de' }))
    const config = readAppConfig()
    expect(config.language).toBe('tr')
    // The valid half of the file is still honoured.
    expect(config.palette).toBe('nord')
  })

  it('ignores extra keys somebody added', () => {
    write(JSON.stringify({ format: 1, palette: 'nord', language: 'en', vaultPassword: 'nice try' }))
    expect(Object.keys(readAppConfig()).sort()).toEqual(['format', 'language', 'palette'])
  })

  it('survives a byte-order mark, which is what a Windows editor leaves behind', () => {
    write(`\uFEFF${JSON.stringify({ format: 1, palette: 'nord', language: 'en' })}`)
    expect(readAppConfig()).toEqual({ format: CONFIG_FORMAT, palette: 'nord', language: 'en' })
  })

  it('survives nulls in every field', () => {
    write(JSON.stringify({ format: null, palette: null, language: null }))
    expect(readAppConfig()).toEqual({ ...DEFAULT_APP_CONFIG, format: CONFIG_FORMAT })
  })
})

describe('writing', () => {
  it('creates the directory if it is absent', () => {
    expect(existsSync(configDirectory())).toBe(false)
    writeAppConfig({ format: CONFIG_FORMAT, palette: 'nord', language: 'tr' })
    expect(existsSync(configPath())).toBe(true)
  })

  it('leaves no temporary file behind', () => {
    writeAppConfig({ format: CONFIG_FORMAT, palette: 'nord', language: 'tr' })
    expect(existsSync(`${configPath()}.tmp`)).toBe(false)
  })

  // POSIX mode bits only. Windows reports 0o666 from `mode & 0o777` whatever the
  // ACL underneath says, and the mode argument to `openSync` is ignored there;
  // what keeps this file the owner's business on Windows is the profile ACL on
  // %APPDATA%, which no chmod of ours would improve.
  it.skipIf(process.platform === 'win32')('is owner-only on disk', () => {
    writeAppConfig({ format: CONFIG_FORMAT, palette: 'nord', language: 'tr' })
    // 0o600: this is not secret, but it is nobody else's business either.
    expect(statSync(configPath()).mode & 0o777).toBe(0o600)
  })

  it('writes readable JSON — the owner may look at it', () => {
    writeAppConfig({ format: CONFIG_FORMAT, palette: 'nord', language: 'en' })
    const text = readFileSync(configPath(), 'utf8')
    expect(text).toContain('\n')
    expect(JSON.parse(text)).toEqual({ format: 1, palette: 'nord', language: 'en' })
  })
})

describe('updating', () => {
  it('changes one field and leaves the other alone', () => {
    writeAppConfig({ format: CONFIG_FORMAT, palette: 'nord', language: 'en' })
    expect(updateAppConfig({ palette: 'catppuccin-mocha' })).toEqual({
      format: CONFIG_FORMAT,
      palette: 'catppuccin-mocha',
      language: 'en'
    })
  })

  it('refuses an unknown palette and keeps what was there', () => {
    writeAppConfig({ format: CONFIG_FORMAT, palette: 'nord', language: 'tr' })
    expect(updateAppConfig({ palette: 'not-a-palette' }).palette).toBe('nord')
  })

  it('refuses an unsupported language and keeps what was there', () => {
    writeAppConfig({ format: CONFIG_FORMAT, palette: 'nord', language: 'en' })
    expect(updateAppConfig({ language: 'klingon' as 'tr' }).language).toBe('en')
  })

  it('persists what it returns', () => {
    updateAppConfig({ palette: 'kanagawa-lotus', language: 'en' })
    expect(readAppConfig()).toEqual({
      format: CONFIG_FORMAT,
      palette: 'kanagawa-lotus',
      language: 'en'
    })
  })
})

describe('what it does and does not hold', () => {
  it('never contains anything about money or credentials', () => {
    updateAppConfig({ palette: 'nord', language: 'en' })
    const raw = readFileSync(configPath(), 'utf8')
    for (const forbidden of ['password', 'recovery', 'dek', 'salt', 'amount', 'balance']) {
      expect(raw.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('holds exactly three fields, so its blast radius is obvious', () => {
    updateAppConfig({})
    expect(Object.keys(JSON.parse(readFileSync(configPath(), 'utf8'))).sort()).toEqual([
      'format',
      'language',
      'palette'
    ])
  })
})
