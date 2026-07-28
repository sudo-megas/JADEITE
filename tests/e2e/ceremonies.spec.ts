/**
 * The Realisation I ceremonies, driven through the real application.
 *
 * This is the only layer that exercises the context bridge, the IPC contract
 * and the renderer sandbox together — the vault suites stop at the main
 * process.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

import { launchFresh, type Session } from './fixtures.js'

const PASSWORD = 'kuyumcu-defteri-2026'
const NEW_PASSWORD = 'ziynet-ve-ceyrek-9981'
const RECOVERY_KEY_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/

let session: Session

test.afterEach(async () => {
  await session?.close()
})

async function createVault(s: Session, password = PASSWORD): Promise<string> {
  await s.page.getByTestId('password').fill(password)
  await s.page.getByTestId('password-confirm').fill(password)
  await s.page.getByTestId('submit').click()

  const key = s.page.getByTestId('recovery-key')
  await expect(key).toBeVisible()
  const text = (await key.textContent())?.trim() ?? ''
  expect(text).toMatch(RECOVERY_KEY_PATTERN)

  await s.page.getByTestId('recovery-ack').check()
  await s.page.getByTestId('recovery-continue').click()
  await expect(s.page.getByTestId('unlocked')).toBeVisible()
  return text
}

test('first run creates a vault and shows the recovery key exactly once', async () => {
  session = await launchFresh()

  await expect(session.page.getByTestId('submit')).toBeVisible()
  const key = await createVault(session)

  // Two files at rest, per §4.1.
  await session.app.close()
  expect(readdirSync(session.vaultDir).sort()).toEqual(['jadeite.db', 'jadeite.keys'])

  // The key is nowhere in the envelope.
  const envelope = readFileSync(join(session.vaultDir, 'jadeite.keys'), 'utf8')
  expect(envelope).not.toContain(key.replace(/-/g, ''))
})

test('the continue button stays disabled until the key is acknowledged', async () => {
  session = await launchFresh()

  await session.page.getByTestId('password').fill(PASSWORD)
  await session.page.getByTestId('password-confirm').fill(PASSWORD)
  await session.page.getByTestId('submit').click()

  await expect(session.page.getByTestId('recovery-key')).toBeVisible()
  await expect(session.page.getByTestId('recovery-continue')).toBeDisabled()
  await session.page.getByTestId('recovery-ack').check()
  await expect(session.page.getByTestId('recovery-continue')).toBeEnabled()
})

test('mismatched passwords are refused before any vault is made', async () => {
  session = await launchFresh()

  await session.page.getByTestId('password').fill(PASSWORD)
  await session.page.getByTestId('password-confirm').fill('something-else-entirely')
  await session.page.getByTestId('submit').click()

  await expect(session.page.getByTestId('error')).toHaveText(/eşleşmiyor/)
  await expect(session.page.getByTestId('recovery-key')).toHaveCount(0)
})

test('a short password is refused', async () => {
  session = await launchFresh()

  await session.page.getByTestId('password').fill('kisa')
  await session.page.getByTestId('password-confirm').fill('kisa')
  await session.page.getByTestId('submit').click()

  await expect(session.page.getByTestId('error')).toHaveText(/en az 8 karakter/)
})

test('the vault locks and reopens only with the right password', async () => {
  session = await launchFresh()
  await createVault(session)

  await session.page.getByTestId('lock-now').click()
  await expect(session.page.getByTestId('submit')).toBeVisible()

  await session.page.getByTestId('password').fill('not-the-password')
  await session.page.getByTestId('submit').click()
  await expect(session.page.getByTestId('error')).toHaveText(/hatalı/)
  await expect(session.page.getByTestId('unlocked')).toHaveCount(0)

  await session.page.getByTestId('password').fill(PASSWORD)
  await session.page.getByTestId('submit').click()
  await expect(session.page.getByTestId('unlocked')).toBeVisible()
})

test('a relaunched app opens on the lock screen, not on the vault', async () => {
  session = await launchFresh()
  await createVault(session)

  session = await session.relaunch()
  await expect(session.page.getByTestId('submit')).toBeVisible()
  await expect(session.page.getByTestId('unlocked')).toHaveCount(0)

  await session.page.getByTestId('password').fill(PASSWORD)
  await session.page.getByTestId('submit').click()
  await expect(session.page.getByTestId('unlocked')).toBeVisible()
})

test('the reset ceremony consumes the old key and issues the next', async () => {
  session = await launchFresh()
  const firstKey = await createVault(session)

  await session.page.getByTestId('lock-now').click()
  await session.page.getByTestId('forgot').click()

  await session.page.getByTestId('recovery-key-input').fill(firstKey)
  await session.page.getByTestId('new-password').fill(NEW_PASSWORD)
  await session.page.getByTestId('new-password-confirm').fill(NEW_PASSWORD)
  await session.page.getByTestId('submit').click()

  const secondKey = (await session.page.getByTestId('recovery-key').textContent())?.trim() ?? ''
  expect(secondKey).toMatch(RECOVERY_KEY_PATTERN)
  expect(secondKey).not.toBe(firstKey)

  await session.page.getByTestId('recovery-ack').check()
  await session.page.getByTestId('recovery-continue').click()
  await expect(session.page.getByTestId('unlocked')).toBeVisible()

  // The old password is dead.
  await session.page.getByTestId('lock-now').click()
  await session.page.getByTestId('password').fill(PASSWORD)
  await session.page.getByTestId('submit').click()
  await expect(session.page.getByTestId('error')).toHaveText(/hatalı/)

  // The new one works.
  await session.page.getByTestId('password').fill(NEW_PASSWORD)
  await session.page.getByTestId('submit').click()
  await expect(session.page.getByTestId('unlocked')).toBeVisible()

  // And the old recovery key is dead on its second use.
  await session.page.getByTestId('lock-now').click()
  await session.page.getByTestId('forgot').click()
  await session.page.getByTestId('recovery-key-input').fill(firstKey)
  await session.page.getByTestId('new-password').fill('a-third-password-here')
  await session.page.getByTestId('new-password-confirm').fill('a-third-password-here')
  await session.page.getByTestId('submit').click()
  await expect(session.page.getByTestId('error')).toHaveText(/hatalı/)
})

test('a mistyped recovery key is reported as malformed, not as wrong', async () => {
  session = await launchFresh()
  const key = await createVault(session)

  await session.page.getByTestId('lock-now').click()
  await session.page.getByTestId('forgot').click()

  const mistyped = key.slice(0, -1) + (key.endsWith('Z') ? 'Y' : 'Z')
  await session.page.getByTestId('recovery-key-input').fill(mistyped)
  await session.page.getByTestId('new-password').fill(NEW_PASSWORD)
  await session.page.getByTestId('new-password-confirm').fill(NEW_PASSWORD)
  await session.page.getByTestId('submit').click()

  await expect(session.page.getByTestId('error')).toHaveText(/geçersiz/)
})
