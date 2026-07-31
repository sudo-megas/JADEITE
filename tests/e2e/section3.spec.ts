/**
 * Realisation V acceptance, driven through the real application.
 *
 * The four rows typed below are authored from the figures REALISATION.md names,
 * not from the owner's retiring documents — nothing in this repository opens
 * those (XJADEITE §18.2). Three acquisitions and one disposal, exactly as the
 * acceptance line words it, arranged so the disposal consumes an early lot
 * entirely and leaves a later one whole. That is the case which distinguishes
 * oldest-lot-first cost basis from every other reading, and it is the case the
 * owner's real history is.
 *
 * Every figure below is read back off the screen rather than computed here, so
 * what passes is what the owner would see.
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

/**
 * A person's name is an editable field, so it is a value rather than text —
 * `getByText` would never find it. The list growing by one is what proves the
 * write landed, and the name is then checked where it lives.
 */
async function addPerson(page: Page, name: string): Promise<void> {
  const list = page.getByTestId('s3-persons').locator('li')
  const before = await list.count()

  await page.getByTestId('s3-new-person-name').fill(name)
  await page.getByTestId('s3-add-person').click()

  await expect(list).toHaveCount(before + 1)
  await expect(list.last().locator('input.s3-person-name')).toHaveValue(name)
}

/** The coin types of §8.2 — quantity is a count of pieces, not a weight. */
const COIN_TYPES = new Set(['ceyrek', 'yarim', 'tam', 'ata', 'iki_bucuk', 'besli'])

interface Row {
  date: string
  person: string
  type: string
  direction: 'acquire' | 'dispose'
  /** The whole quantity, as it was typed before §8.3's amendment. */
  quantity: string
  price: string
  /**
   * The two factors, for the rows where the split is the point. Given, they are
   * typed verbatim and `quantity` is only documentation. Left alone, a weighable
   * goes in as one chunk of its whole quantity — which is what every figure in
   * this file was written against.
   */
  denomination?: string
  count?: string
}

/**
 * Compose the append row and commit it with Enter, never the mouse.
 *
 * Since §8.3's amendment the quantity is two cells. A coin's denomination is its
 * own type, so its field is disabled and the figure belongs in the count; a
 * weighable takes the figure as its denomination and a count of one.
 */
async function appendRow(page: Page, row: Row): Promise<void> {
  const before = await page.getByTestId('s3-ledger').locator('tbody tr').count()

  await page.getByTestId('s3-new-date').fill(row.date)
  await page.getByTestId('s3-new-type').selectOption(row.type)
  await page.getByTestId('s3-new-direction').selectOption(row.direction)

  if (COIN_TYPES.has(row.type)) {
    await expect(page.getByTestId('s3-new-denomination')).toBeDisabled()
    await page.getByTestId('s3-new-count').fill(row.count ?? row.quantity)
  } else {
    await page.getByTestId('s3-new-denomination').fill(row.denomination ?? row.quantity)
    await page.getByTestId('s3-new-count').fill(row.count ?? '1')
  }

  await page.getByTestId('s3-new-price').fill(row.price)
  await page.getByTestId('s3-new-person').selectOption({ label: row.person })
  await page.getByTestId('s3-new-price').press('Enter')

  await expect(page.getByTestId('s3-ledger').locator('tbody tr')).toHaveCount(before + 1)
}

async function setPrice(page: Page, type: string, value: string): Promise<void> {
  await page.getByTestId('s3-view-prices').click()
  const cell = page.getByTestId(`s3-manual-price-${type}`)
  await cell.click()
  await cell.fill(value)
  await cell.press('Enter')
  await expect(page.getByTestId(`s3-price-stamp-${type}`)).not.toBeEmpty()
}

/**
 * The fixture: Kişi A 10 g cheaply, Kişi A 20 g, Kişi B 10 g, then Kişi A disposes 10 g.
 *
 * Oldest-first takes her January lot whole, leaving her February 20 g at
 * ₺5.900,00 and his 10 g at ₺7.000,00 — ₺118.000 plus ₺70.000, the acceptance
 * cost basis to the kuruş.
 */
async function typeTheFixture(page: Page): Promise<void> {
  await addPerson(page, 'Kişi A')
  await addPerson(page, 'Kişi B')

  await appendRow(page, {
    date: '15/01/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'acquire',
    quantity: '10',
    price: '5.000,00'
  })
  await appendRow(page, {
    date: '20/02/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'acquire',
    quantity: '20',
    price: '5.900,00'
  })
  await appendRow(page, {
    date: '10/03/2026',
    person: 'Kişi B',
    type: 'gram',
    direction: 'acquire',
    quantity: '10',
    price: '7.000,00'
  })
  await appendRow(page, {
    date: '05/04/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'dispose',
    quantity: '10',
    price: '6.500,00'
  })

  await setPrice(page, 'gram', '6.505,00')
}

test('the acceptance figures reconcile through the real interface', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await typeTheFixture(page)

  await page.getByTestId('s3-view-holdings').click()
  await expect(page.getByTestId('s3-holdings')).toBeVisible()

  // The six figures of REALISATION.md's first Realisation V acceptance line.
  await expect(page.getByTestId('s3-grand-cost')).toHaveText('188.000,00 ₺')
  await expect(page.getByTestId('s3-grand-market')).toHaveText('195.150,00 ₺')
  await expect(page.getByTestId('s3-grand-unrealised')).toHaveText('+7.150,00 ₺')

  const kisiA = page.getByTestId('s3-holdings').getByRole('row', { name: /Kişi A/ }).first()
  await expect(kisiA).toContainText('20 g')
  await expect(kisiA).toContainText('130.100,00 ₺')

  const kisiB = page.getByTestId('s3-holdings').getByRole('row', { name: /Kişi B/ }).first()
  await expect(kisiB).toContainText('10 g')
  await expect(kisiB).toContainText('65.050,00 ₺')

  // Thirty grams held, and nothing amiss between the two axes.
  await expect(page.getByTestId('s3-discrepancy')).toHaveCount(0)
  await expect(page.getByTestId('s3-missing-prices')).toHaveCount(0)
})

test('the running quantity column shows the disposal as a cliff', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await typeTheFixture(page)
  await page.getByTestId('s3-view-ledger').click()

  // 10 → 30 → 40 → 30. The car, legible in one column, from one source.
  const running = page.locator('[data-testid^="s3-running-"]')
  await expect(running).toHaveText(['10 g', '30 g', '40 g', '30 g'])
})

test('a disposal reduces holdings without touching cost-basis history', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await typeTheFixture(page)
  // typeTheFixture ends on the prices tab, where the ledger is not drawn.
  await page.getByTestId('s3-view-ledger').click()

  // The February acquisition still shows what it cost on the day, after a
  // disposal has consumed a different lot entirely.
  await expect(page.getByTestId('s3-total-2')).toHaveText('118.000,00 ₺')
})

test('ledger numbering cannot duplicate, and gaps are honest', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  for (const day of ['15', '16', '17']) {
    await appendRow(page, {
      date: `${day}/01/2026`,
      person: 'Kişi A',
      type: 'gram',
      direction: 'acquire',
      quantity: '1',
      price: '5.000,00'
    })
  }

  const numbers = await page.locator('[data-testid^="s3-seq-"]').allTextContents()
  expect(new Set(numbers).size).toBe(numbers.length)
  expect(numbers).toEqual(['1', '2', '3'])

  // Delete the middle one; the survivors keep their own numbers.
  await page.getByTestId('s3-delete-2').click()
  await page.getByTestId('s3-delete-confirm-2').click()
  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveText(['1', '3'])

  // And the next row takes 4, not the 2 that was freed.
  await appendRow(page, {
    date: '18/01/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'acquire',
    quantity: '1',
    price: '5.000,00'
  })
  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveText(['1', '3', '4'])
})

test('a date the calendar does not have is refused at the cell', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)

  await page.getByTestId('s3-new-date').fill('31/02/2026')
  await page.getByTestId('s3-new-denomination').fill('10')
  await page.getByTestId('s3-new-price').fill('5.000,00')
  await page.getByTestId('s3-new-price').press('Enter')

  // Refused, and nothing was written. The refusal is now the cell's own — the
  // renderer has a date parser as of the GG/AA/YYYY revision, so 31 February
  // never leaves the row. It used to travel to the main process and come back
  // as a section error; `cleanDate` still refuses it there, and that second
  // refusal is now a floor rather than the only one.
  await expect(page.getByTestId('s3-append-problem')).toBeVisible()
  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveCount(0)
  // What was typed is still on screen — a refusal never discards a row.
  await expect(page.getByTestId('s3-new-denomination')).toHaveValue('10')
  await expect(page.getByTestId('s3-new-date')).toHaveValue('31/02/2026')
})

test('the provisional flag can be set and cleared per row', async () => {
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

  // Cleared when the owner resolves open item Q1.
  await page.getByTestId('s3-date-1-provisional').uncheck()
  await expect(page.getByTestId('s3-date-1-provisional')).not.toBeChecked()
})

test('disposing more than was acquired is flagged, not clamped', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  await appendRow(page, {
    date: '15/01/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'acquire',
    quantity: '30',
    price: '5.000,00'
  })
  await appendRow(page, {
    date: '20/02/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'dispose',
    quantity: '40',
    price: '6.500,00'
  })

  await page.getByTestId('s3-view-holdings').click()

  // The state the typing sessions of §18.5 pass through, explained rather than
  // hidden: the holding reads −10 g and says why.
  await expect(page.getByTestId('s3-discrepancy')).toBeVisible()
  await expect(page.getByTestId('s3-holdings')).toContainText('-10 g')
})

test('removing a person moves their rows to Ortak and deletes none', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  await appendRow(page, {
    date: '15/01/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'acquire',
    quantity: '30',
    price: '5.000,00'
  })

  await page.getByTestId('s3-delete-person-2').click()
  await expect(page.getByTestId('s3-confirm-delete-person-detail')).toContainText('1')
  await page.getByTestId('s3-confirm-delete-person-yes').click()

  // The row survives; only its owner changed.
  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveCount(1)
  await expect(page.getByTestId('s3-persons').locator('li')).toHaveCount(1)
  await expect(page.getByTestId('s3-person-name-1')).toContainText('Ortak')
})

test('Ortak can be neither renamed nor removed', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)

  // No rename field and no delete button exist for it at all — the refusal is
  // in the interface as well as in the vault. Its name is rendered as text
  // rather than as an input, so there is nothing to type into.
  await expect(page.getByTestId('s3-person-name-1')).toBeVisible()
  await expect(page.locator('input[data-testid="s3-person-name-1"]')).toHaveCount(0)
  await expect(page.getByTestId('s3-delete-person-1')).toHaveCount(0)
})

/**
 * The carried date is selected, not merely focused.
 *
 * With the caret left at the end of it, typing the next purchase's date would
 * append to the last one and make `15/01/202620/02/2026` out of two perfectly
 * good dates. Selecting it means typing replaces and tabbing past keeps, which is
 * the choice every row after the first actually needs.
 */
test('typing after a commit replaces the carried date rather than appending to it', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  await appendRow(page, {
    date: '15/01/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'acquire',
    quantity: '10',
    price: '5.000,00'
  })

  // The caret is back in the date field with the previous date selected.
  await expect(page.getByTestId('s3-new-date')).toHaveValue('15/01/2026')
  await page.keyboard.type('20/02/2026')
  await expect(page.getByTestId('s3-new-date')).toHaveValue('20/02/2026')

  // And the row it produces carries that date, not a concatenation of two.
  await page.keyboard.press('Tab') // date → provisional flag
  await page.keyboard.press('Tab') // flag → type
  await page.keyboard.press('Tab') // type → direction
  await page.keyboard.press('Tab') // direction → denomination
  await page.keyboard.type('20')
  await page.keyboard.press('Tab') // denomination → count, kept at 1
  await page.keyboard.press('Tab') // count → unit price
  await page.keyboard.type('5.900,00')
  await page.keyboard.press('Enter')

  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveCount(2)
  await expect(page.getByTestId('s3-date-2')).toHaveValue('20/02/2026')
})

/**
 * The graded requirement of §6.4, measured rather than asserted.
 *
 * Thirty consecutive rows, every keystroke through the keyboard, and not one
 * dialogue opened along the way. This is the session the owner will actually
 * spend typing four years of history, and friction found here is a defect
 * against this section.
 */
test('thirty consecutive rows go in without the mouse and without a dialogue', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  // The first row is composed by hand to set what the rest inherit: after this,
  // date, type, direction and person all carry forward, so each further row is
  // a quantity, a price and Enter.
  await page.getByTestId('s3-new-date').click()
  await page.keyboard.type('01/01/2026')
  await page.getByTestId('s3-new-person').selectOption({ label: 'Kişi A' })

  await page.getByTestId('s3-new-denomination').click()
  await page.keyboard.type('1')
  await page.keyboard.press('Tab') // denomination → count, left at its default 1
  await page.keyboard.press('Tab') // count → unit price
  await page.keyboard.type('5.000,00')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveCount(1)

  for (let i = 2; i <= 30; i += 1) {
    // The caret is already back in the date field, carrying the previous row's
    // date, so a purchase on the same day needs no date typed at all. The path
    // to the denomination runs date → provisional flag → type → direction, all
    // four of them carried forward or reachable, none of them needing a mouse.
    await page.keyboard.press('Tab') // date → provisional flag
    await page.keyboard.press('Tab') // flag → type
    await page.keyboard.press('Tab') // type → direction
    await page.keyboard.press('Tab') // direction → denomination
    await page.keyboard.type(String(i))
    // §8.3's amendment costs exactly one keystroke per row: the count carries a
    // default of 1, so it is tabbed past rather than typed. That is the price of
    // being able to say two chunks rather than ten grams, and §6.4's promise —
    // thirty rows, no mouse, no dialogue — survives it.
    await page.keyboard.press('Tab') // denomination → count, kept at 1
    await page.keyboard.press('Tab') // count → unit price
    await page.keyboard.type('5.000,00')
    await page.keyboard.press('Enter')

    await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveCount(i)
  }

  // Thirty rows, and every one of them the person the first row named.
  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveCount(30)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Σ 1..30 grams = 465 g, all Kişi A's.
  await page.getByTestId('s3-view-holdings').click()
  await expect(page.getByTestId('s3-holdings')).toContainText('465 g')
})

/**
 * §8.3's amendment, through the running application: the owner's reason for
 * storing a denomination is that two chunks and one chunk are different facts,
 * and the holdings page has to say which it is looking at.
 */
test('holdings say what the gold is physically made of', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  // Two five-gram pieces, not one ten-gram piece.
  await appendRow(page, {
    date: '15/01/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'acquire',
    quantity: '10',
    denomination: '5',
    count: '2',
    price: '5.000,00'
  })

  // The ledger shows both factors and the product it generated from them.
  // `formatGrams` writes a non-breaking space, and unlike `toHaveText`,
  // `toHaveValue` does not normalise whitespace.
  await expect(page.getByTestId('s3-denomination-1')).toHaveValue('5 g')
  await expect(page.getByTestId('s3-count-1')).toHaveValue('2')
  await expect(page.getByTestId('s3-quantity-1')).toHaveText('10 g')

  await page.getByTestId('s3-view-holdings').click()
  const made = page.getByTestId(/^s3-made-/)
  await expect(made).toContainText('2 ×')
  await expect(made).toContainText('5 g')

  // Ten grams either way — the composition is a partition of it, not a rival.
  await expect(page.locator('[data-testid^="s3-qty-"]').first()).toContainText('10 g')
})

test('a disposal that cuts a piece leaves a remainder the page admits to', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  await appendRow(page, {
    date: '15/01/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'acquire',
    quantity: '10',
    price: '5.000,00'
  })
  // Seven grams out of a single ten-gram bar: the three left are not a piece.
  await appendRow(page, {
    date: '20/02/2026',
    person: 'Kişi A',
    type: 'gram',
    direction: 'dispose',
    quantity: '7',
    price: '6.000,00'
  })

  await page.getByTestId('s3-view-holdings').click()
  await expect(page.locator('[data-testid^="s3-qty-"]').first()).toContainText('3 g')

  // Named as loose weight rather than rounded into a piece it is not — and not
  // flagged as a discrepancy, because nothing about the ledger is wrong.
  await expect(page.getByTestId(/^s3-made-/)).toContainText('3 g')
  await expect(page.getByTestId('s3-discrepancy')).toHaveCount(0)
})

/**
 * §8.2 as amended — Tam and Ata are different coins about 3% apart, and the
 * closed list carries both. They must be separately priceable, because pricing
 * one at the other's quote is the error the amendment exists to prevent.
 */
test('Ata and Tam coexist as separate coins with separate prices', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection3(page)
  await addPerson(page, 'Kişi A')

  await appendRow(page, {
    date: '15/01/2026',
    person: 'Kişi A',
    type: 'tam',
    direction: 'acquire',
    quantity: '2',
    price: '40.413,00'
  })
  await appendRow(page, {
    date: '16/01/2026',
    person: 'Kişi A',
    type: 'ata',
    direction: 'acquire',
    quantity: '3',
    price: '41.344,00'
  })

  // A coin's denomination is its own type, so the cell is not editable and the
  // figure went in as a count of pieces.
  await expect(page.getByTestId('s3-count-1')).toHaveValue('2')
  await expect(page.getByTestId('s3-count-2')).toHaveValue('3')

  await setPrice(page, 'tam', '40.413,00')
  await setPrice(page, 'ata', '41.344,00')

  await page.getByTestId('s3-view-holdings').click()
  const holdings = page.getByTestId('s3-holdings')
  await expect(holdings).toContainText('Tam')
  await expect(holdings).toContainText('Ata')

  // Two Tam at ₺40.413 and three Ata at ₺41.344 — separate rows, separate money.
  await expect(page.locator('[data-testid$="-tam"]').first()).toContainText('80.826,00')
  await expect(page.locator('[data-testid$="-ata"]').first()).toContainText('124.032,00')
})
