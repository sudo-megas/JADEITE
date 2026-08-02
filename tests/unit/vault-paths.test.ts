/**
 * Where the vault lives — XJADEITE §5.1, and the one thing in this project that
 * must never move by accident.
 *
 * This file exists because Realisation XI took the cover away without meaning
 * to. `JADEITE_DATA_HOME` was added so that a Windows test run could not
 * address the owner's real vault — `XDG_DATA_HOME` is inert on the win32
 * branch, and the first `test:vault` run there proved it by writing one. Every
 * suite now sets the override, which is right; the side effect is that the XDG
 * branch below it became unreachable from any test in the tree, and that is the
 * branch every real Linux install takes.
 *
 * So the assertions here are about the two paths the suites can no longer
 * reach: XDG when it is set, and `~/.local/share` when it is not.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { databasePath, envelopePath, vaultDirectory } from '../../src/main/vault/paths.js'

// `XDG_CONFIG_HOME` is here because one case below sets it — to prove the vault
// path never consults it — and a test that mutates an environment variable it
// does not restore leaks into every test after it.
const KEYS = [
  'JADEITE_DATA_HOME',
  'XDG_DATA_HOME',
  'XDG_CONFIG_HOME',
  'HOME',
  'LOCALAPPDATA'
] as const

let saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {}

beforeEach(() => {
  saved = {}
  for (const key of KEYS) saved[key] = process.env[key]
})

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('where the vault lives', () => {
  it('takes the override before anything else, on every platform', () => {
    process.env['JADEITE_DATA_HOME'] = join('/tmp', 'jadeite-override-test')
    process.env['XDG_DATA_HOME'] = join('/tmp', 'jadeite-ignored')

    expect(vaultDirectory()).toBe(join('/tmp', 'jadeite-override-test', 'jadeite'))
    expect(databasePath()).toBe(join('/tmp', 'jadeite-override-test', 'jadeite', 'jadeite.db'))
    expect(envelopePath()).toBe(join('/tmp', 'jadeite-override-test', 'jadeite', 'jadeite.keys'))
  })

  it('ignores an empty override rather than resolving against nothing', () => {
    process.env['JADEITE_DATA_HOME'] = ''
    process.env['XDG_DATA_HOME'] = join('/tmp', 'jadeite-xdg-test')

    // An empty variable is set-but-meaningless. Taking it literally would put
    // the vault at `jadeite/` relative to whatever the working directory
    // happened to be, which is how a vault gets written somewhere nobody looks.
    expect(isAbsolute(vaultDirectory())).toBe(true)
    expect(vaultDirectory()).not.toBe('jadeite')
  })

  // The branch a real Linux install takes, and the one no suite reaches any
  // more now that they all set the override.
  it.skipIf(process.platform === 'win32')('honours XDG_DATA_HOME where XDG applies', () => {
    delete process.env['JADEITE_DATA_HOME']
    process.env['XDG_DATA_HOME'] = join('/tmp', 'jadeite-xdg-test')

    expect(vaultDirectory()).toBe(join('/tmp', 'jadeite-xdg-test', 'jadeite'))
  })

  it.skipIf(process.platform === 'win32')('falls back to ~/.local/share with no XDG set', () => {
    delete process.env['JADEITE_DATA_HOME']
    delete process.env['XDG_DATA_HOME']

    // `HOME` is moved to a directory this test owns rather than left alone.
    // Asserting against `homedir()` would compare the function's own answer
    // with itself: both sides would read the same variable, and the home
    // component would be proved by tautology. Only the suffix would be checked.
    const home = mkdtempSync(join(tmpdir(), 'jadeite-home-'))
    try {
      process.env['HOME'] = home
      expect(homedir()).toBe(home)
      expect(vaultDirectory()).toBe(join(home, '.local', 'share', 'jadeite'))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === 'win32')('never consults XDG_CONFIG_HOME — the split is the point', () => {
    delete process.env['JADEITE_DATA_HOME']
    process.env['XDG_DATA_HOME'] = join('/tmp', 'jadeite-data')
    process.env['XDG_CONFIG_HOME'] = join('/tmp', 'jadeite-config')

    expect(vaultDirectory()).toBe(join('/tmp', 'jadeite-data', 'jadeite'))
  })

  it.runIf(process.platform === 'win32')('takes LOCALAPPDATA on Windows, and ignores XDG', () => {
    delete process.env['JADEITE_DATA_HOME']
    process.env['XDG_DATA_HOME'] = join('/tmp', 'jadeite-ignored')
    process.env['LOCALAPPDATA'] = 'C:\\Users\\test\\AppData\\Local'

    expect(vaultDirectory()).toBe(join('C:\\Users\\test\\AppData\\Local', 'jadeite'))
  })
})
