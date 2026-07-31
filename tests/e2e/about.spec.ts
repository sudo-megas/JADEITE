/**
 * Hakkında, through the real application — point revision v0.9b.
 *
 * Three things live only here. The version and the release date are compiled in
 * by `electron.vite.config.ts` rather than fetched over the bridge, so the only
 * layer that can prove the substitution actually happened is one running the
 * built bundle — under `vitest` those globals are simply undefined, because
 * `vitest.config.ts` is a different config with no `define` of its own.
 *
 * The licence is the second. `__LICENCE_TEXT__` is the repository's own
 * `LICENSE` inlined at build time, and the failure worth catching is not that
 * the text is wrong but that it is absent — an empty `<pre>` behind a control
 * that promises the full licence.
 *
 * The third is that the addresses are inert. `session.ts` denies `window.open`
 * unconditionally and `will-navigate` admits only local schemes, so a link here
 * would be a dead control rather than a security hole; the page renders plain
 * text instead, and this asserts there is no anchor to click.
 */

import { expect, test } from '@playwright/test'

import { createVaultAndEnter, launchFresh, type Session } from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

test('the about page opens from the rail and states the build', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-about').click()
  await expect(session.page.getByTestId('about-panel')).toBeVisible()

  await expect(session.page.getByTestId('about-creator')).toHaveText('sudo-megas')
  await expect(session.page.getByTestId('about-licence-name')).toHaveText('GPL-3.0-only')

  // The version is the manifest's, substituted at build time. Two digits and a
  // patch, never the literal token.
  const version = await session.page.getByTestId('about-version').textContent()
  expect(version).toMatch(/^\d+\.\d+\.\d+$/)

  // §13: dates read GG/AA/YYYY in both languages, and this one is no exception
  // for being a fact about the build rather than about money.
  await expect(session.page.getByTestId('about-released')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/)
})

test('the addresses are text, because nothing here opens an external link', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-about').click()

  await expect(session.page.getByTestId('about-repository')).toHaveText(
    'https://github.com/sudo-megas/JADEITE'
  )
  await expect(session.page.getByTestId('about-readme')).toContainText('#readme')

  // No anchor anywhere on the page: a link the window handler would refuse is
  // worse than no link, because it looks like it should work.
  expect(await session.page.locator('[data-testid="about-panel"] a').count()).toBe(0)
})

test('the licence opens in place and carries the real GPL text', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-about').click()
  await session.page.getByTestId('about-licence-open').click()

  await expect(session.page.getByTestId('about-licence')).toBeVisible()
  const licence = await session.page.getByTestId('about-licence-text').textContent()
  expect(licence).toContain('GNU GENERAL PUBLIC LICENSE')
  expect(licence).toContain('Version 3, 29 June 2007')
  // Long enough to be the licence rather than a summary of it.
  expect((licence ?? '').length).toBeGreaterThan(30_000)

  await session.page.getByTestId('about-licence-close').click()
  await expect(session.page.getByTestId('about-panel')).toBeVisible()
})

test('the page speaks Turkish and English', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)

  await session.page.getByTestId('nav-about').click()
  await expect(session.page.getByTestId('nav-about')).toContainText('Hakkında')
  await expect(session.page.getByTestId('about-panel')).toContainText('Yapımcı')

  await session.page.getByTestId('nav-settings').click()
  await session.page.getByTestId('language-en').click()

  await session.page.getByTestId('nav-about').click()
  await expect(session.page.getByTestId('nav-about')).toContainText('About')
  await expect(session.page.getByTestId('about-panel')).toContainText('Created by')

  // The motto is deliberately the same string in both catalogues — it is the
  // owner's own phrasing, and translating it would be inventing a second one.
  await expect(session.page.getByTestId('about-panel')).toContainText(
    'Built with Passion and Reason'
  )
})
