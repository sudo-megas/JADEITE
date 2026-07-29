/**
 * Realisation III acceptance, driven through the real application.
 *
 * The retiring workbook's row *shape* is recreated here by typing into the grid
 * — sixteen columns, the same five blanks the sheet had — with amounts that are
 * nobody's. The workbook stays off this repository, so its figures do too; what
 * is proved is that sixteen columns of kuruş total exactly through the real UI.
 *
 * The comparison against the workbook itself — what REALISATION III's first
 * acceptance line actually asks for — lives in scripts/verify-workbook.mjs,
 * which reads the gitignored original where it sits on the owner's machine and
 * runs its rows through this same engine.
 *
 * This doubles as the grid spike's evidence: sixteen columns by twelve rows,
 * grouped headers, editable cells, per-column sort and filter, all exercised
 * against the shape that actually matters.
 */

import { expect, test, type Page } from '@playwright/test'

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

/** Six income and ten expense columns, as the sheet had. */
const INCOME_COLUMNS = [
  'MAAŞ',
  'İKİNCİ MAAŞ',
  'EK DERS',
  'PRİM',
  'KİRA GELİRİ',
  'DİĞER GELİR'
] as const

const EXPENSE_COLUMNS = [
  'KİRA',
  'AİDAT',
  'ELEKTRİK',
  'DOĞALGAZ',
  'İNTERNET',
  'SU',
  'MARKET',
  'BENZİN',
  'SERVİS',
  'KREDİ'
] as const

/**
 * One month typed into that shape. The five columns left out stand where the
 * sheet had blanks and '-' placeholders: absent, not zero (§6.3).
 */
const ONE_MONTH: Record<string, string> = {
  MAAŞ: '71111,11',
  'İKİNCİ MAAŞ': '68888,89',
  'EK DERS': '12345,67',
  PRİM: '9876,54',
  'KİRA GELİRİ': '2222,22',
  'DİĞER GELİR': '1777,78',
  KİRA: '31500',
  AİDAT: '2475,33',
  ELEKTRİK: '419,25',
  DOĞALGAZ: '90,99',
  İNTERNET: '1234,56'
}

const EXPECTED_INCOME_SUBTOTAL = '166.222,21 ₺'
const EXPECTED_NET_TOTAL = '130.502,08 ₺'

async function openSection1(page: Page): Promise<void> {
  await page.getByTestId('nav-section1').click()
  await expect(page.getByTestId('section1')).toBeVisible()
}

async function addColumn(page: Page, name: string, kind: 'income' | 'expense'): Promise<void> {
  await page.getByTestId('new-column-name').fill(name)
  await page.getByTestId('new-column-kind').selectOption(kind)
  await page.getByTestId('add-column-submit').click()
  await expect(page.getByTestId(`header-${name}`)).toBeVisible()
}

async function typeCell(page: Page, column: string, month: string, value: string): Promise<void> {
  const cell = page.getByTestId(`cell-${column}-${month}`)
  await cell.click()
  await cell.fill(value)
  await cell.press('Enter')
}

/** Build the sixteen-column shape in the current year. */
async function buildJulyShape(page: Page): Promise<void> {
  for (const name of INCOME_COLUMNS) await addColumn(page, name, 'income')
  for (const name of EXPENSE_COLUMNS) await addColumn(page, name, 'expense')
}

test('recreates the source workbook’s row shape and totals it to the kuruş', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await buildJulyShape(page)

  // Six income columns and ten expense columns, exactly as the sheet has.
  await expect(page.locator('[data-testid^="header-"]')).toHaveCount(16)

  for (const [column, value] of Object.entries(ONE_MONTH)) {
    await typeCell(page, column, 'Temmuz', value)
  }

  // Both computed figures, from one function instead of a formula copied into
  // every cell.
  await expect(page.getByTestId('subtotal-TRY-7')).toHaveText(EXPECTED_INCOME_SUBTOTAL)
  await expect(page.getByTestId('net-TRY-7')).toHaveText(EXPECTED_NET_TOTAL)

  // July being the only month filled, the year summary says the same.
  await expect(page.getByTestId('year-subtotal-TRY')).toHaveText(EXPECTED_INCOME_SUBTOTAL)
  await expect(page.getByTestId('year-net-TRY')).toHaveText(EXPECTED_NET_TOTAL)

  // The five columns left blank are blank here too, not zero.
  for (const column of ['SU', 'MARKET', 'BENZİN', 'SERVİS', 'KREDİ']) {
    await expect(page.getByTestId(`cell-${column}-Temmuz`)).toHaveValue('')
  }
})

test('the grid draws twelve month rows, grouped headers and the TOTAL pair', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)
  await buildJulyShape(page)

  // Twelve rows, Ocak → Aralık, always all twelve (§6.1).
  await expect(page.locator('[data-testid^="month-row-"]')).toHaveCount(12)

  // Income | Expenses | TOTAL, as three header groups over their columns.
  const groups = page.locator('.s1-grid thead tr:first-child th')
  await expect(groups.filter({ hasText: 'GELİR' }).first()).toBeVisible()
  await expect(groups.filter({ hasText: 'GİDER' }).first()).toBeVisible()
  await expect(groups.filter({ hasText: 'TOPLAM' }).first()).toBeVisible()

  // An all-lira year gets exactly the income-subtotal and net pair §6.2 draws.
  await expect(page.getByTestId('year-subtotal-TRY')).toBeVisible()
  await expect(page.getByTestId('year-net-TRY')).toBeVisible()
  await expect(page.locator('[data-testid^="year-net-"]')).toHaveCount(1)
})

test('a refund renders distinctly and counts against its own category', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'MAAŞ', 'income')
  await addColumn(page, 'ELEKTRİK', 'expense')

  await typeCell(page, 'MAAŞ', 'Mart', '1000')
  await typeCell(page, 'ELEKTRİK', 'Mart', '300')
  await expect(page.getByTestId('net-TRY-3')).toHaveText('700,00 ₺')

  // Mark the expense as a refund: money that came back.
  await page.getByTestId('cell-details-ELEKTRİK-Mart').click()
  await page.getByTestId('cell-refund').check()

  // It counts against its own category, so expenses fall and the net rises.
  await expect(page.getByTestId('net-TRY-3')).toHaveText('1.300,00 ₺')
  // And it never becomes income.
  await expect(page.getByTestId('subtotal-TRY-3')).toHaveText('1.000,00 ₺')

  // Rendered distinctly rather than by a minus sign in the cell.
  //
  // Asserted against what the cell actually looks like, not against the data
  // attribute that drives it: delete the whole refund styling block and a
  // `[data-refund="true"]` assertion stays green, so it would guard nothing.
  const appearance = async (testId: string): Promise<Record<string, string>> =>
    page.getByTestId(testId).evaluate((node) => {
      const input = getComputedStyle(node)
      const cell = getComputedStyle(node.parentElement as HTMLElement)
      return { colour: input.color, style: input.fontStyle, rule: cell.boxShadow }
    })

  const refunded = await appearance('cell-ELEKTRİK-Mart')
  const ordinary = await appearance('cell-MAAŞ-Mart')

  expect(refunded.colour).not.toBe(ordinary.colour)
  expect(refunded.style).toBe('italic')
  expect(refunded.rule).not.toBe(ordinary.rule)
  expect(refunded.rule).not.toBe('none')
  // Still the stored positive amount, formatted: the sign lives in the
  // computation, never in the cell's own text (§5.2).
  await expect(page.getByTestId('cell-ELEKTRİK-Mart')).toHaveValue('300,00\u00A0₺')
})

test('a category retired in year N+1 leaves year N untouched', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'KİRA', 'expense')
  await addColumn(page, 'SERVİS', 'expense')
  await typeCell(page, 'KİRA', 'Ocak', '4300')
  await typeCell(page, 'SERVİS', 'Ocak', '900')

  const firstYear = new Date().getFullYear()
  await expect(page.getByTestId('year-net-TRY')).toHaveText('-5.200,00 ₺')

  // Next year inherits both columns, and none of the amounts.
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()
  await expect(page.getByTestId('header-SERVİS')).toBeVisible()
  await expect(page.getByTestId('cell-KİRA-Ocak')).toHaveValue('')

  // Retire SERVİS in the new year. It holds nothing, so it goes without a
  // dialogue guarding nothing.
  await page.getByTestId('column-menu-SERVİS').click()
  await page.getByTestId('delete-SERVİS').click()
  await expect(page.getByTestId('header-SERVİS')).toHaveCount(0)

  // The previous year still has its column, its cells and its total.
  await page.getByTestId(`year-${firstYear}`).click()
  await expect(page.getByTestId(`workspace-${firstYear}`)).toBeVisible()
  await expect(page.getByTestId('header-SERVİS')).toBeVisible()
  await expect(page.getByTestId('cell-SERVİS-Ocak')).toHaveValue('900,00\u00A0₺')
  await expect(page.getByTestId('year-net-TRY')).toHaveText('-5.200,00 ₺')
})

test('deleting a column that holds data names what it would destroy', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'BENZİN', 'expense')
  await typeCell(page, 'BENZİN', 'Ocak', '1500')
  await typeCell(page, 'BENZİN', 'Şubat', '2500')

  await page.getByTestId('column-menu-BENZİN').click()
  await page.getByTestId('delete-BENZİN').click()

  const detail = page.getByTestId('confirm-delete-detail')
  await expect(detail).toContainText('BENZİN')
  await expect(detail).toContainText('2')
  await expect(detail).toContainText('4.000,00 ₺')

  await page.getByTestId('confirm-delete-yes').click()
  await expect(page.getByTestId('header-BENZİN')).toHaveCount(0)
})

test('sorting reorders the view only, and never moves the year summary', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'MAAŞ', 'income')
  await typeCell(page, 'MAAŞ', 'Ocak', '300')
  await typeCell(page, 'MAAŞ', 'Şubat', '100')
  await typeCell(page, 'MAAŞ', 'Mart', '200')

  const yearTotal = '600,00 ₺'
  await expect(page.getByTestId('year-subtotal-TRY')).toHaveText(yearTotal)

  const firstRowMonth = (): Promise<string | null> =>
    page.locator('.s1-grid tbody tr').first().locator('.s1-month').textContent()

  expect(await firstRowMonth()).toBe('Ocak')

  // Ascending: empty cells sort last, so February leads.
  await page.getByTestId('header-MAAŞ').click()
  expect(await firstRowMonth()).toBe('Şubat')
  await expect(page.getByTestId('year-subtotal-TRY')).toHaveText(yearTotal)

  // Descending.
  await page.getByTestId('header-MAAŞ').click()
  expect(await firstRowMonth()).toBe('Ocak')
  await expect(page.getByTestId('year-subtotal-TRY')).toHaveText(yearTotal)

  // A third click restores calendar order — the order the grid is really about.
  await page.getByTestId('header-MAAŞ').click()
  expect(await firstRowMonth()).toBe('Ocak')
  await expect(page.locator('.s1-grid tbody tr')).toHaveCount(12)
})

test('the TOTAL columns sort too, without disturbing the year’s figure', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'MAAŞ', 'income')
  await typeCell(page, 'MAAŞ', 'Ocak', '300')
  await typeCell(page, 'MAAŞ', 'Şubat', '100')

  const yearNet = '400,00 ₺'
  await expect(page.getByTestId('year-net-TRY')).toHaveText(yearNet)

  // "Which month was worst?" is a question about the net, not about a category.
  await page.getByTestId('total-header-net-TRY').click()
  await page.getByTestId('total-header-net-TRY').click()

  const firstRowMonth = await page
    .locator('.s1-grid tbody tr')
    .first()
    .locator('.s1-month')
    .textContent()
  expect(firstRowMonth).toBe('Ocak')

  await expect(page.getByTestId('year-net-TRY')).toHaveText(yearNet)
  await expect(page.locator('.s1-grid tbody tr')).toHaveCount(12)
})

test('a filter hides rows without ever narrowing the year’s own figure', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'MAAŞ', 'income')
  await typeCell(page, 'MAAŞ', 'Ocak', '300')
  await typeCell(page, 'MAAŞ', 'Şubat', '100')

  await page.getByTestId('column-menu-MAAŞ').click()
  await page.getByTestId('filter-MAAŞ').selectOption('filled')
  await page.keyboard.press('Escape')

  await expect(page.locator('.s1-grid tbody tr')).toHaveCount(2)

  // The filtered subset gets its own line...
  await expect(page.getByTestId('selection-row')).toBeVisible()
  // ...and the year's own total is unmoved by what the view is hiding.
  await expect(page.getByTestId('year-subtotal-TRY')).toHaveText('400,00 ₺')
  await expect(page.getByTestId('year-summary-row')).toBeVisible()

  await page.getByTestId('clear-filters').click()
  await expect(page.locator('.s1-grid tbody tr')).toHaveCount(12)
  await expect(page.getByTestId('selection-row')).toHaveCount(0)
})

test('the parser refuses a negative rather than taking its absolute value', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'ELEKTRİK', 'expense')
  const cell = page.getByTestId('cell-ELEKTRİK-Haziran')
  await cell.click()
  await cell.fill('-600,5')
  await cell.press('Enter')

  // The June-2025 elektrik sign slip, refused at the keystroke where it happened.
  await expect(page.locator('.s1-cell-problem')).toBeVisible()
  await expect(page.getByTestId('year-net-TRY')).toHaveText('0,00 ₺')
})

test('the year workspace wears its own accent, and the anchor never moves it', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  const accentOf = async (): Promise<string> =>
    page.evaluate(() => {
      const node = document.querySelector('[data-testid="section1"]') as HTMLElement | null
      return node ? getComputedStyle(node).getPropertyValue('--year-accent').trim() : ''
    })

  const firstYear = new Date().getFullYear()
  const original = await accentOf()
  expect(original).not.toBe('')

  // Add a year *before* the anchor; the anchor year's own accent must not move.
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-input').fill(String(firstYear - 3))
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear - 3}`)).toBeVisible()

  const earlierAccent = await accentOf()
  expect(earlierAccent).not.toBe(original)

  await page.getByTestId(`year-${firstYear}`).click()
  await expect(page.getByTestId(`workspace-${firstYear}`)).toBeVisible()
  expect(await accentOf()).toBe(original)
})

test('the workspace switch stays smooth, and the incoming year is ready before it moves', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'MAAŞ', 'income')
  const firstYear = new Date().getFullYear()

  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()

  // Measure the frames the switch actually produced rather than asserting that
  // it felt smooth. §3.4's second-scale cold-start budgets do not apply here:
  // a switch is judged per frame.
  const report = await page.evaluate(async () => {
    const frames: number[] = []
    let last = performance.now()
    let running = true

    const tick = (): void => {
      const now = performance.now()
      frames.push(now - last)
      last = now
      if (running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    const chip = document.querySelector('[data-testid="year-' + (new Date().getFullYear()) + '"]')
    ;(chip as HTMLElement | null)?.click()

    await new Promise((resolve) => setTimeout(resolve, 400))
    running = false

    const sorted = [...frames].sort((a, b) => a - b)
    return {
      count: frames.length,
      worst: sorted.at(-1) ?? 0,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0
    }
  })

  console.log(
    `    workspace switch: ${report.count} frames, median ${report.median.toFixed(1)} ms, ` +
      `worst ${report.worst.toFixed(1)} ms`
  )

  // A headless CI display is not the owner's 280 Hz panel, so this is a floor
  // against a switch that janks outright rather than a 3.57 ms budget.
  expect(report.worst).toBeLessThanOrEqual(120)

  // The switch commits with the rows in hand: the grid is there immediately,
  // never an empty pane filled mid-flight.
  await expect(page.getByTestId(`workspace-${firstYear}`)).toBeVisible()
  await expect(page.getByTestId('section1-grid')).toBeVisible()
})

test('a year created earlier than every other inherits nothing', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'MAAŞ', 'income')
  const firstYear = new Date().getFullYear()

  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-input').fill(String(firstYear - 5))
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear - 5}`)).toBeVisible()

  // Borrowing forwards would furnish a historical year with categories the
  // owner had not invented yet.
  await expect(page.getByTestId('section1-empty')).toBeVisible()
})

test('locking forgets the year: Section 1 comes back from the vault, not from memory', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  await addColumn(page, 'MAAŞ', 'income')
  await typeCell(page, 'MAAŞ', 'Ocak', '1000')

  const firstYear = new Date().getFullYear()
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()

  // Deliberately leave the *older* year open. The store keeps the year it was
  // on across a reload, so if anything survived the lock it would reopen here.
  await page.getByTestId(`year-${firstYear}`).click()
  await expect(page.getByTestId(`workspace-${firstYear}`)).toBeVisible()

  await page.getByTestId('nav-lock').click()
  await expect(page.getByTestId('submit')).toBeVisible()

  await unlockAndEnter(session)
  await openSection1(page)

  // Read afresh from the vault, so it opens on the newest year rather than on
  // the one a surviving store still remembered.
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()
  await expect(page.getByTestId('cell-MAAŞ-Ocak')).toHaveValue('')

  // And the older year's data is still there, read back through the vault.
  await page.getByTestId(`year-${firstYear}`).click()
  await expect(page.getByTestId('cell-MAAŞ-Ocak')).toHaveValue('1.000,00 ₺')
})

test('a year’s accent can be overridden and put back to the palette sequence', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  const accentOf = async (): Promise<string> =>
    page.evaluate(() => {
      const node = document.querySelector('[data-testid="section1"]') as HTMLElement | null
      return node ? getComputedStyle(node).getPropertyValue('--year-accent').trim() : ''
    })

  const fromSequence = await accentOf()
  expect(fromSequence).not.toBe('')

  await page.getByTestId('year-menu').click()
  // A different entry in the same palette's sequence — §12.3 keeps an override
  // inside the palette's own character rather than opening an arbitrary picker.
  await page.getByTestId('accent-3').click()
  await expect.poll(accentOf).not.toBe(fromSequence)

  await page.getByTestId('accent-reset').click()
  await expect.poll(accentOf).toBe(fromSequence)
})

test('a year can be deleted, and the last remaining one cannot', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  const firstYear = new Date().getFullYear()

  // With one year, the menu offers no way to remove it.
  await page.getByTestId('year-menu').click()
  await expect(page.getByTestId('delete-year')).toHaveCount(0)
  await page.getByTestId('year-menu').click()

  await addColumn(page, 'MAAŞ', 'income')
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()
  await typeCell(page, 'MAAŞ', 'Ocak', '500')

  await page.getByTestId('year-menu').click()
  await page.getByTestId('delete-year').click()

  // It says what goes, including the reach beyond Section 1.
  const detail = page.getByTestId('confirm-delete-year-detail')
  await expect(detail).toContainText(String(firstYear + 1))
  await expect(detail).toContainText('1')

  await page.getByTestId('confirm-delete-year-yes').click()

  await expect(page.getByTestId(`year-${firstYear + 1}`)).toHaveCount(0)
  await expect(page.getByTestId(`workspace-${firstYear}`)).toBeVisible()
  // The surviving year kept its own column set.
  await expect(page.getByTestId('header-MAAŞ')).toBeVisible()
})

test('the app measures its own workspace switch and says what it found', async () => {
  session = await launchFresh()
  const page = session.page

  const reported: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('[workspace-switch]')) reported.push(message.text())
  })

  await createVaultAndEnter(session)
  await openSection1(page)

  const firstYear = new Date().getFullYear()
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()

  // The measurement is a number the owner can read on the machine in question,
  // which is the only place the 280 Hz acceptance line can honestly be judged.
  await expect.poll(() => reported.length, { timeout: 15_000 }).toBeGreaterThan(0)
  expect(reported[0]).toMatch(/frames=\d+ median=[\d.,]+ ms/)

  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('switch-frames')).toBeVisible()
  await expect(page.getByTestId('switch-hz')).toContainText('Hz')
  await expect(page.getByTestId('switch-median')).toContainText('ms')
})

test('unlock reaches an interactive Section 1 grid inside the §3.4 budget', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page
  await openSection1(page)

  // §3.4's second budget is "successful unlock → interactive Section grid", not
  // unlock → shell chrome. Realisation III is the first rung where that
  // endpoint exists, so it is the first that can honestly measure it. A column
  // has to exist for there to be a grid at all.
  await addColumn(page, 'MAAŞ', 'income')
  await typeCell(page, 'MAAŞ', 'Ocak', '1000')

  await page.getByTestId('nav-lock').click()
  await expect(page.getByTestId('submit')).toBeVisible()

  await page.getByTestId('password').fill(TEST_PASSWORD)
  const startedAt = Date.now()
  await page.getByTestId('submit').click()
  await page.getByTestId('shell').waitFor()
  await page.getByTestId('nav-section1').click()
  // The grid itself, not the section shell: Section1 renders an empty
  // <section data-testid="section1"> while its two vault reads are in flight.
  await page.getByTestId('section1-grid').waitFor()
  await expect(page.getByTestId('cell-MAAŞ-Ocak')).toHaveValue('1.000,00\u00A0₺')
  const total = Date.now() - startedAt

  // The deliberate Argon2id cost is excluded, as §3.4 says in as many words.
  const kdf = session.lastUnlockKdfMs()
  expect(kdf, 'the app should report its Argon2id cost').not.toBeNull()
  const interactive = total - kdf!

  console.log(
    `    unlock to interactive grid: ${interactive} ms excluding Argon2id ` +
      `(budget 1000 ms; Argon2id itself took ${kdf} ms of ${total} ms total)`
  )
  expect(interactive).toBeLessThanOrEqual(1000)
})

test('the happy path raises no console error — the Definition of Done, checked', async () => {
  session = await launchFresh()
  const page = session.page

  // Collected from the first paint, before the vault even exists, so nothing
  // in the ceremony escapes either.
  const complaints: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      complaints.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => complaints.push(`pageerror: ${error.message}`))

  await createVaultAndEnter(session)
  await openSection1(page)

  // A representative day's work: build columns, type, annotate, sort, filter,
  // add a year, switch back.
  await addColumn(page, 'MAAŞ', 'income')
  await addColumn(page, 'KİRA', 'expense')
  await typeCell(page, 'MAAŞ', 'Ocak', '52340,55')
  await typeCell(page, 'KİRA', 'Ocak', '8500')
  await typeCell(page, 'MAAŞ', 'Şubat', '52340,55')

  await page.getByTestId('cell-details-KİRA-Ocak').click()
  await page.getByTestId('cell-note').fill('zam sonrası')
  await page.getByTestId('cell-refund').check()
  await page.keyboard.press('Escape')

  await page.getByTestId('header-MAAŞ').click()
  await page.getByTestId('column-menu-KİRA').click()
  await page.getByTestId('filter-KİRA').selectOption('filled')
  await page.keyboard.press('Escape')
  await page.getByTestId('clear-filters').click()

  const firstYear = new Date().getFullYear()
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${firstYear + 1}`)).toBeVisible()
  await page.getByTestId(`year-${firstYear}`).click()
  await expect(page.getByTestId(`workspace-${firstYear}`)).toBeVisible()

  expect(complaints, `console output during the happy path:\n${complaints.join('\n')}`).toEqual([])
})

test('English renders the same numbers in its own format', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await page.getByTestId('nav-settings').click()
  await page.getByTestId('language-en').click()
  await openSection1(page)

  await addColumn(page, 'SALARY', 'income')
  await typeCell(page, 'SALARY', 'July', '1234.56')

  // ICU renders lira under en-GB as "TRY 1,234.56"; the trailing-symbol form of
  // §13 is the Turkish presentation, and Realisation II's formatter owns both.
  await expect(page.getByTestId('year-subtotal-TRY')).toHaveText('TRY 1,234.56')
})
