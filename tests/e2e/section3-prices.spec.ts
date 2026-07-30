/**
 * Realisation VII's two owner-facing acceptance lines, driven through the built
 * application — §14, §8.5.
 *
 *   > Refresh populates live values with timestamps; airplane-mode run degrades
 *   > silently.
 *   > Ziynet, which the source does not quote, shows no live value and does not
 *   > read as ₺0.
 *
 * **The second line lost its subject and kept its guarantee.** Schema v3 struck
 * ziynet from the closed list — it is the Turkish parent name of the ornamental
 * coin family rather than a product beside them (§8.2, amended 30 July 2026) —
 * so there is no longer a row of that name to point at. The property is what the
 * box was always about and it binds exactly as before: **an absent live figure
 * reads as words, never as ₺0,00.** It is proved below against every type in the
 * list at once, in the state where the provider has answered nothing.
 *
 * **It is proved through `noProvider` and not through `notQuoted`, and that is a
 * finding rather than a shortcut.** `Prices.tsx` tells the two absences apart:
 * nothing has ever been fetched, or a fetch arrived without this type in it.
 * Reaching the second needs a *successful* snapshot that omits a type, and no
 * provider a test may use can produce one. Raising `MAX_UNIT_PRICE` to ₺500.000
 * this Realisation is what made the two largest coins storable, so `mock` and
 * `mock-b` now quote all ten (`tests/unit/prices-parse.test.ts` asserts that
 * length outright) and `offline-mock` quotes none. The `notQuoted` branch is
 * therefore exercised where a successful-but-partial snapshot can still be
 * manufactured — in the parser's own unit test, which drops one unstorable
 * instrument and keeps the other nine. Written down here so that the next reader
 * does not spend an afternoon hunting for the environment variable that would do
 * it from out here.
 *
 * **Every case names its provider.** `selectedProviderId()` already answers
 * `mock` for any unpackaged build, so an e2e run cannot reach the network even by
 * omission — which is precisely why the name is written out anyway. A safety net
 * a test silently leans on is a safety net nobody notices being removed.
 *
 * **One effective refresh per launched application.** `limiter.ts` keeps
 * `MIN_INTERVAL_MS = 60_000` in module scope, so a second press inside one case
 * comes back `skipped` and writes nothing. Every case therefore presses once and
 * afterwards moves only the *manual* side of the comparison — which is the half
 * these boxes are about in any event (§8.5: the typed price is the authority).
 *
 * Every assertion reads an end state rather than a transition. An auto-refresh
 * on entering the section would make the press itself a no-op, and a case that
 * first asserted "never checked" would be asserting the absence of a feature this
 * same rung is adding.
 *
 * On whitespace: `formatMoney` joins a figure to its symbol with a non-breaking
 * space, and only some matchers care. `toHaveText` and `toContainText` normalise
 * both sides, which is why the plain space in `tests/e2e/section3.spec.ts`
 * matches; `toHaveValue` does not, and a regular expression sees the raw text
 * either way. Every figure below is asserted as its digits alone, which holds
 * under all of them and depends on none of it.
 */

import { expect, test, type Page } from '@playwright/test'

import { DRIFT_THRESHOLD } from '../../src/shared/section3/drift.js'
import { createVaultAndEnter, launchFresh, type Session } from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

/**
 * The mock's gram satış, in integer kuruş.
 *
 * Copied from `src/main/prices/mock/recorded.ts` rather than imported, because
 * importing the frame would mean parsing it here — and a test that re-derives an
 * expected figure with the very code that produced it agrees with itself. This is
 * what a person reading the fixture would write down.
 */
const LIVE_GRAM_KURUS = 625_137

async function openPrices(page: Page): Promise<void> {
  await page.getByTestId('nav-section3').click()
  await expect(page.getByTestId('section3')).toBeVisible()
  await page.getByTestId('s3-view-prices').click()
  await expect(page.getByTestId('s3-prices')).toBeVisible()
}

/**
 * Ask the provider, once.
 *
 * A second call inside the same application would be refused by the limiter and
 * would report nothing, so this is deliberately not a helper that can be called
 * twice — the wait is on the button being available again, which is the only
 * signal the interface gives that the round trip is over.
 */
async function refreshOnce(page: Page): Promise<void> {
  await page.getByTestId('s3-refresh').click()
  await expect(page.getByTestId('s3-refresh')).toBeEnabled()
}

/** Type a price into 3c, exactly as `section3.spec.ts` does. */
async function setManualPrice(page: Page, type: string, value: string): Promise<void> {
  const cell = page.getByTestId(`s3-manual-price-${type}`)
  await cell.click()
  await cell.fill(value)
  await cell.press('Enter')
}

/** How many rows 3c is drawing — the closed list, asked rather than assumed. */
async function typeRowCount(page: Page): Promise<number> {
  return await page.locator('[data-testid^="s3-price-row-"]').count()
}

/**
 * The first acceptance line's first half, through the real interface.
 *
 * `besli` is asserted by name and not for symmetry: at ₺206.869 it is the quote
 * the ceiling rise of this Realisation rescued, and under the old ₺100.000 bound
 * its presence in a frame refused the whole transaction. If that bound ever comes
 * back, this line is where it shows.
 */
test('a refresh fills the live column and stamps when the source was last asked', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await openPrices(page)
  await refreshOnce(page)

  await expect(page.getByTestId('s3-live-price-gram')).toContainText('6.251,37')
  await expect(page.getByTestId('s3-live-price-ceyrek')).toContainText('10.124,00')
  await expect(page.getByTestId('s3-live-price-besli')).toContainText('206.869,00')
  await expect(page.getByTestId('s3-live-price-usd')).toContainText('47,36')

  // "With timestamps": a day the owner can read, not a bare claim of freshness.
  // A pattern rather than a literal, since the stamp is the moment this test
  // itself ran — and `toContainText` rather than `toHaveText`, because the line
  // is a sentence with the date inside it ("Son bakış: …") and matching the
  // whole of it would be pinning a locale string this file does not own.
  await expect(page.getByTestId('s3-live-fetched-at')).toContainText(/\d{2}\.\d{2}\.\d{4}/)

  // A working provider says nothing at all. The failure line is the offline
  // case's business and its absence here is half of what "silently" means.
  await expect(page.getByTestId('s3-live-error')).toHaveCount(0)

  // Every type in the closed list received a figure, and not one of them
  // acquired a manual price along the way: `unpriced` is precisely the state
  // "live present, nothing typed to compare it against" (`drift.ts`). Counted
  // against the rows on screen rather than against a literal ten, so the
  // eleventh type this application ever grows does not quietly slip past.
  const rows = await typeRowCount(page)
  expect(rows).toBeGreaterThan(0)
  await expect(page.locator('[data-testid^="s3-drift-"][data-drift="unpriced"]')).toHaveCount(rows)
})

/**
 * The second acceptance line, as amended: no live figure reads as ₺0.
 *
 * `offline-mock` is what makes this the *whole* column rather than one row. A
 * type absent from a good answer and a whole column absent because no answer came
 * are the same defect waiting in the same place — a null coerced to zero on its
 * way to a formatter — and the second is the one this suite can construct.
 */
test('a type with no live figure shows words, never ₺0,00', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await openPrices(page)
  await refreshOnce(page)

  // Deliberately no assertion about the failure line here. Whether this press
  // reached the provider or was declined by the limiter changes what 3c says
  // about the *fetch*; it changes nothing about what an unquoted type may say
  // about its *price*, which is this case's whole subject. The failure line is
  // asserted where it is the point — in the airplane-mode case below.
  const rows = await typeRowCount(page)
  const cells = await page.locator('[data-testid^="s3-live-price-"]').allTextContents()
  expect(cells).toHaveLength(rows)

  for (const text of cells) {
    // Words, and no figure of any kind. Asserted as "contains a letter, contains
    // no digit" rather than as "is not ₺0,00", because the sentence is a locale
    // string and the guarantee is not: a currency symbol and a zero would fail
    // this in any language, and so would a lone dash pretending to be a price.
    expect(text).toMatch(/\p{L}/u)
    expect(text).not.toMatch(/\d/u)
    expect(text).not.toContain('₺')
  }

  // The same guarantee at the drift cell, where it hides better. A null live
  // figure read as zero would not merely print ₺0,00 — it would *agree* with a
  // manual price of zero and mark the pair aligned, which is a green tick over a
  // comparison that never happened.
  await expect(page.locator('[data-testid^="s3-drift-"][data-drift="none"]')).toHaveCount(rows)
  await expect(page.locator('[data-testid^="s3-drift-"][data-drift="aligned"]')).toHaveCount(0)
})

/**
 * The first acceptance line's second half: an airplane-mode run degrades
 * silently.
 *
 * "Silently" is not "invisibly" — §14 asks for quiet and non-blocking, so the
 * failure is stated once, as a status beside the prices, and nothing the owner
 * typed moves. What is actually checked here is the *unmoved* part: the manual
 * price, the derived grand total behind it, and the section's willingness to
 * accept the next thing typed into it. A provider that could not be reached is
 * not an application fault and must never surface as `section3-error`, which is
 * where the vault refusing an owner's edit goes.
 */
test('an unreachable provider leaves every typed figure exactly where it was', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'offline-mock' })
  await createVaultAndEnter(session)
  const page = session.page

  await page.getByTestId('nav-section3').click()
  await expect(page.getByTestId('section3')).toBeVisible()

  // Ten grams to Ortak, so the append row needs nothing but a date, a
  // denomination and a price. The person select is left where it starts, which
  // is not an omission: `Ledger.tsx` filters the built-in out of its options and
  // offers an empty one, and the vault resolves a null person to Ortak (§8.1).
  await page.getByTestId('s3-new-date').fill('2026-01-15')
  await page.getByTestId('s3-new-denomination').fill('10')
  await page.getByTestId('s3-new-price').fill('5.000,00')
  await page.getByTestId('s3-new-price').press('Enter')
  await expect(page.locator('[data-testid^="s3-seq-"]')).toHaveCount(1)

  await page.getByTestId('s3-view-prices').click()
  await setManualPrice(page, 'gram', '6.505,00')
  await expect(page.getByTestId('s3-price-stamp-gram')).not.toBeEmpty()

  // Both figures are read off the screen rather than written down here. The
  // claim is that a failed fetch changes neither, and an equality between two
  // reads states that; a literal would additionally be re-asserting Realisation
  // V's arithmetic, which is section3.spec.ts's job and not this file's.
  const typedBefore = await page.getByTestId('s3-manual-price-gram').inputValue()
  await page.getByTestId('s3-view-holdings').click()
  const marketBefore = await page.getByTestId('s3-grand-market').textContent()
  expect(marketBefore?.trim()).toBeTruthy()

  await page.getByTestId('s3-view-prices').click()
  await refreshOnce(page)
  await expect(page.getByTestId('s3-live-error')).toBeVisible()

  // Said once, beside the prices — and not as the alarm the vault raises when it
  // refuses something the owner did.
  await expect(page.getByTestId('section3-error')).toHaveCount(0)
  expect(await page.getByTestId('s3-manual-price-gram').inputValue()).toBe(typedBefore)

  await page.getByTestId('s3-view-holdings').click()
  expect(await page.getByTestId('s3-grand-market').textContent()).toBe(marketBefore)

  // And the part that actually matters: the application carries on. A price
  // typed after the failed fetch commits exactly as one typed before it did.
  await page.getByTestId('s3-view-prices').click()
  await setManualPrice(page, 'usd', '47,00')
  await expect(page.getByTestId('s3-price-stamp-usd')).not.toBeEmpty()
  await expect(page.getByTestId('s3-manual-price-usd')).toHaveValue(/47,00/)
})

/**
 * The drift indicator, from both sides of the line §14 asks for and `drift.ts`
 * draws at two per cent.
 *
 * The manual price moves and the live figure does not, because the limiter
 * permits one fetch a minute and because that is the direction the real thing
 * moves in anyway: the owner types a price they paid, and the question the cell
 * answers is how far the market has gone since.
 */
test('drift is marked when the two figures part company and not when they agree', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'mock' })
  await createVaultAndEnter(session)
  const page = session.page

  // The mock's gram quote stands 25% above ₺5.000,00 and 0,8% below ₺6.300,00,
  // measured as `drift.ts` measures — away from the *typed* price, which is the
  // authority (§8.5). Both are stated against `DRIFT_THRESHOLD` rather than
  // against the two per cent it currently holds, so moving the constant fails
  // this arithmetic here, loudly and on a line that explains itself, instead of
  // failing an assertion about a `data-` attribute that would read as an
  // interface regression.
  const far = 500_000
  const near = 630_000
  expect(Math.abs(LIVE_GRAM_KURUS - far) / far).toBeGreaterThan(DRIFT_THRESHOLD)
  expect(Math.abs(LIVE_GRAM_KURUS - near) / near).toBeLessThan(DRIFT_THRESHOLD)

  await openPrices(page)
  await refreshOnce(page)
  await expect(page.getByTestId('s3-live-price-gram')).toContainText('6.251,37')

  await setManualPrice(page, 'gram', '5.000,00')
  await expect(page.getByTestId('s3-drift-gram')).toHaveAttribute('data-drift', 'drifting')

  await setManualPrice(page, 'gram', '6.300,00')
  await expect(page.getByTestId('s3-drift-gram')).toHaveAttribute('data-drift', 'aligned')

  // The neighbouring row is unaffected throughout: drift is a per-type judgement
  // and a beşli quoted at ₺206.869 against no typed price is not a divergence.
  await expect(page.getByTestId('s3-drift-besli')).toHaveAttribute('data-drift', 'unpriced')
})

/**
 * The Definition of Done, on this rung's own happy path.
 *
 * The exclusion is the one `section2.spec.ts` carries and for the same reason:
 * the `<meta>` CSP is deliberate belt-and-braces over the header, and Chromium
 * notes that one of its directives has no meaning there.
 */
test('the live-price path raises no console error — the Definition of Done, checked', async () => {
  session = await launchFresh({ JADEITE_PRICE_PROVIDER: 'mock' })
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
  await openPrices(page)
  await refreshOnce(page)
  await setManualPrice(page, 'gram', '6.300,00')
  await expect(page.getByTestId('s3-drift-gram')).toHaveAttribute('data-drift', 'aligned')

  // 3b is asserted by its tab rather than by `s3-holdings`, which this vault has
  // no transactions to draw — an empty section renders `s3-holdings-empty`, and
  // waiting for the table would be waiting for a fixture this case does not want.
  await page.getByTestId('s3-view-holdings').click()
  await expect(page.getByTestId('s3-view-holdings')).toHaveAttribute('data-active', 'true')
  await page.getByTestId('s3-view-prices').click()
  await expect(page.getByTestId('s3-prices')).toBeVisible()

  expect(complaints, complaints.join('\n')).toEqual([])
})
