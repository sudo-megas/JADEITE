/**
 * Realisation VI acceptance for §11, driven through the real application.
 *
 * The ladder asks four things of these charts, and each is checked here against
 * what the running application actually does:
 *
 *   - with a 300 beside 10s the linear view crushes and the log toggle fixes it;
 *   - a deliberately mistyped date is visually obvious on the date axis;
 *   - the charts update live as the Section 3 ledger changes;
 *   - zero manual chart maintenance exists.
 *
 * The last is the one that cannot be asserted by looking at a chart, so it is
 * asserted by what is absent: there is no way to add a point to these charts, and
 * every point that appears got there because a ledger row did.
 */

import { expect, test, type Page } from '@playwright/test'

import { createVaultAndEnter, launchFresh, type Session } from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

async function openSection3(page: Page): Promise<void> {
  await page.getByTestId('nav-section3').click()
  await expect(page.getByTestId('section3')).toBeVisible()
}

async function openAltin(page: Page): Promise<void> {
  await page.getByTestId('nav-altinEgrisi').click()
  await expect(page.getByTestId('altinEgrisi')).toBeVisible()
}

async function addPerson(page: Page, name: string): Promise<void> {
  const list = page.getByTestId('s3-persons').locator('li')
  const before = await list.count()
  await page.getByTestId('s3-new-person-name').fill(name)
  await page.getByTestId('s3-add-person').click()
  await expect(list).toHaveCount(before + 1)
}

/**
 * Add a gold acquisition through the ledger's append row.
 *
 * `person` is optional and defaults to leaving the field alone, which means the
 * row lands with Ortak (§8.1) — the same thing the interface does.
 */
async function acquire(
  page: Page,
  date: string,
  grams: string,
  pricePerGram: string,
  person?: string
): Promise<void> {
  const before = await page.getByTestId('s3-ledger').locator('tbody tr').count()
  await page.getByTestId('s3-new-date').fill(date)
  await page.getByTestId('s3-new-type').selectOption('gram')
  await page.getByTestId('s3-new-direction').selectOption('acquire')
  await page.getByTestId('s3-new-denomination').fill(grams)
  await page.getByTestId('s3-new-price').fill(pricePerGram)
  if (person) await page.getByTestId('s3-new-person').selectOption({ label: person })
  await page.getByTestId('s3-new-price').press('Enter')
  await expect(page.getByTestId('s3-ledger').locator('tbody tr')).toHaveCount(before + 1)
}

/** The date span the Spektrum chart is actually drawing, in days. */
async function spanDays(page: Page): Promise<number> {
  const value = await page.getByTestId('altin-spektrum').getAttribute('data-span-days')
  return Number(value ?? '0')
}

test('the charts say where their data comes from when there is none', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openAltin(page)

  // Not an error and not an empty pair of axes — an explanation.
  await expect(page.getByTestId('altin-empty')).toBeVisible()
  await expect(page.getByTestId('altin-spektrum')).toHaveCount(0)
})

test('the charts derive from the ledger, and follow it as it changes', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')
  await acquire(page, '15/01/2026', '10', '5.000,00')

  await openAltin(page)
  await expect(page.getByTestId('altin-empty')).toHaveCount(0)
  await expect(page.getByTestId('altin-spektrum')).toBeVisible()
  await expect(page.getByTestId('altin-frekans')).toBeVisible()
  await expect(page.getByTestId('altin-market')).toBeVisible()

  // One event, so no span yet.
  expect(await spanDays(page)).toBe(0)

  // Add a second purchase a year later and come back: the charts have followed,
  // with nothing having been maintained in between.
  await openSection3(page)
  await acquire(page, '15/01/2027', '10', '7.000,00')
  await openAltin(page)

  expect(await spanDays(page)).toBe(365)
})

/**
 * §11's own example, and the reason the toggle exists.
 *
 * 300 g beside a run of 10 g is the shape that made the owner divide by a
 * thousand. The application now notices the ratio itself and says so, and the
 * toggle changes the axis rather than the data.
 */
test('a 300 among 10s is crushed on a linear axis, and the log toggle fixes it', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')
  await acquire(page, '15/10/2023', '300', '1.865,00')
  await acquire(page, '15/01/2026', '10', '5.000,00')
  await acquire(page, '15/02/2026', '10', '5.200,00')
  await acquire(page, '15/03/2026', '10', '5.400,00')

  await openAltin(page)

  // The application detects that the linear view is crushing the small bars.
  await expect(page.getByTestId('altin-crushed-hint')).toBeVisible()
  await expect(page.getByTestId('altin-frekans')).toHaveAttribute('data-scale', 'linear')

  await page.getByTestId('altin-log-toggle').check()

  await expect(page.getByTestId('altin-frekans')).toHaveAttribute('data-scale', 'log')
  await expect(page.getByTestId('altin-spektrum')).toHaveAttribute('data-scale', 'log')
  // The hint has done its job and gets out of the way.
  await expect(page.getByTestId('altin-crushed-hint')).toHaveCount(0)

  // The market-value chart stays linear, and says why rather than just differing.
  await expect(page.getByTestId('altin-market')).toHaveAttribute('data-scale', 'linear')
  await expect(page.getByTestId('altin-market-linear-note')).toBeVisible()
})

/**
 * §18.3 item 6: a row whose price proves its date is wrong. On a category axis it
 * would be the next bar along; on a true date axis it is three years out of place,
 * and the span the chart reports is how far.
 */
test('a mistyped date is obvious on the date axis', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')
  await acquire(page, '15/01/2026', '10', '5.000,00')
  await acquire(page, '15/02/2026', '10', '5.200,00')

  await openAltin(page)
  const tight = await spanDays(page)
  expect(tight).toBe(31)

  // Now a year typed as 2016 rather than 2026 — one digit, ten years.
  await openSection3(page)
  await acquire(page, '15/03/2016', '10', '5.400,00')
  await openAltin(page)

  const stretched = await spanDays(page)
  expect(stretched).toBeGreaterThan(3600)
  // The axis is an order of magnitude wider than the real data, which is exactly
  // what makes the stray point impossible to miss.
  expect(stretched / tight).toBeGreaterThan(100)
})

test('a provisional date is called out, because the curve misleads there', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  await page.getByTestId('s3-new-date').fill('15/10/2023')
  await page.getByTestId('s3-new-denomination').fill('300')
  await page.getByTestId('s3-new-price').fill('1.865,00')
  await page.getByTestId('s3-new-provisional').check()
  await page.getByTestId('s3-new-price').press('Enter')
  await expect(page.getByTestId('s3-date-1-provisional')).toBeChecked()

  await openAltin(page)
  await expect(page.getByTestId('altin-provisional-note')).toBeVisible()
})

test('the filters narrow the charts without touching the ledger', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')
  await addPerson(page, 'Kişi B')

  await acquire(page, '15/01/2026', '10', '5.000,00', 'Kişi A')
  await acquire(page, '15/01/2029', '10', '9.000,00', 'Kişi B')

  await openAltin(page)
  expect(await spanDays(page)).toBeGreaterThan(1000)

  // Narrowed to Kişi A, only her single purchase remains, so the span collapses.
  await page.getByTestId('altin-person-filter-2').click()
  expect(await spanDays(page)).toBe(0)

  // Narrowed instead to Ortak, who has no rows at all, the charts say so rather
  // than drawing an empty pair of axes.
  await page.getByTestId('altin-person-filter-2').click()
  await page.getByTestId('altin-person-filter-1').click()
  await expect(page.getByTestId('altin-empty')).toBeVisible()

  // And back to everyone.
  await page.getByTestId('altin-person-filter-all').click()
  expect(await spanDays(page)).toBeGreaterThan(1000)

  // The ledger itself is untouched by any of it.
  await openSection3(page)
  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveCount(2)
})

test('there is no way to add a point to a chart — zero maintenance exists', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')
  await acquire(page, '15/01/2026', '10', '5.000,00')
  await openAltin(page)

  // No field, no append row, no import. The whole surface is a toggle and two
  // filters, and every one of them only ever narrows what the ledger already says.
  await expect(page.getByTestId('altinEgrisi').locator('input[type="text"]')).toHaveCount(0)
  await expect(page.getByTestId('altinEgrisi').locator('form')).toHaveCount(0)
})
