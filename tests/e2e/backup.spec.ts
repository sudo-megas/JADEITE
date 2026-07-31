/**
 * Backup, through the real application — Realisation IX.
 *
 * **What this layer can and cannot reach.** The file picker is an operating-system
 * dialogue owned by the main process, and Playwright drives a renderer. Nothing
 * here can therefore complete a backup or a restore: the round trip — write a
 * container, wipe the vault, restore it, and prove every row came back — lives
 * in `tests/electron/backup-suite.ts`, where a real vault can be built and torn
 * down without a window in the way. The byte-level refusals live in
 * `tests/unit/jbk-container.test.ts`, where they can be exhaustive.
 *
 * The alternative was a test-only environment variable that made the dialogues
 * answer with a fixed path. It was rejected: it would have shipped a way to
 * make JADEITE write the owner's vault to a location nobody chose, in the
 * production binary, to save writing the same proof one layer down.
 *
 * What is left is exactly what only this layer can prove — that the page
 * exists, that it speaks both languages, and that the door out of a dead vault
 * is on the screens a dead vault actually shows.
 */

import { expect, test } from '@playwright/test'

import { createVaultAndEnter, launchFresh, unlockAndEnter, type Session } from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

test('the backup page opens from the rail and reports a vault that has never been backed up', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-backup').click()
  await expect(session.page.getByTestId('backup-panel')).toBeVisible()

  await expect(session.page.getByTestId('backup-last')).toHaveText(/Hiç alınmadı/)
  await expect(session.page.getByTestId('backup-count')).toHaveText('0')

  // Reminders are off in a fresh vault (§15). A prompt the owner never asked
  // for is a nag; the one mandated prompt is the credential-change one.
  await expect(session.page.getByTestId('backup-reminder-off')).toHaveAttribute(
    'data-selected',
    'true'
  )

  // And the rail carries no overdue mark, because nothing is overdue when no
  // cadence has been chosen.
  await expect(session.page.getByTestId('backup-overdue')).toHaveCount(0)
})

test('the truth table ships in Turkish and in English', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-backup').click()
  await expect(session.page.getByTestId('truth-table')).toBeVisible()

  // Three rows, and the third is the one that says there is no way in. It is
  // asserted by name because a page that quietly lost it would be describing a
  // different application (§4.4).
  await expect(session.page.getByTestId('truth-healthy')).toContainText(/her yedek/i)
  await expect(session.page.getByTestId('truth-lost')).toContainText(/kurtarma anahtarına/i)
  await expect(session.page.getByTestId('truth-both')).toContainText(/arka kapı/i)

  // The live figure: recovery key #1 is in force in a vault that has never been
  // reset, which is what turns a contract into an instruction.
  await expect(session.page.getByTestId('truth-generation')).toContainText('1')

  await session.page.getByTestId('nav-settings').click()
  await session.page.getByTestId('language-en').click()
  await session.page.getByTestId('nav-backup').click()

  await expect(session.page.getByTestId('truth-healthy')).toContainText(/every backup/i)
  await expect(session.page.getByTestId('truth-lost')).toContainText(/recovery key/i)
  await expect(session.page.getByTestId('truth-both')).toContainText(/no bypass/i)
})

test('a reminder cadence is written into the vault and survives a relaunch', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-backup').click()
  await session.page.getByTestId('backup-reminder-30').click()
  await expect(session.page.getByTestId('backup-reminder-30')).toHaveAttribute(
    'data-selected',
    'true'
  )

  // A vault with a cadence and no backup at all is overdue immediately — that
  // is the state the reminder most exists for, and it must be visible without
  // waiting thirty days for it.
  await expect(session.page.getByTestId('backup-overdue-note')).toBeVisible()
  await expect(session.page.getByTestId('backup-overdue')).toBeVisible()

  session = await session.relaunch()
  await unlockAndEnter(session)
  await session.page.getByTestId('nav-backup').click()

  await expect(session.page.getByTestId('backup-reminder-30')).toHaveAttribute(
    'data-selected',
    'true'
  )
})

test('the restore door is on the lock screen, before anything is unlocked', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-lock').click()
  await expect(session.page.getByTestId('submit')).toBeVisible()

  // §4.4's second row is the disk-death case. A restore reachable only from an
  // open vault would be a restore for the one situation that never needed one.
  await session.page.getByTestId('restore-entry').click()
  await expect(session.page.getByTestId('restore-screen')).toBeVisible()
  await expect(session.page.getByTestId('restore-choose')).toBeEnabled()

  await session.page.getByTestId('restore-back').click()
  await expect(session.page.getByTestId('submit')).toBeVisible()
})

test('the restore door is on the first-run screen, where a new machine lands', async () => {
  session = await launchFresh()

  // No vault exists, so the app offers to create one — which is precisely what
  // a replacement disk and a second machine do not want (§15, machine transfer).
  await expect(session.page.getByTestId('password-confirm')).toBeVisible()

  await session.page.getByTestId('restore-entry').click()
  await expect(session.page.getByTestId('restore-screen')).toBeVisible()

  await session.page.getByTestId('restore-back').click()
  await expect(session.page.getByTestId('password-confirm')).toBeVisible()
})
