/**
 * Where a figure on the dashboard came from — XJADEITE §10.
 *
 * "Deep-links into the owning section." One module, because two year cards
 * pointing at the same section must mean the same thing by it, and because the
 * alternative — each component reaching into the target store itself — is how
 * two places acquire slightly different ideas of what "open Section 1 at 2023"
 * does.
 *
 * **The navigation is not what opens the year; the synchronous focus is.**
 * `selectYear` begins with an `await`, so it writes nothing before yielding. A
 * caller that selected a year and then switched destination would lose the race
 * against Section 1's own mount, whose `load()` reads `activeYear`, still finds
 * the previous one, and settles on the newest year instead. The owner would
 * click 2023 and arrive at 2026, intermittently, which is the worst kind of
 * defect to reproduce. `focusYear` writes a pending year synchronously and
 * `load` prefers it; this module is where that pairing is kept honest.
 *
 * Nothing here writes to the vault. Focusing a year is view state.
 */

import { useSection1Store } from '../../store/section1-store.js'

/**
 * Tell the destination which year is meant, before it is mounted.
 *
 * A destination with no year concept is left alone rather than treated as an
 * error, and after point revision v0.8b that is every destination but one.
 * Section 2 was the second, until §7.1's amendment left it a single standing
 * grid with no year to focus; Section 3 and Altın Eğrisi never had one, the
 * valuables ledger being a lifetime (§8.3) rather than a workspace.
 */
export function focusYearIn(destinationId: string, year: number): void {
  if (destinationId === 'section1') {
    useSection1Store.getState().focusYear(year)
  }
}
