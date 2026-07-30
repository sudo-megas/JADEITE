/**
 * Realisation VIII acceptance, driven through the built application.
 *
 * > - [ ] Every Overview number equals its section source (automated cross-check).
 * > - [ ] Renders beautifully in all ten palettes, both densities.
 *
 * **The cross-check is surface to surface, and that is the whole design.** The
 * Overview calls the same shared engines Sections 1–3 call, so a test that
 * compared `computeGrid(...)` against what the Overview computed would prove
 * only that a pure function is deterministic — it would pass over an Overview
 * that never rendered the number at all. What is compared here instead is the
 * *rendered figure*: read out of the Overview's DOM, then read again out of the
 * owning section's DOM after navigating there, and asserted equal as text. Two
 * independent render paths over one database, which is the only comparison that
 * can fail for a reason worth knowing about.
 *
 * **The fixture is built to discriminate.** Surface-to-surface equality is only
 * as strong as the data underneath it: over a lazy seed, three of these
 * assertions pass just as happily over an Overview that re-derived the figure
 * wrongly. Four properties are therefore requirements of `seed` rather than
 * decoration, and each is marked where it is typed:
 *
 *   1. **A counter column carrying a nonzero cell.** `totalRemainingLimit` is
 *      the Remaining Limit *row's* total; a counter has no limit and therefore
 *      no remainder (`section2/engine.ts`). Without a counter holding money,
 *      that reading and the naive `Σ limits − Σ debt` give the same answer and
 *      the tile cannot tell them apart. Here they are ₺347.000 and ₺347.500.
 *   2. **A held type that is unpriced and carries nonzero cost.** `unrealised`
 *      is `marketValue − pricedCostBasis`, not `− costBasis`. Without an
 *      unpriced holding the two agree; here they are +₺16.850 and −₺64.494.
 *   3. **A USD column beside the TRY one.** `yearBuckets` is one bucket per
 *      value type and summing across them is forbidden, so a year card shows
 *      its TRY net and marks that there is more — and a marker drawn on a year
 *      that has nothing else marks nothing.
 *   4. **The deep-link target is the *older* year.** Section 1 opens on the
 *      newest year by itself, so a deep link into the newest year is
 *      indistinguishable from no deep link at all.
 *
 * A fifth state is seeded and asserted separately: a year with **zero**
 * categories, which is not a year whose net is zero. `createYear` copies
 * columns from the nearest *earlier* year, so a year created before every
 * other one arrives genuinely empty — the cheapest way to reach the state.
 *
 * **"Beautifully" is not automatable and is not claimed here.** It is
 * photographed, on both rigs. What this file asserts is the half that is
 * mechanical and that this project's own history says matters: that nothing is
 * clipped. `app.css` records a 1080p overflow found by photographing, where the
 * append row's commit button was pushed off the edge — testing had not noticed
 * because nothing was measuring rectangles.
 *
 * On whitespace: `formatMoney` joins a figure to its symbol with a non-breaking
 * space, and `toHaveText` normalises what it reads off the page — which is why
 * the plain spaces in the literals here match. A figure read off *one* surface
 * and handed to the matcher as the expected value for another is normalised
 * explicitly, in `overviewFigure`, rather than left to the matcher's treatment
 * of a string it was given: the two surfaces are compared on their digits and
 * their symbol, never on which space character each happened to emit.
 */

import { expect, test, type Page } from '@playwright/test'

import { PALETTES } from '../../src/shared/theme/palettes/index.js'
import { createVaultAndEnter, launchFresh, type Session } from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

/**
 * Three years, named from the clock exactly as `section1.spec.ts` names them.
 *
 * A fresh vault opens on the system year (`ensureAnyYear`), and the two others
 * are created *below* it so that neither inherits a column set — see the note on
 * the empty year in the file header.
 */
const NEWEST_YEAR = new Date().getFullYear()
const OLDER_YEAR = NEWEST_YEAR - 1
const EMPTY_YEAR = NEWEST_YEAR - 2

/**
 * The year the ledger rows are dated in.
 *
 * Section 3's ledger is not year-scoped — it is one running history — so this
 * has nothing to do with the three years above. It is a year behind the clock
 * only so that no row this fixture types is ever dated in the future, whatever
 * month of whatever year the suite is run in.
 */
const LEDGER_YEAR = NEWEST_YEAR - 1

/** ₺10.000 in, ₺4.000 out. The newest year's TRY net, as Section 1 renders it. */
const NET_NEWEST = '6.000,00 ₺'
/** ₺2.500 in, nothing out. Deliberately unlike the newest year's. */
const NET_OLDER = '2.500,00 ₺'

/**
 * The two types held without a price, sorted and space-joined.
 *
 * Not the order the engine produces: `missingPrices` is built by walking
 * `data.types`, which is the closed list in its own order — çeyrek stands at
 * position 2 and ata at 5 (`schema.ts`). So the attribute is a real
 * transformation of the engine's answer, and asserting the literal catches the
 * case where both surfaces sort it wrongly in the same way, which an equality
 * between two call sites of one helper cannot.
 */
const UNPRICED_TYPES = 'ata ceyrek'

// --- Navigation ------------------------------------------------------------

async function openSection1(page: Page): Promise<void> {
  await page.getByTestId('nav-section1').click()
  await expect(page.getByTestId('section1')).toBeVisible()
}

async function openSection2(page: Page): Promise<void> {
  await page.getByTestId('nav-section2').click()
  await expect(page.getByTestId('section2')).toBeVisible()
}

async function openSection3(page: Page): Promise<void> {
  await page.getByTestId('nav-section3').click()
  await expect(page.getByTestId('section3')).toBeVisible()
}

async function openOverview(page: Page): Promise<void> {
  await page.getByTestId('nav-overview').click()
  await expect(page.getByTestId('overview')).toBeVisible()
}

/** Section 3's holdings tab, where the two grand figures live. */
async function openHoldings(page: Page): Promise<void> {
  await openSection3(page)
  await page.getByTestId('s3-view-holdings').click()
  await expect(page.getByTestId('s3-holdings')).toBeVisible()
}

// --- Typing the fixture ----------------------------------------------------

async function addColumn(
  page: Page,
  name: string,
  kind: 'income' | 'expense',
  valueType: 'TRY' | 'USD'
): Promise<void> {
  await page.getByTestId('new-column-name').fill(name)
  await page.getByTestId('new-column-kind').selectOption(kind)
  await page.getByTestId('new-column-type').selectOption(valueType)
  await page.getByTestId('add-column-submit').click()
  await expect(page.getByTestId(`header-${name}`)).toBeVisible()
}

async function typeS1Cell(page: Page, column: string, month: string, value: string): Promise<void> {
  const cell = page.getByTestId(`cell-${column}-${month}`)
  await cell.click()
  await cell.fill(value)
  await cell.press('Enter')
}

/** Create a year by number rather than by accepting the suggested next one. */
async function createYear(page: Page, year: number): Promise<void> {
  await page.getByTestId('add-year').click()
  await page.getByTestId('new-year-input').fill(String(year))
  await page.getByTestId('new-year-submit').click()
  await expect(page.getByTestId(`workspace-${year}`)).toBeVisible()
}

async function addS2Column(
  page: Page,
  name: string,
  kind: 'bank' | 'counter',
  detail: string
): Promise<void> {
  await page.getByTestId('s2-new-column-name').fill(name)
  await page.getByTestId('s2-new-column-kind').selectOption(kind)
  await page.getByTestId(kind === 'bank' ? 's2-new-column-limit' : 's2-new-column-party').fill(detail)
  await page.getByTestId('s2-add-column-submit').click()
  await expect(page.getByTestId(`s2-header-${name}`)).toBeVisible()
}

async function typeS2Cell(page: Page, column: string, month: string, value: string): Promise<void> {
  const cell = page.getByTestId(`s2-cell-${column}-${month}`)
  await cell.click()
  await cell.fill(value)
  await cell.press('Enter')
}

/**
 * Append one ledger row, leaving the person field alone.
 *
 * `Ledger.tsx` filters the built-in person out of its options and offers an
 * empty one, and the vault resolves a null person to Ortak (§8.1) — so a fixture
 * that does not care who owns the gold need not invent somebody. A coin's
 * denomination is its own type, which is why the figure goes into the count for
 * one kind of row and into the denomination for the other (§8.3).
 */
async function appendRow(
  page: Page,
  row: { date: string; type: string; coin: boolean; quantity: string; price: string }
): Promise<void> {
  const rows = page.getByTestId('s3-ledger').locator('tbody tr')
  const before = await rows.count()

  await page.getByTestId('s3-new-date').fill(row.date)
  await page.getByTestId('s3-new-type').selectOption(row.type)
  await page.getByTestId('s3-new-direction').selectOption('acquire')

  if (row.coin) {
    await page.getByTestId('s3-new-count').fill(row.quantity)
  } else {
    await page.getByTestId('s3-new-denomination').fill(row.quantity)
    await page.getByTestId('s3-new-count').fill('1')
  }

  await page.getByTestId('s3-new-price').fill(row.price)
  await page.getByTestId('s3-new-price').press('Enter')

  await expect(rows).toHaveCount(before + 1)
}

/**
 * The whole fixture, typed through the real interface.
 *
 * Nothing here is written into the database behind the application's back. Every
 * figure the Overview is later asked about got there the way the owner's own
 * figures will, which is what makes a disagreement between the two surfaces
 * mean something.
 *
 * Ends on the Overview, with Section 1 left on the **newest** year — the fourth
 * discriminating property. A deep link that lands where the section was already
 * standing proves nothing about deep links.
 */
async function seed(page: Page): Promise<void> {
  // --- Section 1: the newest year, TRY and USD side by side ----------------
  await openSection1(page)
  await addColumn(page, 'MAAŞ', 'income', 'TRY')
  await addColumn(page, 'KİRA', 'expense', 'TRY')
  // Discriminating property 3: a second value type in one year, so the card's
  // "there is more here than this figure" marker has something to mark.
  await addColumn(page, 'DÖVİZ', 'income', 'USD')

  await typeS1Cell(page, 'MAAŞ', 'Ocak', '10000')
  await typeS1Cell(page, 'KİRA', 'Ocak', '4000')
  await typeS1Cell(page, 'DÖVİZ', 'Ocak', '100')
  await expect(page.getByTestId('year-net-TRY')).toHaveText(NET_NEWEST)
  await expect(page.getByTestId('year-net-USD')).toBeVisible()

  // --- Section 1: an older year, with a net unlike the newest year's -------
  await createYear(page, OLDER_YEAR)
  await addColumn(page, 'MAAŞ', 'income', 'TRY')
  await typeS1Cell(page, 'MAAŞ', 'Şubat', '2500')
  await expect(page.getByTestId('year-net-TRY')).toHaveText(NET_OLDER)

  // --- Section 1: a year with no columns at all ----------------------------
  // Not a year whose net is zero. It has no value type in use, so Section 1
  // draws no year total for it — see the dedicated case below.
  await createYear(page, EMPTY_YEAR)
  await expect(page.getByTestId('section1-empty')).toBeVisible()

  await page.getByTestId(`year-${NEWEST_YEAR}`).click()
  await expect(page.getByTestId(`workspace-${NEWEST_YEAR}`)).toBeVisible()

  // --- Section 2: two cards and a counter, in the newest year --------------
  // Section 2 opens on the newest year of its own accord, and keeps its own
  // place thereafter; the columns therefore land in NEWEST_YEAR and the two
  // older years stay empty of banks.
  await openSection2(page)
  await expect(page.getByTestId(`s2-workspace-${NEWEST_YEAR}`)).toBeVisible()
  await addS2Column(page, 'A', 'bank', '200000')
  await addS2Column(page, 'B', 'bank', '150000')
  await addS2Column(page, 'Sayaç A', 'counter', 'Sayaç A')

  await typeS2Cell(page, 'A', 'Ocak', '1000')
  await typeS2Cell(page, 'B', 'Aralık', '2000')
  // Discriminating property 1: the counter carries money. Σ limits is 350.000
  // and the debt is 2.500, so the naive reading would say 347.500 where the
  // Remaining Limit row says 347.000.
  await typeS2Cell(page, 'Sayaç A', 'Aralık', '500')

  // --- Section 3: one priced type and two unpriced ones --------------------
  await openSection3(page)
  await appendRow(page, {
    date: `${LEDGER_YEAR}-01-15`,
    type: 'gram',
    coin: false,
    quantity: '10',
    price: '5.000,00'
  })
  // Discriminating property 2: ₺40.000 and ₺41.344 of cost that will never
  // acquire a price, so `− pricedCostBasis` and `− costBasis` cannot agree.
  // Two of them, and typed in the closed list's order, so the sorted attribute
  // asserted below is a genuine reordering.
  await appendRow(page, {
    date: `${LEDGER_YEAR}-02-20`,
    type: 'ceyrek',
    coin: true,
    quantity: '4',
    price: '10.000,00'
  })
  await appendRow(page, {
    date: `${LEDGER_YEAR}-03-10`,
    type: 'ata',
    coin: true,
    quantity: '1',
    price: '41.344,00'
  })

  await page.getByTestId('s3-view-prices').click()
  const price = page.getByTestId('s3-manual-price-gram')
  await price.click()
  await price.fill('6.505,00')
  await price.press('Enter')
  await expect(page.getByTestId('s3-price-stamp-gram')).not.toBeEmpty()

  await openOverview(page)
}

// --- Reading figures off two surfaces --------------------------------------

/**
 * Read a figure out of the Overview, refusing an absent one.
 *
 * The root `overview` testid is present in every state, including the one where
 * the vault reads are still in flight, so a bare `textContent()` can come back
 * empty — and an empty string equals an empty string further down, which is a
 * cross-check that compares two absences and passes. Waiting for a digit is
 * what makes the equality that follows an assertion rather than a coincidence.
 *
 * The whitespace is normalised here rather than left to the matcher. `toHaveText`
 * normalises what it reads off the page, which is why the plain spaces in the
 * literals elsewhere in this suite match a `formatMoney` non-breaking one; what
 * it does to a string handed *in* is its own business, and a figure read off one
 * surface and asserted against another is exactly the case where that matters.
 */
async function overviewFigure(page: Page, testId: string): Promise<string> {
  const figure = page.getByTestId(testId)
  await expect(figure).toHaveText(/\d/)
  return ((await figure.textContent()) ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Everything the Overview is drawing, as text, in one pass.
 *
 * Gathered before any navigation, because reading a tile after leaving the
 * Overview would read whatever the next section put in its place.
 */
async function overviewFigures(page: Page): Promise<{
  debt: string
  remaining: string
  market: string
  unrealised: string
}> {
  return {
    debt: await overviewFigure(page, 'ov-tile-debt-figure'),
    remaining: await overviewFigure(page, 'ov-tile-remaining-figure'),
    market: await overviewFigure(page, 'ov-tile-market-figure'),
    unrealised: await overviewFigure(page, 'ov-tile-unrealised-figure')
  }
}

// --- Box 1: every Overview number equals its section source ----------------

/**
 * The four grand tiles, each against the section that owns it.
 *
 * The tiles are compared against the **newest** year's grid, and the year is
 * named rather than left to whatever Section 2 happens to have open.
 * `selectDebtYear` takes the latest year that has begun, which for this fixture
 * is the system year; and "current debt" can only mean that year's grand total,
 * since `computeGrid` sums all twelve months regardless of `monthState` —
 * `s2_cells` carries no paid flag, so there is no second reading to choose
 * between. A tile that quietly changed its subject would still pass a test that
 * did not say which year it was asking about.
 */
test('the four grand tiles equal the figures their sections draw', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await seed(page)

  // Nothing is being compared against a degraded Overview: a failed year read
  // draws its card anyway and says so, and a cross-check run over that would be
  // comparing a section against a banner.
  await expect(page.getByTestId('overview-error')).toHaveCount(0)
  await expect(page.getByTestId('ov-partial')).toHaveCount(0)

  // The showpiece's three charts, present before anything is read off it.
  await expect(page.getByTestId('ov-chart-net')).toBeVisible()
  await expect(page.getByTestId('ov-chart-yoy')).toBeVisible()
  await expect(page.getByTestId('ov-chart-value')).toBeVisible()

  const figures = await overviewFigures(page)

  // Two of the four are the ones that print a truthful-looking 0,00 ₺ in a
  // state that is not zero — a debt year with no bank columns, and a portfolio
  // with nothing priced. The fixture has neither, so a zero here is a defect
  // rather than an answer.
  expect(figures.remaining, 'remaining limit should not read as no headroom').not.toMatch(/^0,00/)
  expect(figures.unrealised, 'unrealised should not read as break-even').not.toMatch(/^0,00/)

  /*
    The direction, which the two surfaces state in different ways on purpose:
    3b writes a leading '+' into the text (`Gain` in `Holdings.tsx`, and
    Realisation V's own acceptance asserts it), while the Overview carries the
    direction as an attribute and lets the palette colour it. The expected text
    below is therefore assembled from *both* halves of what the Overview said,
    so the comparison covers the figure and its direction rather than dropping
    one of them; a minus needs no such care, since both sides get theirs from
    ICU.

    And the direction is itself discriminating here. Against this fixture the
    correct `marketValue − pricedCostBasis` is +₺16.850 while the wrong
    `− costBasis` is −₺64.494, so an Overview that subtracted the whole cost
    basis would not merely differ in the digits — it would report a loss.
  */
  const sign = await page.getByTestId('ov-tile-unrealised-figure').getAttribute('data-sign')
  expect(sign, 'a priced holding that is up should read as a gain').toBe('gain')

  await openSection2(page)
  await page.getByTestId(`s2-year-${NEWEST_YEAR}`).click()
  await expect(page.getByTestId(`s2-workspace-${NEWEST_YEAR}`)).toBeVisible()
  await expect(page.getByTestId('s2-grand-total-debt')).toHaveText(figures.debt)
  await expect(page.getByTestId('s2-total-remaining-limit')).toHaveText(figures.remaining)

  await openHoldings(page)
  await expect(page.getByTestId('s3-grand-market')).toHaveText(figures.market)
  await expect(page.getByTestId('s3-grand-unrealised')).toHaveText(`+${figures.unrealised}`)
})

/**
 * Every year card's net against Section 1's own total for that year.
 *
 * Section 1 draws exactly one `year-net-TRY`, belonging to whichever year is
 * open, so each comparison switches the year first and waits for that year's
 * workspace. The two nets are deliberately different figures: over a fixture
 * where both years netted the same, a card that read the wrong year's total
 * would pass.
 *
 * The card's figure is taken to be the **TRY** bucket. `yearBuckets` is one
 * bucket per value type in use and summing across them is forbidden
 * (`section1/engine.ts`), so a single net on a card can only be one of them,
 * and the marker asserted below is how the card admits to the rest.
 */
test('each year card’s net equals Section 1’s own total for that year', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await seed(page)

  const newest = await overviewFigure(page, `ov-year-${NEWEST_YEAR}-net`)
  const older = await overviewFigure(page, `ov-year-${OLDER_YEAR}-net`)
  expect(newest, 'the two years must differ, or neither comparison discriminates').not.toBe(older)

  // The year that also holds a dollar column says so, and names it. The year
  // that holds nothing but lira carries no such line at all: a card whose net is
  // the whole of that year's story has nothing to qualify, and a marker drawn
  // over every card marks nothing.
  await expect(page.getByTestId(`ov-year-${NEWEST_YEAR}-other`)).toContainText('USD')
  await expect(page.getByTestId(`ov-year-${OLDER_YEAR}-other`)).toHaveCount(0)

  await openSection1(page)
  await page.getByTestId(`year-${NEWEST_YEAR}`).click()
  await expect(page.getByTestId(`workspace-${NEWEST_YEAR}`)).toBeVisible()
  await expect(page.getByTestId('year-net-TRY')).toHaveText(newest)

  await page.getByTestId(`year-${OLDER_YEAR}`).click()
  await expect(page.getByTestId(`workspace-${OLDER_YEAR}`)).toBeVisible()
  await expect(page.getByTestId('year-net-TRY')).toHaveText(older)
})

/**
 * The unpriced types, named on both surfaces.
 *
 * Compared as the *types named* rather than as a count, because Section 3
 * renders its complaint as a sentence of translated names — "Çeyrek, Ata" — and
 * the Overview's tile has no room for a sentence. A count comparison would
 * degrade to "both of them complain about something", which is true of an
 * Overview that named the wrong types entirely.
 *
 * This is the one case with a precondition outside its own reach: `Holdings.tsx`
 * carries `data-unpriced-types` for exactly this comparison, and a run where
 * the attribute is missing fails here first.
 */
test('the Overview and Section 3 name the same unpriced types', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await seed(page)

  const marker = page.getByTestId('ov-tile-market-unpriced')
  await expect(marker).toBeVisible()
  await expect(marker).toHaveAttribute('data-unpriced-types', UNPRICED_TYPES)

  await openHoldings(page)
  const complaint = page.getByTestId('s3-missing-prices')
  await expect(complaint).toHaveAttribute('data-unpriced-types', UNPRICED_TYPES)
  // And the sentence beside it is still a sentence: the attribute is for the
  // cross-check, never a replacement for what the owner reads.
  await expect(complaint).toHaveText(/\p{L}/u)
})

/**
 * A year with no columns is not a year that netted zero.
 *
 * This is the rung's central hazard in its smallest form. Section 1 draws no
 * year total at all for a year with no value type in use — asserted here, so
 * that the Overview's silence is being compared against a real absence in the
 * section rather than against a guess — and a card that answered "0,00 ₺" would
 * be inventing a figure that the owning section declines to state.
 */
test('a year with no columns does not report a net of zero', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await seed(page)

  const card = page.getByTestId(`ov-year-${EMPTY_YEAR}`)
  await expect(card).toBeVisible()
  await expect(card).not.toContainText('0,00')
  // And it explains itself rather than merely declining to answer: an unmarked
  // blank on a dashboard is indistinguishable from a figure that failed to load.
  await expect(page.getByTestId(`ov-year-${EMPTY_YEAR}-other`)).toBeVisible()

  await openSection1(page)
  await page.getByTestId(`year-${EMPTY_YEAR}`).click()
  await expect(page.getByTestId(`workspace-${EMPTY_YEAR}`)).toBeVisible()
  await expect(page.getByTestId('section1-empty')).toBeVisible()
  await expect(page.locator('[data-testid^="year-net-"]')).toHaveCount(0)
})

// --- Deep links ------------------------------------------------------------

/**
 * A deep link lands on the year it came from.
 *
 * The target is the **older** year on purpose. Section 1 opens on the newest
 * year by itself and keeps the year it was left on across a navigation, so a
 * link into the newest year would pass without doing anything at all.
 *
 * The assertion is on the *figure*, not on the workspace marker alone.
 * `selectYear` writes nothing synchronously before its `await`, and a
 * freshly-mounted section's own `load()` reads `activeYear` and then overwrites
 * it — so the right workspace can appear and be replaced a tick later, and a
 * retrying visibility check would see the moment it was right and stop looking.
 * The figure is the year, and only the older year nets ₺2.500.
 */
test('a year card’s deep link opens Section 1 on that year', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await seed(page)

  await page.getByTestId(`ov-year-${OLDER_YEAR}-open-s1`).click()
  await expect(page.getByTestId('section1')).toBeVisible()
  await expect(page.getByTestId(`workspace-${OLDER_YEAR}`)).toBeVisible()
  await expect(page.getByTestId('year-net-TRY')).toHaveText(NET_OLDER)
  await expect(page.getByTestId('header-MAAŞ')).toBeVisible()

  // Away and back, because every matcher above passes on the *first* moment it
  // is satisfied — and the race this case exists to catch has a winner either
  // way. `load()` keeps the year already open when it is still in the index
  // (`section1-store.ts`), so what is read after a remount is the year the store
  // settled on rather than whichever of two in-flight reads happened to land
  // last. A link that merely won a race is not a link that works.
  await openSection2(page)
  await openSection1(page)
  await expect(page.getByTestId(`workspace-${OLDER_YEAR}`)).toBeVisible()
  await expect(page.getByTestId('year-net-TRY')).toHaveText(NET_OLDER)
})

// --- Box 2: the half of it that is mechanical ------------------------------

/**
 * Ask the window for a size, and report the size it actually got.
 *
 * A display smaller than the size asked for clamps it, and a test that assumed
 * otherwise would quietly measure 1920 twice and claim to have measured 2560.
 * The achieved content size is returned so the assertion can say what it was
 * really looking at, and the renderer is polled — never slept on — until it has
 * caught up with the number the main process reports.
 */
async function resizeTo(
  s: Session,
  width: number,
  height: number
): Promise<{ width: number; height: number }> {
  const achieved = await s.app.evaluate(
    ({ BrowserWindow }, bounds) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.setBounds(bounds)
      const size = win?.getContentSize() ?? []
      return { width: size[0] ?? 0, height: size[1] ?? 0 }
    },
    { x: 0, y: 0, width, height }
  )

  await expect
    .poll(async () => Math.abs((await s.page.evaluate(() => window.innerWidth)) - achieved.width), {
      message: `the renderer should reach ${achieved.width} CSS px`
    })
    .toBeLessThanOrEqual(2)

  return achieved
}

/**
 * Everything on the Overview that is drawn outside the pane that holds it.
 *
 * Two measurements, because the two failures look different. A figure whose own
 * box scrolls is a number with its end cut off; a figure whose rectangle sits
 * beyond the content area's is the `app.css` finding itself — an element pushed
 * off the edge, which the pane's own scrollWidth may or may not admit to.
 *
 * The scroll comparison is guarded by `clientWidth > 0` deliberately: both
 * `scrollWidth` and `clientWidth` are zero on an inline box, and a bare
 * `scrollWidth <= clientWidth` over a page of `<span>`s is the assertion
 * `0 <= 0` — green over exactly the defect it was written to catch.
 */
async function clipped(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const content = document.querySelector('[data-testid="content"]')
    if (!(content instanceof HTMLElement)) return ['content: not found']

    const complaints: string[] = []
    if (content.scrollWidth > content.clientWidth + 1) {
      complaints.push(`content: scrolls ${content.scrollWidth} in ${content.clientWidth}`)
    }

    const pane = content.getBoundingClientRect()
    const drawn = document.querySelectorAll(
      '[data-testid^="ov-tile-"][data-testid$="-figure"],' +
        '[data-testid^="ov-year-"][data-testid$="-net"],' +
        '[data-testid^="ov-chart-"]'
    )
    if (drawn.length === 0) complaints.push('nothing on the Overview was measurable')

    for (const node of drawn) {
      if (!(node instanceof HTMLElement)) continue
      const id = node.dataset['testid'] ?? '?'
      const box = node.getBoundingClientRect()
      if (box.right > pane.right + 1 || box.left < pane.left - 1) {
        complaints.push(`${id}: outside the content pane`)
      }
      if (node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1) {
        complaints.push(`${id}: ${node.scrollWidth} of text in ${node.clientWidth}`)
      }
    }
    return complaints
  })
}

/**
 * The three sizes this application is actually looked at in.
 *
 * 1280 × 820 is what `src/main/index.ts` opens, and nothing maximises it, so it
 * is the size the owner sees first and the narrowest the layout must survive.
 * The other two are the 1080p laptop and the 1440p rig REALISATION.md names.
 */
const DENSITIES = [
  { width: 1280, height: 820 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 }
] as const

test('no Overview figure is clipped at any of the three densities', async () => {
  // The full fixture plus three window cycles, each polling twice. A timeout
  // here would read as a layout failure when it was only a budget one.
  test.slow()

  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await seed(page)

  for (const density of DENSITIES) {
    const achieved = await resizeTo(session, density.width, density.height)
    await expect(page.getByTestId('overview')).toBeVisible()

    // Polled rather than read once: a resize reaches the charts through a
    // ResizeObserver, so the layout settles a frame or two after the window
    // does, and a single measurement would be measuring the transition.
    await expect
      .poll(async () => await clipped(page), {
        message: `asked for ${density.width}×${density.height}, drew at ${achieved.width}×${achieved.height}`
      })
      .toEqual([])
  }
})

/**
 * The year accents, in all ten palettes.
 *
 * Read through a probe rather than off the custom property, and that is the
 * whole point of the case. A custom property holds an arbitrary token stream:
 * `getPropertyValue('--year-accent-wash')` hands back the text of the
 * `color-mix(…)` whether or not it resolves to a colour, so reading it proves
 * only that something was written. A *used* value is where a collapsed mix
 * shows, and only a real property has one — hence a span, appended and removed
 * inside a single evaluation, painted through the variable and asked what colour
 * it came out.
 *
 * `background-color` and not `color`: an invalid variable makes the declaration
 * invalid at computed-value time, and `color` would then inherit a perfectly
 * good colour from the card and hide the failure. `background-color` is not
 * inherited, so it falls to transparent and says so.
 */
async function paintedAccent(
  page: Page,
  testId: string
): Promise<{ accent: string; wash: string }> {
  return await page.evaluate((id) => {
    const card = document.querySelector(`[data-testid="${id}"]`)
    if (!(card instanceof HTMLElement)) return { accent: '', wash: '' }

    const probe = document.createElement('span')
    probe.style.position = 'absolute'
    probe.style.pointerEvents = 'none'
    card.appendChild(probe)

    probe.style.backgroundColor = 'var(--year-accent)'
    const accent = getComputedStyle(probe).backgroundColor
    probe.style.backgroundColor = 'var(--year-accent-wash)'
    const wash = getComputedStyle(probe).backgroundColor

    probe.remove()
    return { accent, wash }
  }, testId)
}

/** Transparent — what an unset or collapsed variable paints. */
const NOTHING = 'rgba(0, 0, 0, 0)'

test('all ten palettes draw the year cards in their own accents', async () => {
  // A full fixture plus ten mounts, each creating and disposing three ECharts
  // instances, against a 120 s budget.
  test.slow()

  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await seed(page)

  expect(PALETTES).toHaveLength(10)
  // Three years take accents at distance 0, −1 and −2 from the anchor, and
  // `accentAt` wraps, so distinctness below is a property of the sequences
  // being at least three long rather than something to hope for.
  for (const palette of PALETTES) {
    expect(palette.accentSequence.length, palette.id).toBeGreaterThanOrEqual(3)
  }

  for (const palette of PALETTES) {
    await page.getByTestId('nav-settings').click()
    await page.getByTestId(`palette-${palette.id}`).click()
    await openOverview(page)

    const painted: string[] = []
    for (const year of [NEWEST_YEAR, OLDER_YEAR, EMPTY_YEAR]) {
      const card = page.getByTestId(`ov-year-${year}`)
      await expect(card).toBeVisible()
      const colours = await paintedAccent(page, `ov-year-${year}`)
      expect(colours.accent, `${palette.id}: ${year} has no accent`).not.toBe(NOTHING)
      expect(colours.accent, `${palette.id}: ${year} has no accent`).not.toBe('')
      // The muted form §12.3 actually paints with. A `color-mix` that failed to
      // resolve renders as nothing at all, and nothing is what a card with no
      // banding looks like — legible, plausible, and wrong.
      expect(colours.wash, `${palette.id}: ${year}'s wash collapsed`).not.toBe(NOTHING)
      painted.push(colours.accent)
    }

    // Each year its own colour, which is what §12.3's sequence is for.
    expect(new Set(painted).size, `${palette.id}: the years share an accent`).toBe(painted.length)

    // Still whole in this palette: a longer label or a heavier face is exactly
    // how a tile starts to clip, and a palette switch rebuilds all three charts.
    await expect.poll(async () => await clipped(page), { message: palette.id }).toEqual([])
  }
})

/**
 * The Definition of Done, on this rung's own happy path.
 *
 * The palette switches are the substance rather than the frame. The Overview
 * creates and disposes three ECharts instances on **every** switch — the
 * `resetKey` in `Chart.tsx` replaces the instance rather than merging into it,
 * because ECharts merges option objects and a stale colour would otherwise
 * survive — which makes this the view most likely to leave one behind, and a
 * disposed instance still being resized complains in the console rather than
 * crashing.
 *
 * The exclusion is the one `section2.spec.ts` carries and for the same reason:
 * the `<meta>` CSP is deliberate belt-and-braces over the header, and Chromium
 * notes that one of its directives has no meaning there.
 */
test('the Overview raises no console error — the Definition of Done, checked', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  const page = session.page

  const complaints: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const text = message.text()
      if (text.includes("'frame-ancestors' is ignored")) return
      complaints.push(text)
    }
  })
  page.on('pageerror', (error) => complaints.push(`pageerror: ${error.message}`))

  await createVaultAndEnter(session)
  await seed(page)

  for (const id of ['nord', 'catppuccin-latte']) {
    await page.getByTestId('nav-settings').click()
    await page.getByTestId(`palette-${id}`).click()
    await openOverview(page)
  }

  // Away and back: three instances disposed on unmount, three built again.
  await openSection2(page)
  await openOverview(page)
  await expect(page.getByTestId('ov-chart-net')).toBeVisible()

  expect(complaints, complaints.join('\n')).toEqual([])
})
