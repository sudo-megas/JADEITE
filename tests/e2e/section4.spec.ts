/**
 * Realisation VI acceptance for §9, driven through the real application, and
 * the reconfiguration of 31 July 2026 that replaced its list with a grid.
 *
 * "Median correct for odd and even counts; empty state sane" is what the ladder
 * asks, and that is unchanged. The arithmetic is pinned in the unit suite; what
 * is proved here is that the three headers say the right thing on screen while
 * the figures go in, including when there is nothing to say — and that the grid
 * grows, asks before it is emptied, and can be filled without a mouse.
 */

import { expect, test, type Locator, type Page } from '@playwright/test'

import { createVaultAndEnter, launchFresh, type Session } from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

async function openSection4(page: Page): Promise<void> {
  await page.getByTestId('nav-section4').click()
  await expect(page.getByTestId('section4')).toBeVisible()
}

/** Every box the grid is currently drawing. */
function boxes(page: Page): Locator {
  return page.getByTestId('s4-grid').locator('input')
}

/** Put a figure in one box and commit it. */
async function fill(page: Page, slot: number, value: string): Promise<void> {
  const box = page.getByTestId(`s4-box-${slot}`)
  await box.click()
  await box.fill(value)
  await box.press('Enter')
}

test('the empty state says there is nothing rather than showing a zero', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)

  // A zero total is a real answer for a grid of zeros; an empty grid has none.
  await expect(page.getByTestId('s4-total')).toHaveText('—')
  await expect(page.getByTestId('s4-average')).toHaveText('—')
  await expect(page.getByTestId('s4-median')).toHaveText('—')

  // A hundred boxes, ready, before anything at all is typed.
  await expect(boxes(page)).toHaveCount(100)
})

test('the three statistics move as the figures go in', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)

  await fill(page, 0, '12.000,00')
  await expect(page.getByTestId('s4-total')).toHaveText('12.000,00')
  await expect(page.getByTestId('s4-average')).toHaveText('12.000,00')
  await expect(page.getByTestId('s4-median')).toHaveText('12.000,00')

  await fill(page, 1, '1.450,00')
  await expect(page.getByTestId('s4-total')).toHaveText('13.450,00')
  // Two figures: the median is the mean of both, and so is the average.
  await expect(page.getByTestId('s4-median')).toHaveText('6.725,00')

  await fill(page, 2, '3.200,00')
  await expect(page.getByTestId('s4-total')).toHaveText('16.650,00')
  await expect(page.getByTestId('s4-average')).toHaveText('5.550,00')
  await expect(page.getByTestId('s4-median')).toHaveText('3.200,00')
  await expect(page.getByTestId('s4-count')).toContainText('3')
})

test('the median is right for an even count', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)
  await fill(page, 0, '100,00')
  await fill(page, 1, '200,00')
  await fill(page, 2, '300,00')
  await fill(page, 3, '400,00')

  // The mean of the two middle figures, 200 and 300.
  await expect(page.getByTestId('s4-median')).toHaveText('250,00')
  await expect(page.getByTestId('s4-average')).toHaveText('250,00')
  await expect(page.getByTestId('s4-total')).toHaveText('1.000,00')
})

test('a row of ten appears as soon as the last row is used', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)
  await expect(boxes(page)).toHaveCount(100)

  // Box 90 is the first box of the tenth row, and the tenth row is the last.
  await fill(page, 90, '5,00')
  await expect(boxes(page)).toHaveCount(110)

  // Filling the rest of that row asks for no more than the row already added.
  await fill(page, 95, '5,00')
  await expect(boxes(page)).toHaveCount(110)

  // And the row must not vanish from under the caret when the figure that
  // summoned it is taken away again.
  const box = page.getByTestId('s4-box-90')
  await box.click()
  await box.fill('')
  await box.press('Enter')
  await expect(page.getByTestId('s4-count')).toContainText('1')
  await expect(boxes(page)).toHaveCount(110)
})

test('clearing a box takes its figure out of the statistics', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)
  await fill(page, 0, '100,00')
  await fill(page, 1, '300,00')
  await expect(page.getByTestId('s4-average')).toHaveText('200,00')

  const box = page.getByTestId('s4-box-0')
  await box.click()
  await box.fill('')
  await box.press('Enter')

  // Emptied, not zeroed: a zero would have kept the count at two and halved it.
  await expect(page.getByTestId('s4-count')).toContainText('1')
  await expect(page.getByTestId('s4-total')).toHaveText('300,00')
  await expect(page.getByTestId('s4-average')).toHaveText('300,00')
})

test('emptying the whole grid asks first', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)
  await fill(page, 0, '100,00')
  await fill(page, 1, '300,00')
  await fill(page, 90, '7,00')
  await expect(boxes(page)).toHaveCount(110)

  // The first click asks. Nothing has gone anywhere yet.
  await page.getByTestId('s4-clear').click()
  await expect(page.getByTestId('s4-clear-confirm')).toBeVisible()
  await expect(page.getByTestId('s4-total')).toHaveText('407,00')
  await expect(page.getByTestId('s4-box-0')).toHaveValue('100,00')

  // The second click empties it, and the grid comes back to its own floor.
  await page.getByTestId('s4-clear-confirm').click()
  await expect(page.getByTestId('s4-total')).toHaveText('—')
  await expect(page.getByTestId('s4-box-0')).toHaveValue('')
  await expect(boxes(page)).toHaveCount(100)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a figure that cannot be read is refused rather than guessed at', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)

  const box = page.getByTestId('s4-box-0')
  await box.click()
  await box.fill('1.5')
  await box.press('Enter')

  // "1.5" is not a Turkish number, and guessing would store 15 or 1,5. The box
  // keeps what was typed rather than discarding it.
  await expect(box).toHaveValue('1.5')
  await expect(box).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('s4-total')).toHaveText('—')
})

test('a run of figures goes in without the mouse', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)

  // The acceptance is that the whole run needs no mouse acquisition, not that a
  // particular key does it: boxes are in DOM order, so Tab walks the row.
  await page.getByTestId('s4-box-0').focus()
  for (let i = 1; i <= 10; i += 1) {
    await page.keyboard.type(`${i}00,00`)
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('s4-count')).toContainText(`${i} `)
  }

  // Σ 100..1000 = 5.500,00, average 550,00, median the mean of 500 and 600.
  await expect(page.getByTestId('s4-total')).toHaveText('5.500,00')
  await expect(page.getByTestId('s4-average')).toHaveText('550,00')
  await expect(page.getByTestId('s4-median')).toHaveText('550,00')

  // Tab landed on the eleventh box, which is the first of the second row.
  await expect(page.getByTestId('s4-box-10')).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
