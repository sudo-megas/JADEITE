/**
 * Realisation II acceptance, driven through the real application.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import { PALETTES } from '../../src/shared/theme/palettes/index.js'
import {
  TEST_PASSWORD,
  createVaultAndEnter,
  launchFresh,
  unlockAndEnter,
  type Session
} from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

/** The value of a custom property as the document actually resolved it. */
async function tokenValue(s: Session, name: string): Promise<string> {
  return (
    await s.page.evaluate(
      (prop) => getComputedStyle(document.documentElement).getPropertyValue(prop).trim(),
      name
    )
  ).toLowerCase()
}

test('every one of the ten palettes renders the shell', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  await session.page.getByTestId('nav-settings').click()
  await expect(session.page.getByTestId('settings-panel')).toBeVisible()

  expect(PALETTES).toHaveLength(10)

  for (const palette of PALETTES) {
    await session.page.getByTestId(`palette-${palette.id}`).click()

    // The document reports the palette it is actually wearing.
    expect(await session.page.evaluate(() => document.documentElement.dataset['palette'])).toBe(
      palette.id
    )
    expect(await session.page.evaluate(() => document.documentElement.dataset['mode'])).toBe(
      palette.mode
    )

    // Every token resolved, and to this palette's values.
    expect(await tokenValue(session, '--surface')).toBe(palette.tokens.surface.toLowerCase())
    expect(await tokenValue(session, '--text')).toBe(palette.tokens.text.toLowerCase())
    expect(await tokenValue(session, '--accent')).toBe(palette.tokens.accent.toLowerCase())

    // And the shell is still legible rather than merely present.
    const painted = await session.page.evaluate(() => {
      const body = getComputedStyle(document.body)
      return { background: body.backgroundColor, colour: body.color }
    })
    expect(painted.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(painted.colour).not.toBe('')
    await expect(session.page.getByTestId('settings-panel')).toBeVisible()
  }
})

test('the lock screen wears the chosen palette, not a fallback', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-settings').click()
  await session.page.getByTestId('palette-nord').click()
  expect(await tokenValue(session, '--surface')).toBe('#2e3440')

  await session.page.getByTestId('nav-lock').click()
  await expect(session.page.getByTestId('submit')).toBeVisible()

  // Appearance lives in config.json, outside the vault, so locking does not
  // take it away — this is the reason that file exists.
  expect(await session.page.evaluate(() => document.documentElement.dataset['palette'])).toBe(
    'nord'
  )
  expect(await tokenValue(session, '--surface')).toBe('#2e3440')

  await unlockAndEnter(session)
  expect(await tokenValue(session, '--surface')).toBe('#2e3440')
})

test('a relaunched app shows the chosen palette before any password is typed', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  await session.page.getByTestId('nav-settings').click()
  await session.page.getByTestId('palette-catppuccin-mocha').click()
  await session.page.getByTestId('language-en').click()

  session = await session.relaunch()
  await expect(session.page.getByTestId('submit')).toBeVisible()

  // Still locked, and already correct in both respects.
  expect(await tokenValue(session, '--surface')).toBe('#1e1e2e')
  await expect(session.page.getByTestId('submit')).toHaveText('Unlock')
  expect(await session.page.evaluate(() => document.documentElement.lang)).toBe('en')

  await unlockAndEnter(session)
  expect(await tokenValue(session, '--surface')).toBe('#1e1e2e')
})

test('config.json holds appearance and nothing else', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  await session.page.getByTestId('nav-settings').click()
  await session.page.getByTestId('palette-nord').click()
  await session.app.close()

  const config = JSON.parse(readFileSync(session.configPath, 'utf8'))
  expect(Object.keys(config).sort()).toEqual(['format', 'language', 'palette'])
  expect(config.palette).toBe('nord')

  // It lives outside the data directory, so §4.1 still holds there.
  expect(readdirSync(session.vaultDir).sort()).toEqual(['jadeite.db', 'jadeite.keys'])
})

test('a hand-edited config falls back rather than propagating nonsense', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  await session.app.close()

  writeFileSync(
    session.configPath,
    JSON.stringify({ format: 1, palette: 'not-a-palette', language: 'klingon' })
  )

  session = await session.relaunch()
  await expect(session.page.getByTestId('submit')).toBeVisible()
  expect(await session.page.evaluate(() => document.documentElement.dataset['palette'])).toBe(
    'default-dark'
  )
  expect(await session.page.evaluate(() => document.documentElement.lang)).toBe('tr')
})

test('language changes only by hand', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  // Turkish is primary and the default.
  await expect(session.page.getByTestId('nav-section1')).toHaveText(/Gelir & Gider/)
  expect(await session.page.evaluate(() => document.documentElement.lang)).toBe('tr')

  await session.page.getByTestId('nav-settings').click()
  await session.page.getByTestId('language-en').click()
  await expect(session.page.getByTestId('nav-section1')).toHaveText(/Income & Expenses/)
  expect(await session.page.evaluate(() => document.documentElement.lang)).toBe('en')

  await session.page.getByTestId('language-tr').click()
  await expect(session.page.getByTestId('nav-section1')).toHaveText(/Gelir & Gider/)
})

test('the OS locale is ignored — the app stays Turkish under LANG=en_US.UTF-8', async () => {
  session = await launchFresh({
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    LANGUAGE: 'en_US:en'
  })
  await createVaultAndEnter(session)

  await expect(session.page.getByTestId('nav-section1')).toHaveText(/Gelir & Gider/)
  expect(await session.page.evaluate(() => document.documentElement.lang)).toBe('tr')

  // And the numbers follow the app language, not the machine's.
  await session.page.getByTestId('nav-settings').click()
  await expect(session.page.getByTestId('sample-try')).toHaveText('1.234,56 ₺')
  await expect(session.page.getByTestId('sample-date')).toHaveText('18.05.2026')
})

test('a chosen English stays English under a Turkish OS locale, and persists', async () => {
  session = await launchFresh({ LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' })
  await createVaultAndEnter(session)
  await session.page.getByTestId('nav-settings').click()
  await session.page.getByTestId('language-en').click()

  session = await session.relaunch({ LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' })
  await unlockAndEnter(session, TEST_PASSWORD)
  await expect(session.page.getByTestId('nav-section1')).toHaveText(/Income & Expenses/)
})

test('the six destinations exist and the keyboard map reaches them', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  for (const [index, id] of [
    'section1',
    'section2',
    'section3',
    'section4',
    'overview',
    'altinEgrisi'
  ].entries()) {
    await session.page.keyboard.press(`Control+${index + 1}`)
    // Everything but the Overview is furnished by Realisation VI; that one
    // arrives with Realisation VIII and still says so.
    const furnished = id !== 'overview'
    await expect(session.page.getByTestId(furnished ? id : `stub-${id}`)).toBeVisible()
  }

  await session.page.keyboard.press('Control+Comma')
  await expect(session.page.getByTestId('settings-panel')).toBeVisible()

  await session.page.keyboard.press('Control+l')
  await expect(session.page.getByTestId('submit')).toBeVisible()
})

test('cold start reaches the lock screen inside the §3.4 budget', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  // Relaunch against an existing vault: that is the journey §3.4 budgets,
  // launch to lock screen, with no first-run ceremony in the way.
  session = await session.relaunch()
  await expect(session.page.getByTestId('submit')).toBeVisible()

  const coldStart = session.coldStartMs()
  expect(coldStart, 'the app should report its own cold start').not.toBeNull()
  console.log(`    launch to lock screen: ${coldStart} ms (budget 1500 ms)`)
  expect(coldStart!).toBeLessThanOrEqual(1500)
})

test('unlock reaches the shell inside the §3.4 budget, excluding Argon2id', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  await session.page.getByTestId('nav-lock').click()
  await expect(session.page.getByTestId('submit')).toBeVisible()

  await session.page.getByTestId('password').fill(TEST_PASSWORD)
  const startedAt = Date.now()
  await session.page.getByTestId('submit').click()
  await session.page.getByTestId('shell').waitFor()
  const total = Date.now() - startedAt

  // §3.4 excludes the deliberate Argon2id cost: it is password-entry time and
  // a security feature, not a performance defect.
  const kdf = session.lastUnlockKdfMs()
  expect(kdf, 'the app should report its Argon2id cost').not.toBeNull()
  const interactive = total - kdf!

  console.log(
    `    unlock to shell: ${interactive} ms excluding Argon2id ` +
      `(budget 1000 ms; Argon2id itself took ${kdf} ms of ${total} ms total)`
  )
  expect(interactive).toBeLessThanOrEqual(1000)
})
