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

test('a frozen year is read-only, lossless, and reopens', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection2(page)

  await buildInspectedShape(page)

  await page.getByTestId('s2-freeze').click()
  await page.getByTestId('s2-confirm-freeze-yes').click()
  await expect(page.getByTestId('s2-frozen-banner')).toBeVisible()

  // Every figure survives the freeze untouched.
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText(GRAND_TOTAL_DEBT)
  await expect(page.getByTestId('s2-total-remaining-limit')).toHaveText(TOTAL_REMAINING_LIMIT)

  // Nothing offers to change it: no add-column form, no column menus.
  await expect(page.getByTestId('s2-add-column')).toHaveCount(0)
  await expect(page.getByTestId('s2-column-menu-A')).toHaveCount(0)

  // The cells are readable — an archive is something to read — but not writable.
  const cell = page.getByTestId('s2-cell-A-Ocak')
  await expect(cell).toBeVisible()
  await expect(cell).toHaveAttribute('readonly', '')

  await page.getByTestId('s2-reopen').click()
  await expect(page.getByTestId('s2-frozen-banner')).toHaveCount(0)

  // Reopened, unchanged, and editable again.
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText(GRAND_TOTAL_DEBT)
  await typeCell(page, 'A', 'Şubat', '250')
  await expect(page.getByTestId('s2-debt-A')).toHaveText('1.250,00 ₺')
})

test('a new year carries the banks over and clears the amounts', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection2(page)

  await buildInspectedShape(page)
  const firstYear = Number(await page.locator('[data-testid^="s2-year-"]').first().innerText())

  await page.getByTestId('s2-add-year').click()
  await page.getByTestId('s2-new-year-submit').click()
  await expect(page.getByTestId(`s2-workspace-${firstYear + 1}`)).toBeVisible()

  // Definitions carried, including the limits and the counter's person.
  await expect(page.getByTestId('s2-header-A')).toBeVisible()
  await expect(page.getByTestId('s2-header-sayacA')).toBeVisible()
  // A regex, because the value carries the non-breaking space formatMoney puts
  // before the symbol and toHaveValue does not normalise whitespace.
  await expect(page.getByTestId('s2-limit-A')).toHaveValue(/^200\.000,00\s₺$/)
  await expect(page.getByTestId('s2-party-sayacA')).toHaveValue('Sayaç A')

  // Amounts never.
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText('0,00 ₺')
  await expect(page.getByTestId('s2-total-remaining-limit')).toHaveText('350.000,00 ₺')

  // And the year it came from is untouched, and not frozen by the act.
  await page.getByTestId(`s2-year-${firstYear}`).click()
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText(GRAND_TOTAL_DEBT)
  await expect(page.getByTestId('s2-frozen-banner')).toHaveCount(0)
})

test('each section keeps its own open year', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  // Give Section 1 a second year, so there are two to disagree about.
  await page.getByTestId('nav-section1').click()
  const firstYear = Number(await page.locator('[data-testid^="year-2"]').first().innerText())
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()

  // Section 2 opens on the newest too, then is moved back a year.
  await openSection2(page)
  await page.getByTestId(`s2-year-${firstYear}`).click()
  await expect(page.getByTestId(`s2-workspace-${firstYear}`)).toBeVisible()

  // Section 1 is where it was left. One shared year would have dragged it back.
  await page.getByTestId('nav-section1').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()
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
  await page.getByTestId('s2-freeze').click()
  await page.getByTestId('s2-confirm-freeze-yes').click()
  await page.getByTestId('s2-reopen').click()
  await typeCell(page, 'A', 'Mart', '75,50')

  expect(complaints, complaints.join('\n')).toEqual([])
})
