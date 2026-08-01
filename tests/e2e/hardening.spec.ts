/**
 * The §3.3 hardening posture, checked from inside the renderer itself.
 *
 * These assert what an attacker who reached the renderer would actually find,
 * rather than what the configuration claims.
 */

import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

import { createVaultAndEnter, launchFresh, type Session } from './fixtures.js'

let session: Session

test.beforeEach(async () => {
  session = await launchFresh()
})

test.afterEach(async () => {
  await session?.close()
})

test('the renderer has no Node.js reachable from it', async () => {
  const exposure = await session.page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    module: typeof (globalThis as Record<string, unknown>)['module'],
    Buffer: typeof (globalThis as Record<string, unknown>)['Buffer'],
    global: typeof (globalThis as Record<string, unknown>)['global']
  }))

  expect(exposure).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    Buffer: 'undefined',
    global: 'undefined'
  })
})

test('the bridge exposes the contract and nothing more', async () => {
  const surface = await session.page.evaluate(() => {
    const api = window.jadeite
    return {
      top: Object.keys(api).sort(),
      vault: Object.keys(api.vault).sort(),
      settings: Object.keys(api.settings).sort(),
      config: Object.keys(api.config).sort(),
      section1: Object.keys(api.section1).sort(),
      section2: Object.keys(api.section2).sort(),
      section3: Object.keys(api.section3).sort(),
      section4: Object.keys(api.section4).sort(),
      backup: Object.keys(api.backup).sort()
    }
  })

  expect(surface.top).toEqual([
    'backup',
    'config',
    'section1',
    'section2',
    'section3',
    'section4',
    'settings',
    'vault'
  ])
  expect(surface.vault).toEqual(['create', 'lock', 'onLocked', 'reset', 'status', 'unlock'])
  expect(surface.settings).toEqual(['get', 'set'])
  expect(surface.config).toEqual(['get', 'set'])

  // Section 1 arrives with Realisation III. Enumerated rather than merely
  // present, so a method added without thought fails this test on purpose.
  expect(surface.section1).toEqual([
    'addCategory',
    'categoryUsage',
    'createYear',
    'deleteCategory',
    'deleteYear',
    'renameCategory',
    'reorderCategories',
    'retypeCategory',
    'setAccentOverride',
    'setEntry',
    'workspace',
    'yearUsage',
    'years'
  ])

  // Section 2 arrives with Realisation IV, enumerated for the same reason, and
  // loses three channels to point revision v0.8b. There is no `years`, no
  // `createYear` and no `setArchived`, and no year argument anywhere in what is
  // left: §7.1 and §7.3 as amended make Ödemeler one standing grid of the twelve
  // months the owner is living in, so there is no year to open, none to create
  // and none to freeze into an archive. It never had deleteYear or
  // setAccentOverride either — a year and its accent belong to the vault, and
  // both have their one home in Section 1, which keeps its years.
  expect(surface.section2).toEqual([
    'addBank',
    'bankUsage',
    'deleteBank',
    'grid',
    'renameBank',
    'reorderBanks',
    'setCell',
    'setCounterParty',
    'setCreditLimit'
  ])

  // Section 3 arrives with Realisation V, enumerated for the same reason.
  // There is no `years` and no year argument anywhere in it: the valuables
  // ledger is a lifetime rather than a workspace. And there is one read rather
  // than three, because holdings derive from the transactions and the prices
  // together and must not be assembled from two separate crossings.
  // `refreshPrices` joins at Realisation VII and is the only method in the whole
  // bridge that reaches outside the machine. It hangs here rather than opening a
  // top-level `prices` namespace: a live price is a fact about a valuable, and
  // the enumeration above is a list of what Section 3 may be asked, not of where
  // the answers come from. It takes no argument, so there is nothing the
  // renderer can say about what gets requested.
  expect(surface.section3).toEqual([
    'addPerson',
    'addTransaction',
    'clearManualPrice',
    'deletePerson',
    'deleteTransaction',
    'ledger',
    'personUsage',
    'refreshPrices',
    'renamePerson',
    'reorderPersons',
    'setManualPrice',
    'setPersonColour',
    'updateTransaction'
  ])

  // Section 4 arrives with Realisation VI, enumerated for the same reason, and
  // shrinks to three when its list of labelled lines becomes a grid of boxes
  // (§9, amended). The smallest surface in the application: total, average and
  // median are computed in the renderer from the cells, so no channel exists to
  // fetch them — and a grid of fixed boxes has nothing to add and no order to
  // rearrange, so the five channels that did are gone rather than renamed.
  expect(surface.section4).toEqual(['cells', 'clear', 'setCell'])

  // Backup arrives with Realisation IX, enumerated for the same reason. It is
  // the only top-level namespace added since Realisation II, and the only one
  // whose methods answer while the vault is shut — §4.4's second row is the
  // disk-death case, and a restore reachable only from an open vault would be a
  // restore for the one situation that never needed it.
  //
  // What is *not* here is the point of the shape. There is no `create(path)`
  // and no `selected()` returning one: both dialogues run in the main process,
  // the chosen container waits there between `select` and `restore`, and the
  // renderer is told what is in it and nothing about where it came from. The
  // filesystem assertion below is what that buys.
  expect(surface.backup).toEqual(['cancel', 'create', 'restore', 'select', 'status'])
})

test('Section 1 is unreachable while the vault is locked', async () => {
  // The grid is behind the lock like everything else that touches money.
  const workspace = await session.page.evaluate(() =>
    window.jadeite.section1.workspace(2026)
  )
  expect(workspace).toEqual({ ok: false, error: 'LOCKED' })

  const years = await session.page.evaluate(() => window.jadeite.section1.years())
  expect(years).toEqual({ ok: false, error: 'LOCKED' })
})

test('Section 2 is unreachable while the vault is locked', async () => {
  // The Payments grid is behind the lock for the same reason. One read, because
  // there is one thing to read: the year index this case also asked for went
  // with the years themselves at point revision v0.8b, and `grid` now takes no
  // argument — the grid is the whole section.
  const grid = await session.page.evaluate(() => window.jadeite.section2.grid())
  expect(grid).toEqual({ ok: false, error: 'LOCKED' })

  // A write is refused as firmly as a read.
  const written = await session.page.evaluate(() =>
    window.jadeite.section2.setCell({ month: 1, bankId: 1, amount: 1000 })
  )
  expect(written).toEqual({ ok: false, error: 'LOCKED' })
})

test('no key material or filesystem path is reachable through the bridge', async () => {
  const status = await session.page.evaluate(() => window.jadeite.vault.status())
  expect(Object.keys(status).sort()).toEqual(['exists', 'locked'])
})

test('backup answers while the vault is locked, and refuses what it has not been given', async () => {
  const results = await session.page.evaluate(async () => ({
    // Behind the lock, because the log and the reminder cadence live inside the
    // vault like every other setting that is not appearance (§4.1).
    status: await window.jadeite.backup.status(),
    // Not behind it. This is the channel a dead disk uses, and there is no vault
    // on this machine to open first — so it must be reachable, and it must
    // refuse cleanly when nothing has been chosen rather than assume something
    // has.
    restore: await window.jadeite.backup.restore(null),
    cancel: await window.jadeite.backup.cancel()
  }))

  expect(results.status).toEqual({ ok: false, error: 'LOCKED' })
  expect(results.restore).toEqual({ ok: false, error: 'NO_CANDIDATE' })
  expect(results.cancel).toEqual({ ok: true, value: null })
})

test('a malformed credential reaches the backup channel as a wrong one, not a crash', async () => {
  const results = await session.page.evaluate(async () => {
    const api = window.jadeite as unknown as {
      backup: { restore(v: unknown): Promise<unknown>; create(v: unknown): Promise<unknown> }
    }
    return {
      numberCredential: await api.backup.restore(12345),
      objectCredential: await api.backup.restore({ evil: true }),
      // A reason the contract does not name must not open a file dialogue.
      badReason: await api.backup.create('exfiltrate')
    }
  })

  expect(results.numberCredential).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })
  expect(results.objectCredential).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })
  expect(results.badReason).toEqual({ ok: false, error: 'INTERNAL' })
})

test('settings are refused while the vault is locked', async () => {
  const result = await session.page.evaluate(() => window.jadeite.settings.get('language'))
  expect(result).toEqual({ ok: false, error: 'LOCKED' })
})

test('a malformed IPC payload is refused rather than crashing the app', async () => {
  const results = await session.page.evaluate(async () => {
    const api = window.jadeite as unknown as {
      vault: { unlock(v: unknown): Promise<unknown>; create(v: unknown): Promise<unknown> }
    }
    return {
      nullPassword: await api.vault.unlock(null),
      numberPassword: await api.vault.unlock(12345),
      objectPassword: await api.vault.create({ evil: true })
    }
  })

  expect(results.nullPassword).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })
  expect(results.numberPassword).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })
  expect(results.objectPassword).toEqual({ ok: false, error: 'WEAK_PASSWORD' })

  // Still alive and still responsive.
  expect(await session.page.evaluate(() => window.jadeite.vault.status())).toEqual({
    exists: false,
    locked: true
  })
})

test('the renderer cannot reach the network', async () => {
  const outcome = await session.page.evaluate(async () => {
    try {
      await fetch('https://example.com/', { mode: 'no-cors' })
      return 'allowed'
    } catch (e) {
      return `blocked: ${(e as Error).name}`
    }
  })
  expect(outcome).toMatch(/^blocked/)
})

test('a strict content security policy is in force', async () => {
  const policy = await session.page.evaluate(
    () =>
      document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content') ?? ''
  )

  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain("connect-src 'none'")
  expect(policy).toContain("object-src 'none'")
  expect(policy).toContain("frame-ancestors 'none'")
  expect(policy).not.toContain('unsafe-eval')
})

test('inline script injection is refused by the policy', async () => {
  const executed = await session.page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>)['__jadeiteInjected'] = false
    const script = document.createElement('script')
    script.textContent = 'window.__jadeiteInjected = true'
    document.head.appendChild(script)
    return (window as unknown as Record<string, unknown>)['__jadeiteInjected']
  })
  expect(executed).toBe(false)
})

test('the renderer may write the settings it owns, and no others', async () => {
  await createVaultAndEnter(session)

  const results = await session.page.evaluate(async () => {
    const api = window.jadeite
    return {
      // The three the interface actually changes.
      autoLock: await api.settings.set('auto_lock_minutes', '15'),
      priceRefresh: await api.settings.set('price_refresh_minutes', '30'),
      reminder: await api.settings.set('backup_reminder_days', '30'),

      // The vault's lineage names which vault a backup came from, and §4.4's
      // first row rests on it: a renderer able to write it could make this
      // vault's own backups demand a credential, which is the opposite of what
      // the truth table promises. It is minted by a migration and by nothing
      // else (`lineage.ts`).
      lineage: await api.settings.set('vault_id', '0'.repeat(32)),
      // The section stamps are kept by triggers, and a merge chooser will one
      // day believe them.
      stamp: await api.settings.set('s3_touched_at', '2099-01-01T00:00:00.000Z'),
      // Written by Section 1 when a year is created, and never from here.
      anchor: await api.settings.set('accent_anchor_year', '1900'),

      // Reading is allow-listed too, and separately: the reminder cadence is
      // written here and read back through `backup.status()`.
      readAutoLock: await api.settings.get('auto_lock_minutes'),
      readLineage: await api.settings.get('vault_id')
    }
  })

  expect(results.autoLock).toEqual({ ok: true, value: null })
  expect(results.priceRefresh).toEqual({ ok: true, value: null })
  expect(results.reminder).toEqual({ ok: true, value: null })

  expect(results.lineage).toEqual({ ok: false, error: 'INTERNAL' })
  expect(results.stamp).toEqual({ ok: false, error: 'INTERNAL' })
  expect(results.anchor).toEqual({ ok: false, error: 'INTERNAL' })

  expect(results.readAutoLock).toEqual({ ok: true, value: '15' })
  expect(results.readLineage).toEqual({ ok: false, error: 'INTERNAL' })

  // The refusals are refusals and not silent no-ops: a backup taken now still
  // knows it belongs to this vault, so §4.4 row 1 still applies to it.
  const candidateOfThisVault = await session.page.evaluate(() =>
    window.jadeite.backup.restore(null)
  )
  expect(candidateOfThisVault).toEqual({ ok: false, error: 'NO_CANDIDATE' })
})

test('a config write that fails carries no filesystem path back', async () => {
  await createVaultAndEnter(session)

  // Make the write fail for real, rather than asserting about a path that was
  // never produced. `writeFileAtomic` rethrows, and an Electron handler's
  // exception is serialised into the renderer's rejected `invoke()` — message
  // included. This is the one handler in `ipc.ts` that had no guard.
  // The mechanism has to fail on both platforms, and a read-only directory does
  // not: on Windows `chmod` reaches only the read-only attribute of a file, so
  // 0o500 against a directory changes nothing at all and the write this test is
  // about would quietly succeed — leaving the assertions to pass for the wrong
  // reason. A non-empty directory standing where `config.json` belongs refuses
  // the rename on either system, at the same point of the same function.
  const occupied = session.configPath
  mkdirSync(join(occupied, 'not-a-config-file'), { recursive: true })
  try {
    const outcome = await session.page.evaluate(async () => {
      try {
        const value = await window.jadeite.config.set({ palette: 'nord-dark' })
        return { rejected: false, keys: Object.keys(value).sort(), text: JSON.stringify(value) }
      } catch (error) {
        return { rejected: true, keys: [], text: String(error) }
      }
    })

    expect(outcome.rejected, 'the handler resolved rather than throwing').toBe(false)
    expect(outcome.keys).toEqual(['format', 'language', 'palette'])
    expect(outcome.text).not.toContain('/')
    expect(outcome.text).not.toContain('EACCES')
  } finally {
    rmSync(occupied, { recursive: true, force: true })
  }
})

test('two credential ceremonies at once are queued, not run together', async () => {
  await createVaultAndEnter(session)
  await session.page.getByTestId('nav-lock').click()
  await session.page.getByTestId('submit').waitFor()

  // Argon2id is 256 MiB a derivation (§4.2). Eight at once were measured at
  // 1268 MiB against 243 MiB for one, so the channels that run one are
  // serialised. What must survive that queue is correctness: each attempt is
  // answered on its own merits, and the wrong password does not become right
  // by arriving beside a correct one.
  const answers = await session.page.evaluate(async () => {
    const attempts = [
      window.jadeite.vault.unlock('not-the-password'),
      window.jadeite.vault.unlock('kuyumcu-defteri-2026'),
      window.jadeite.vault.unlock('also-not-the-password')
    ]
    return Promise.all(attempts)
  })

  expect(answers[0]).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })
  expect(answers[1]).toEqual({ ok: true, value: null })
  // The third arrives after the vault is already open and is still judged on
  // its own credential. A failed attempt returns before it touches the session,
  // so it neither succeeds by proximity nor closes what the second one opened.
  expect(answers[2]).toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })

  // Asked of the main process rather than of the screen: these three crossings
  // bypassed the lock screen's form, so the renderer has no reason to have
  // moved on, and asserting that it had would be testing the wrong half.
  const status = await session.page.evaluate(() => window.jadeite.vault.status())
  expect(status, 'the correct password opened it, and the wrong ones did not shut it').toEqual({
    exists: true,
    locked: false
  })
})
