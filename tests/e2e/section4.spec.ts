/**
 * Realisation VI acceptance for §9, driven through the real application.
 *
 * "Median correct for odd and even counts; empty state sane" is what the ladder
 * asks. The arithmetic is pinned in the unit suite; what is proved here is that
 * the three headers say the right thing on screen, including when there is
 * nothing to say.
 */

import { expect, test, type Page } from '@playwright/test'

import { createVaultAndEnter, launchFresh, type Session } from './fixtures.js'

let session: Session

test.afterEach(async () => {
  await session?.close()
})

async function openSection4(page: Page): Promise<void> {
  await page.getByTestId('nav-section4').click()
  await expect(page.getByTestId('section4')).toBeVisible()
}

/** Compose the append row and commit it with Enter, never the mouse. */
async function addLine(page: Page, label: string, value: string): Promise<void> {
  const before = await page.getByTestId('s4-lines').locator('li').count()
  await page.getByTestId('s4-new-label').fill(label)
  await page.getByTestId('s4-new-value').fill(value)
  await page.getByTestId('s4-new-value').press('Enter')
  await expect(page.getByTestId('s4-lines').locator('li')).toHaveCount(before + 1)
}

test('the empty state says there is nothing rather than showing a zero', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)

  // A zero total is a real answer for a list of zeros; an empty list has none.
  await expect(page.getByTestId('s4-total')).toHaveText('—')
  await expect(page.getByTestId('s4-average')).toHaveText('—')
  await expect(page.getByTestId('s4-median')).toHaveText('—')
  await expect(page.getByTestId('s4-lines').locator('li')).toHaveCount(0)
})

test('the median is right for an odd count', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)
  await addLine(page, 'Kira', '12.000,00')
  await addLine(page, 'Fatura', '1.450,00')
  await addLine(page, 'Market', '3.200,00')

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
  await addLine(page, 'A', '100,00')
  await addLine(page, 'B', '200,00')
  await addLine(page, 'C', '300,00')
  await addLine(page, 'D', '400,00')

  // The mean of the two middle figures, 200 and 300.
  await expect(page.getByTestId('s4-median')).toHaveText('250,00')
  await expect(page.getByTestId('s4-average')).toHaveText('250,00')
  await expect(page.getByTestId('s4-total')).toHaveText('1.000,00')
})

test('a line with only a label is a heading and joins no average', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)
  await addLine(page, 'Giderler', '')
  await addLine(page, 'Kira', '100,00')
  await addLine(page, 'Fatura', '300,00')

  // Three lines, two figures. A heading counted as zero would give 133,33.
  await expect(page.getByTestId('s4-lines').locator('li')).toHaveCount(3)
  await expect(page.getByTestId('s4-count')).toContainText('2')
  await expect(page.getByTestId('s4-average')).toHaveText('200,00')
})

test('clearing a figure turns its line back into a heading', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)
  await addLine(page, 'Kira', '100,00')
  await addLine(page, 'Fatura', '300,00')
  await expect(page.getByTestId('s4-average')).toHaveText('200,00')

  const cell = page.getByTestId('s4-value-1')
  await cell.click()
  await cell.fill('')
  await cell.press('Enter')

  await expect(page.getByTestId('s4-count')).toContainText('1')
  await expect(page.getByTestId('s4-total')).toHaveText('300,00')
})

test('a figure that cannot be read is refused rather than guessed at', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)

  await page.getByTestId('s4-new-label').fill('Yanlış')
  await page.getByTestId('s4-new-value').fill('1.5')
  await page.getByTestId('s4-new-value').press('Enter')

  // "1.5" is not a Turkish number, and guessing would store 15 or 1,5.
  await expect(page.getByTestId('s4-append-problem')).toBeVisible()
  await expect(page.getByTestId('s4-lines').locator('li')).toHaveCount(0)
  await expect(page.getByTestId('s4-new-value')).toHaveValue('1.5')
})

test('a line can be removed, and the headers follow', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)
  await addLine(page, 'A', '100,00')
  await addLine(page, 'B', '300,00')

  await page.getByTestId('s4-delete-1').click()
  await page.getByTestId('s4-delete-confirm-1').click()

  await expect(page.getByTestId('s4-lines').locator('li')).toHaveCount(1)
  await expect(page.getByTestId('s4-total')).toHaveText('300,00')
  await expect(page.getByTestId('s4-median')).toHaveText('300,00')
})

test('a column of figures goes in without the mouse', async () => {
  session = await launchFresh()
  await createVaultAndEnter(session)
  const page = session.page

  await openSection4(page)

  await page.getByTestId('s4-new-label').click()
  for (let i = 1; i <= 10; i += 1) {
    await page.keyboard.type(`Satır ${i}`)
    await page.keyboard.press('Tab')
    await page.keyboard.type(`${i}00,00`)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('s4-lines').locator('li')).toHaveCount(i)
  }

  // Σ 100..1000 = 5.500,00, average 550,00, median the mean of 500 and 600.
  await expect(page.getByTestId('s4-total')).toHaveText('5.500,00')
  await expect(page.getByTestId('s4-average')).toHaveText('550,00')
  await expect(page.getByTestId('s4-median')).toHaveText('550,00')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
