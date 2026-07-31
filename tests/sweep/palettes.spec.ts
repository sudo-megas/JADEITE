/**
 * Ten palettes, two densities, photographed — Realisation X.
 *
 * **This does not tick a box, and saying so is the point.** X's acceptance reads
 * "the visual sweep: all ten palettes at 1440p and at 1080p", and it sits under
 * *Owner-observed* for the reason Realisation VIII gave when it refused to
 * mechanise the same judgement: "renders beautifully" has no mechanical
 * criterion and is not given a false one. A suite cannot look at a screen.
 *
 * What it can do is make looking cheap. Twenty windows, driven and captured in
 * about a minute, from the **packaged** application rather than the development
 * one — so what the owner reviews is the artefact that will be installed, at the
 * two sizes the two rigs actually run.
 *
 * It survives §1's rule against single-use code on its own merits rather than by
 * exemption: Realisation XI's acceptance is "rendering parity spot-check against
 * Linux screenshots", and this is where those screenshots come from. The second
 * use is already written down in `REALISATION.md`, one rung away.
 *
 * There is one assertion, and it is not decoration. A palette that fails to
 * apply produces a screenshot of the *previous* palette under the new one's
 * name, and a sweep reviewed from twenty files nobody re-checked would pass on
 * ten duplicates. So each capture proves the shell's own background token
 * actually changed to the palette being named.
 *
 * Output: `palette-sweep/<density>/<palette-id>.png`, git-ignored.
 *
 * **Not `test-results/`, and that was learned the hard way.** Playwright empties
 * its output directory at the start of every run, so twenty screenshots written
 * there survived exactly until the next `verify:package` and then silently did
 * not exist. Evidence a human is meant to look at later cannot live in a folder
 * another suite owns and clears — the failure is quiet, and the thing lost is
 * the only artefact of a check no test can make.
 */

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { PALETTES } from '../../src/shared/theme/palettes/index.js'
import { createVaultAndEnter, launchPackagedFresh, projectRoot, type Session } from '../e2e/fixtures.js'

/** The two rigs of §3.4, by the panel each one has. */
const DENSITIES = [
  { name: '1440p', width: 2560, height: 1440 },
  { name: '1080p', width: 1920, height: 1080 }
] as const

const outputRoot = resolve(projectRoot, 'palette-sweep')

test.describe('the visual sweep', () => {
  let session: Session

  test.beforeAll(async () => {
    session = await launchPackagedFresh()
    await createVaultAndEnter(session)
    await furnishSectionOne()
  })

  /**
   * Enough figures for a palette to be judged on.
   *
   * The first version of this file photographed an empty vault, and the
   * screenshots were of Section 1's *empty state* — one sentence of muted text
   * on a bare surface. Ten palettes rendered that almost identically, and a
   * sweep of twenty such images would have shown the owner nothing they could
   * refuse. What has to be visible is what a palette can get wrong: grid rules
   * against the surface, header weight, the alternating row tint, the year
   * accent, and income against expense — which are two *different* colours and
   * the pair most likely to collapse into each other on a light theme.
   *
   * Six columns and two months, typed through the real interface. Small enough
   * to add four seconds to the run; wide enough that both subtotal rows and the
   * net line are on screen under every palette.
   */
  async function furnishSectionOne(): Promise<void> {
    const page = session.page
    await page.getByTestId('nav-section1').click()
    await page.getByTestId('section1').waitFor()

    const columns = [
      { name: 'MAAŞ', kind: 'income', values: ['71111,11', '71111,11'] },
      { name: 'KİRA GELİRİ', kind: 'income', values: ['2222,22', '2222,22'] },
      { name: 'EK DERS', kind: 'income', values: ['12345,67', '9000'] },
      { name: 'KİRA', kind: 'expense', values: ['31500', '31500'] },
      { name: 'AİDAT', kind: 'expense', values: ['2475,33', '2475,33'] },
      { name: 'ELEKTRİK', kind: 'expense', values: ['419,25', '1180,40'] }
    ] as const

    for (const column of columns) {
      await page.getByTestId('new-column-name').fill(column.name)
      await page.getByTestId('new-column-kind').selectOption(column.kind)
      await page.getByTestId('add-column-submit').click()
      await page.getByTestId(`header-${column.name}`).waitFor()
    }

    for (const column of columns) {
      for (const [index, month] of ['Ocak', 'Şubat'].entries()) {
        const cell = page.getByTestId(`cell-${column.name}-${month}`)
        await cell.click()
        await cell.fill(column.values[index]!)
        await cell.press('Enter')
      }
    }
  }

  test.afterAll(async () => {
    await session?.close()
  })

  for (const density of DENSITIES) {
    test(`captures all ten palettes at ${density.name}`, async () => {
      mkdirSync(resolve(outputRoot, density.name), { recursive: true })

      // The window is resized through Electron rather than through Playwright's
      // viewport, because a BrowserWindow's own dimensions are what the CSS
      // responds to; `setViewportSize` would resize the page inside a window
      // that stayed the size it was.
      await session.app.evaluate(({ BrowserWindow }, size) => {
        const win = BrowserWindow.getAllWindows()[0]
        win?.setSize(size.width, size.height)
      }, density)

      await session.page.getByTestId('nav-settings').click()

      for (const palette of PALETTES) {
        await session.page.getByTestId(`palette-${palette.id}`).click()

        // Proof that this file is twenty distinct windows and not ten pairs.
        // `applyPalette` writes every token as a custom property and stamps the
        // id on the root element, so both halves are checked: the label says
        // which palette this is, and `--surface` says the tokens under it
        // actually moved. Asserting the *expected value* rather than merely a
        // non-empty one is what makes the second half worth writing — two
        // palettes that both applied would satisfy "not empty" equally well.
        const applied = await session.page.evaluate(() => ({
          id: document.documentElement.dataset['palette'] ?? '',
          surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
        }))
        expect(applied.id, `palette ${palette.id} did not apply`).toBe(palette.id)
        expect(applied.surface.toLowerCase(), `palette ${palette.id} kept the old surface`).toBe(
          palette.tokens.surface.toLowerCase()
        )

        // Section 1 rather than the settings panel: it is the densest surface in
        // the application — grid lines, alternating rows, the year accent, money
        // in two colours — and therefore the one where a palette fails visibly.
        await session.page.getByTestId('nav-section1').click()
        await session.page.getByTestId('section1').waitFor()
        await session.page.screenshot({
          path: resolve(outputRoot, density.name, `${palette.id}.png`)
        })

        await session.page.getByTestId('nav-settings').click()
      }
    })
  }
})
