/**
 * Realisation IV acceptance, driven through the real application.
 *
 * The source workbook's Section 2 *shape* is recreated here by typing into the
 * grid — bank columns with limits, counter columns with people, twelve month
 * lines — with amounts that are nobody's. The workbook stays off this
 * repository, so its figures do too; what is proved is that the five computed
 * figures of §7.1 reconcile through the real UI.
 *
 * The comparison against the workbook itself — what REALISATION IV's first
 * acceptance line actually asks for — lives in scripts/verify-payments.mjs,
 * which reads the gitignored original where it sits on the owner's machine and
 * runs its rows through this same engine.
 */

import { expect, test, type Page } from '@playwright/test'

import { createVaultAndEnter, launchFresh, unlockAndEnter, type Session } from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

async function openSection2(page: Page): Promise<void> {
  await page.getByTestId('nav-section2').click()
  await expect(page.getByTestId('section2')).toBeVisible()
}

async function addBank(page: Page, name: string, limit: string): Promise<void> {
  await page.getByTestId('s2-new-column-name').fill(name)
  await page.getByTestId('s2-new-column-kind').selectOption('bank')
  await page.getByTestId('s2-new-column-limit').fill(limit)
  await page.getByTestId('s2-add-column-submit').click()
  await expect(page.getByTestId(`s2-header-${name}`)).toBeVisible()
}

async function addCounter(page: Page, name: string, party: string): Promise<void> {
  await page.getByTestId('s2-new-column-name').fill(name)
  await page.getByTestId('s2-new-column-kind').selectOption('counter')
  await page.getByTestId('s2-new-column-party').fill(party)
  await page.getByTestId('s2-add-column-submit').click()
  await expect(page.getByTestId(`s2-header-${name}`)).toBeVisible()
}

async function typeCell(page: Page, column: string, month: string, value: string): Promise<void> {
  const cell = page.getByTestId(`s2-cell-${column}-${month}`)
  await cell.click()
  await cell.fill(value)
  await cell.press('Enter')
}

/**
 * Two cards and one counter column — the smallest shape that still tells the
 * two remaining-limit readings apart.
 *
 * Σ limits is 350.000; the cards carry 3.000 between them and the counter takes
 * 500 off the debt. So the grand total is 2.500 while the remaining limit is
 * 347.000 — and *not* 347.500, which is what treating the counter as headroom
 * on a card would produce.
 */
const GRAND_TOTAL_DEBT = '2.500,00 ₺'
const TOTAL_REMAINING_LIMIT = '347.000,00 ₺'

async function buildInspectedShape(page: Page): Promise<void> {
  await addBank(page, 'A', '200000')
  await addBank(page, 'B', '150000')
  await addCounter(page, 'Sayaç A', 'Sayaç A')

  await typeCell(page, 'A', 'Ocak', '1000')
  await typeCell(page, 'B', 'Aralık', '2000')
  await typeCell(page, 'Sayaç A', 'Aralık', '500')
}

test('recreates the source’s shape and reaches both acceptance figures', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection2(page)

  await buildInspectedShape(page)

  // Twelve month lines, always.
  await expect(page.locator('[data-testid^="s2-month-row-"]')).toHaveCount(12)

  // The two figures REALISATION.md names, computed by the engine.
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText(GRAND_TOTAL_DEBT)
  await expect(page.getByTestId('s2-total-remaining-limit')).toHaveText(TOTAL_REMAINING_LIMIT)

  // The row the total is the total *of*, so the two cannot silently disagree.
  await expect(page.getByTestId('s2-remaining-A')).toHaveText('199.000,00 ₺')
  await expect(page.getByTestId('s2-remaining-B')).toHaveText('148.000,00 ₺')

  // A counter column has no limit, so it has no remainder — not a zero.
  await expect(page.getByTestId('s2-remaining-Sayaç A')).toHaveCount(0)

  // Per-bank debt, and the counter coming off the month rather than the row.
  await expect(page.getByTestId('s2-debt-A')).toHaveText('1.000,00 ₺')
  await expect(page.getByTestId('s2-debt-Sayaç A')).toHaveText('500,00 ₺')
  await expect(page.getByTestId('s2-total-debt-12')).toContainText('1.500,00 ₺')
})

test('a December value in any bank updates every dependent total', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection2(page)

  await buildInspectedShape(page)

  // The last bank column and the last month: the position and the cell the
  // source sheet's own I16/I18 formulas drop (§18.2 finding 1). Here nothing
  // names a column, so nothing can leave one out.
  await typeCell(page, 'B', 'Aralık', '5000')

  await expect(page.getByTestId('s2-debt-B')).toHaveText('5.000,00 ₺')
  await expect(page.getByTestId('s2-remaining-B')).toHaveText('145.000,00 ₺')
  await expect(page.getByTestId('s2-total-debt-12')).toContainText('4.500,00 ₺')
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText('5.500,00 ₺')
  await expect(page.getByTestId('s2-total-remaining-limit')).toHaveText('344.000,00 ₺')
})

/*
 * There is no frozen year here any more, and no new-year carry-over, and no
 * tests for either.
 *
 * Until point revision v0.8b Ödemeler held a grid per year, and two cases stood
 * in this place. The first proved that freezing a year turned it into a
 * read-only archive that lost nothing — every figure identical, the add-column
 * form and the column menus withdrawn, the cells readable but `readonly` — and
 * that reopening it gave the year back intact and editable. The second proved
 * that creating the next year carried the column *definitions* forward, limits
 * and counter parties included, while carrying no amount at all, and left the
 * year it came from untouched and unfrozen.
 *
 * §7.1 and §7.3 as amended leave one standing grid of the twelve months the
 * owner is living in: previous years' bank debts are not logged, so there is
 * nothing to archive and no next year to carry into. The capabilities were
 * removed rather than hidden — `s2-freeze`, `s2-reopen`, `s2-frozen-banner`,
 * `s2-add-year` and the year chips are gone from the interface, and
 * `setArchived`, `createYear` and `years` are gone from the Section 2 bridge
 * (`tests/e2e/hardening.spec.ts` enumerates what is left). Nothing in the
 * section is read-only any longer, so no case below needs to assert that a cell
 * is writable; every one of them writes to one.
 */

/**
 * Section 1's years and Ödemeler's grid are unrelated tables.
 *
 * This case used to prove something weaker. Both sections held years, so what
 * mattered was that each kept its *own* open one — checking an old instalment
 * plan was not allowed to drag the income grid back to 2019 and leave it there.
 * Point revision v0.8b removed the years from Section 2 rather than the
 * independence, and what is left is stronger and simpler: creating a year in
 * Section 1 does not touch Ödemeler at all. `createYear` copies Section 1's own
 * columns from the nearest earlier year and has never had anything to say about
 * banks; the standing grid is not a party to it.
 *
 * The grid is read *after* navigating back, and that round trip is the point.
 * Section 2 loads from the vault on mount, so what is checked here is what the
 * vault holds — not a React state that was never given the chance to be
 * disturbed.
 */
test('a year created in Section 1 leaves Ödemeler untouched', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  // One column and one amount: the smallest thing there is to lose.
  await openSection2(page)
  await addBank(page, 'A', '200000')
  await typeCell(page, 'A', 'Ocak', '1000')
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText('1.000,00 ₺')

  // The year has to actually arrive. Without this line the case passes just as
  // happily over an `add-year` that quietly did nothing, and a test that cannot
  // fail is not a test.
  await page.getByTestId('nav-section1').click()
  const firstYear = Number(await page.locator('[data-testid^="year-2"]').first().innerText())
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()

  // The same column and the same amount, in the one pane Ödemeler now has.
  await openSection2(page)
  await expect(page.getByTestId('s2-workspace')).toBeVisible()
  await expect(page.getByTestId('s2-header-A')).toBeVisible()
  // Regexes, because these values carry the non-breaking space formatMoney puts
  // before the symbol and toHaveValue does not normalise whitespace.
  await expect(page.getByTestId('s2-limit-A')).toHaveValue(/^200\.000,00\s₺$/)
  await expect(page.getByTestId('s2-cell-A-Ocak')).toHaveValue(/^1\.000,00\s₺$/)
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText('1.000,00 ₺')
})

test('nothing from the Payments grid survives a lock', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection2(page)
  await buildInspectedShape(page)

  await page.getByTestId('nav-lock').click()
  await expect(page.getByTestId('submit')).toBeVisible()

  // The grid is gone from the renderer, not merely hidden behind the lock.
  const leaked = await page.evaluate(() => document.body.innerText)
  expect(leaked).not.toContain('200.000,00')
  expect(leaked).not.toContain('Sayaç A')

  await unlockAndEnter(session)
  await openSection2(page)
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText(GRAND_TOTAL_DEBT)
})

test('English renders the same figures in its own format', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection2(page)
  await buildInspectedShape(page)

  await page.getByTestId('nav-settings').click()
  await page.getByTestId('language-en').click()
  await openSection2(page)

  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText('TRY 2,500.00')
  await expect(page.getByTestId('s2-total-remaining-limit')).toHaveText('TRY 347,000.00')
})

test('the happy path raises no console error — the Definition of Done, checked', async () => {
  session = await launchFresh()
  const page = session.page

  const complaints: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const text = message.text()
      // Delivered by the <meta> CSP, which is deliberate belt-and-braces on top
      // of the header; Chromium notes that one directive of it is ignored there.
      if (text.includes("'frame-ancestors' is ignored")) return
      complaints.push(text)
    }
  })
  page.on('pageerror', (error) => complaints.push(`pageerror: ${error.message}`))

  await createVaultAndEnter(session)
  await openSection2(page)
  await buildInspectedShape(page)
  await typeCell(page, 'A', 'Mart', '75,50')

  /*
    The freeze ceremony used to stand here, for the noise a modal makes going up
    and coming down again. Point revision v0.8b took it away, so the walk goes
    through the one ceremony Section 2 still has: a column menu, the confirmation
    that guards a delete with money behind it, and the grid rebuilding itself a
    column shorter. B carries Aralık, so the confirmation is genuinely raised —
    `requestDelete` skips it for a column with no cells, and a dialog that never
    appeared cannot complain about anything.
  */
  await page.getByTestId('s2-column-menu-B').click()
  await page.getByTestId('s2-delete-B').click()
  await page.getByTestId('s2-confirm-delete-yes').click()
  await expect(page.getByTestId('s2-header-B')).toHaveCount(0)

  expect(complaints, complaints.join('\n')).toEqual([])
})
