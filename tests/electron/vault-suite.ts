/**
 * The four ceremonies of XJADEITE §4, and the Realisation I acceptance list.
 *
 * These run headlessly because nothing in the vault layer imports Electron.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import * as vault from '../../src/main/vault/vault.js'
import { databasePath, envelopePath, vaultDirectory } from '../../src/main/vault/paths.js'
import { readEnvelope } from '../../src/main/vault/envelope.js'
import { parseRecoveryKey } from '../../src/main/vault/recovery-key.js'
import { getSetting, setSetting } from '../../src/main/vault/db/settings.js'
import { SCHEMA_VERSION } from '../../src/main/vault/db/schema.js'

const PASSWORD = 'kuyumcu-defteri-2026'
const NEW_PASSWORD = 'ziynet-ve-ceyrek-9981'

let dataHome: string

beforeEach(() => {
  dataHome = mkdtempSync(join(tmpdir(), 'jadeite-vault-'))
  process.env['XDG_DATA_HOME'] = dataHome
  vault.lock()
})

afterEach(() => {
  vault.lock()
  rmSync(dataHome, { recursive: true, force: true })
})

async function createVault(password = PASSWORD): Promise<string> {
  const result = await vault.create(password)
  expect(result.ok, 'vault creation failed').toBe(true)
  if (!result.ok) throw new Error('unreachable')
  return result.value.recoveryKey
}

describe('first run', () => {
  it('creates a vault and issues recovery key #1', async () => {
    const result = await vault.create(PASSWORD)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.generation).toBe(1)
    expect(parseRecoveryKey(result.value.recoveryKey).ok).toBe(true)
    expect(vault.status()).toEqual({ exists: true, locked: false })
  })

  it('leaves exactly the two files §4.1 permits, once closed', async () => {
    await createVault()
    vault.lock()
    expect(readdirSync(vaultDirectory()).sort()).toEqual(['jadeite.db', 'jadeite.keys'])
  })

  it('refuses to create a second vault over the first', async () => {
    await createVault()
    expect(await vault.create('another-password-entirely')).toEqual({
      ok: false,
      error: 'VAULT_EXISTS'
    })
  })

  it('refuses a password below the floor', async () => {
    expect(await vault.create('short')).toEqual({ ok: false, error: 'WEAK_PASSWORD' })
    expect(vault.status().exists).toBe(false)
  })

  it('seeds the closed valuable-type list and the built-in person', async () => {
    await createVault()
    const db = vault.database()!
    const types = db.prepare('SELECT code FROM valuable_types ORDER BY position').all() as {
      code: string
    }[]
    expect(types.map((t) => t.code)).toEqual([
      'gram',
      'ceyrek',
      'yarim',
      'tam',
      'ata',
      'iki_bucuk',
      'besli',
      'usd',
      'eur',
      'gumus'
    ])
    const ortak = db.prepare("SELECT name, is_builtin FROM persons WHERE name = 'Ortak'").get()
    expect(ortak).toEqual({ name: 'Ortak', is_builtin: 1 })
  })

  /**
   * A fresh vault runs V1 and then V2, so the schema version it lands on is the
   * proof the runner applied more than the initial migration. This is the first
   * Realisation in which that code path has ever executed.
   */
  it('creates a vault at the current schema version, having run every migration', async () => {
    await createVault()
    const db = vault.database()!
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(SCHEMA_VERSION > 1).toBe(true)
  })

  it('keeps security settings, and leaves appearance to config.json', async () => {
    await createVault()
    // Appearance and language deliberately do not live here — they are in the
    // unencrypted config.json, so the lock screen can honour them. What the
    // vault keeps is the security setting.
    expect(getSetting(vault.database()!, 'auto_lock_minutes')).toBe('10')
    expect(getSetting(vault.database()!, 'palette')).toBeNull()
    expect(getSetting(vault.database()!, 'language')).toBeNull()
  })
})

describe('unlocking', () => {
  it('opens with the correct password', async () => {
    await createVault()
    vault.lock()
    expect(vault.status().locked).toBe(true)

    expect(await vault.unlock(PASSWORD)).toEqual({ ok: true, value: null })
    expect(vault.status().locked).toBe(false)
  })

  it('fails cleanly on the wrong password and stays locked', async () => {
    await createVault()
    vault.lock()

    expect(await vault.unlock('definitely-not-it')).toEqual({
      ok: false,
      error: 'WRONG_CREDENTIAL'
    })
    expect(vault.status().locked).toBe(true)
    expect(vault.database()).toBeNull()
  })

  it('reports no vault when none exists', async () => {
    expect(await vault.unlock(PASSWORD)).toEqual({ ok: false, error: 'NO_VAULT' })
  })

  it('survives being locked twice', async () => {
    await createVault()
    vault.lock()
    expect(() => vault.lock()).not.toThrow()
    expect(vault.status().locked).toBe(true)
  })
})

describe('the reset ceremony — §4.3, verbatim', () => {
  it('consumes the old key, issues the next, and kills the old password', async () => {
    const firstKey = await createVault()

    // Something written before the reset, to prove the DEK is untouched by it.
    setSetting(vault.database()!, 'sentinel', 'ALTIN-EGRISI-1035')
    vault.lock()

    const reset = await vault.reset(firstKey, NEW_PASSWORD)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    const secondKey = reset.value.recoveryKey
    expect(reset.value.generation).toBe(2)
    expect(secondKey).not.toBe(firstKey)

    // The DEK never changes for the life of the vault: data written under the
    // old credentials is still there under the new ones.
    expect(getSetting(vault.database()!, 'sentinel')).toBe('ALTIN-EGRISI-1035')
    vault.lock()

    // The old password is dead.
    expect(await vault.unlock(PASSWORD)).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })

    // The new one works.
    expect(await vault.unlock(NEW_PASSWORD)).toEqual({ ok: true, value: null })
    vault.lock()

    // The old recovery key is dead on its second use.
    expect(await vault.reset(firstKey, 'yet-another-password')).toEqual({
      ok: false,
      error: 'WRONG_CREDENTIAL'
    })

    // The new recovery key works, and issues a third.
    const second = await vault.reset(secondKey, 'third-password-here')
    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(second.value.generation).toBe(3)
      expect(second.value.recoveryKey).not.toBe(secondKey)
    }
  })

  it('leaves exactly one valid recovery key at any moment', async () => {
    const first = await createVault()
    vault.lock()
    const reset = await vault.reset(first, NEW_PASSWORD)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    vault.lock()

    expect((await vault.reset(first, 'nope-nope-nope')).ok).toBe(false)
    expect((await vault.reset(reset.value.recoveryKey, 'fine-new-password')).ok).toBe(true)
  })

  it('rejects a mistyped key as malformed, not as a wrong credential', async () => {
    const key = await createVault()
    vault.lock()
    const mistyped = key.slice(0, -1) + (key.endsWith('Z') ? 'Y' : 'Z')
    expect(await vault.reset(mistyped, NEW_PASSWORD)).toEqual({
      ok: false,
      error: 'MALFORMED_RECOVERY_KEY'
    })
  })

  it('refuses a weak new password and changes nothing', async () => {
    const key = await createVault()
    vault.lock()
    expect(await vault.reset(key, 'tiny')).toEqual({ ok: false, error: 'WEAK_PASSWORD' })

    // The original credentials still stand.
    expect(await vault.unlock(PASSWORD)).toEqual({ ok: true, value: null })
    expect(readEnvelope()!.recovery.generation).toBe(1)
  })

  it('accepts the key however the owner writes it down', async () => {
    const key = await createVault()
    vault.lock()
    const asHandwritten = key.toLowerCase().replace(/-/g, ' ').replace(/1/g, 'l').replace(/0/g, 'o')
    expect((await vault.reset(asHandwritten, NEW_PASSWORD)).ok).toBe(true)
  })
})

describe('acceptance: nothing legible reaches the disk', () => {
  it('yields no user data to strings(1)', async () => {
    await createVault()
    const db = vault.database()!
    setSetting(db, 'sentinel', 'ZIYNET-KUYUMCU-SENTINEL-9F3A')
    db.prepare(
      "INSERT INTO persons (name, position) VALUES ('PERSON-A-PERSON-B-TEST', 1)"
    ).run()
    vault.lock()

    const bytes = readFileSync(databasePath())
    expect(bytes.includes('ZIYNET-KUYUMCU-SENTINEL-9F3A')).toBe(false)
    expect(bytes.includes('PERSON-A-PERSON-B-TEST')).toBe(false)
    expect(bytes.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3')

    const strings = execFileSync('strings', [databasePath()], { encoding: 'utf8' })
    expect(strings).not.toContain('ZIYNET-KUYUMCU-SENTINEL-9F3A')
    expect(strings).not.toContain('PERSON-A-PERSON-B-TEST')
    expect(strings).not.toContain('valuable_types')
  })

  it('keeps no secret in the cleartext envelope', async () => {
    const recoveryKey = await createVault()
    const raw = readFileSync(envelopePath(), 'utf8')
    expect(raw).not.toContain(PASSWORD)
    expect(raw).not.toContain(recoveryKey)
    expect(raw).not.toContain(recoveryKey.replace(/-/g, ''))
  })
})

describe('auto-lock', () => {
  it('defaults to ten minutes and follows the setting', async () => {
    await createVault()
    expect(vault.autoLockMinutes()).toBe(10)

    setSetting(vault.database()!, 'auto_lock_minutes', '3')
    expect(vault.autoLockMinutes()).toBe(3)

    // Nonsense in the setting must not disable locking altogether.
    setSetting(vault.database()!, 'auto_lock_minutes', 'yesterday')
    expect(vault.autoLockMinutes()).toBe(10)
    setSetting(vault.database()!, 'auto_lock_minutes', '0')
    expect(vault.autoLockMinutes()).toBe(10)
  })

  it('announces why it locked, so the lock screen can say so', async () => {
    await createVault()
    const reasons: string[] = []
    const stop = vault.onLock((reason) => reasons.push(reason))

    vault.lock('idle')
    // Locking again while already locked must not announce a second time.
    vault.lock('idle')
    expect(reasons).toEqual(['idle'])

    await vault.unlock(PASSWORD)
    vault.lock('manual')
    expect(reasons).toEqual(['idle', 'manual'])

    stop()
    await vault.unlock(PASSWORD)
    vault.lock('manual')
    expect(reasons).toEqual(['idle', 'manual'])
  })

  it('drops the database handle the moment it locks', async () => {
    await createVault()
    expect(vault.isUnlocked()).toBe(true)
    vault.lock('idle')
    expect(vault.isUnlocked()).toBe(false)
    expect(vault.database()).toBeNull()
  })
})

describe('settings live inside the vault', () => {
  it('persists across a lock and unlock', async () => {
    await createVault()
    setSetting(vault.database()!, 'auto_lock_minutes', '3')
    vault.lock()

    expect(await vault.unlock(PASSWORD)).toEqual({ ok: true, value: null })
    expect(getSetting(vault.database()!, 'auto_lock_minutes')).toBe('3')
  })

  it('is unreachable while locked', async () => {
    await createVault()
    vault.lock()
    expect(vault.database()).toBeNull()
  })
})
