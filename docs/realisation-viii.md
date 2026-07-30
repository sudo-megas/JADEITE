# Realisation VIII — Overview

Companion notes to `REALISATION.md` and `XJADEITE.md`. §10 is four sentences long
and asks for the showpiece: all years as cards, four grand totals, three trend
charts, read-only, every figure derived. The work was not in the drawing. It was
in deciding what a tile says when it has nothing to say — because a dashboard is
where a total that silently omits something does the most damage, and this
application exists as a reply to two documents that looked complete and disagreed
by a car.

---

## 1. Three tiles compute a real zero in a state that is not zero

This is the rung's central problem and it is not obvious until it is written down.

- **Unrealised gain.** `marketValue − pricedCostBasis`, and with nothing priced
  both terms are zero. `0,00 ₺` under "gerçekleşmemiş K/Z" reads as *you are
  exactly break-even*, from a vault where no price has ever been typed.
- **Remaining limit.** `totalRemainingLimit` accumulates over the columns that
  have a limit, so a year holding only counter columns totals zero across an
  empty row. `0,00 ₺` under "kalan limit" reads as *no headroom left* — the
  precise misreading a counter column's `remaining: null` exists to prevent.
- **Current debt.** A grid with no columns at all totals zero, and *you owe
  nothing* is a claim made out of an empty table.

None of the three is a bug in the engines; every one is correct arithmetic over
an absent input. So every tile selector in `sections/overview/selectors.ts`
returns a **discriminated union** and never a bare number, and the component
renders an em dash and a sentence saying which absence this is. A tile that can
only answer with a figure has no way to say *there is no figure*, and will
therefore say something false.

The same shape covers the year card, which has four cases where two would have
looked sufficient: a year with a lira column, a year with only foreign columns, a
year with no columns at all, and a year whose workspace failed to read. The last
is drawn rather than skipped — a year missing from a dashboard is
indistinguishable from a year that held nothing.

### 1.1 A card shows the lira net and says when there is more

`yearBuckets` is one bucket per value type in use, never a single number, and the
Section 1 engine says why: "a year that also holds a dollar column gets a second
bucket instead of a number that means nothing." Summing across them is forbidden,
so the card shows the TRY bucket — and carries a marker when the year holds
others. Without the marker the card would be the retiring workbook's own defect
in a new typeface: a total that is right about what it covers and silent about
what it does not.

`bucketOf` returns a *zeroed* bucket for a type not in use, so a USD-only year
asked for TRY would answer `0,00 ₺` over a year of dollars. The `other-only`
branch exists to stop that call being made, not to decorate its result.

## 2. The cross-check had to be made to mean something

> - [ ] Every Overview number equals its section source (automated cross-check).

Overview calls the same shared engines the sections call. A test comparing the
two in code would therefore prove that a pure function is deterministic, and
nothing else. So the check is **surface to surface**: read the rendered figure
out of Overview's DOM, navigate to the owning section, read the rendered figure
out of *its* DOM, and compare the strings. Two independent render paths over one
database.

**The fixture has to discriminate or half the assertions are theatre.** Three
properties, each chosen against a specific wrong implementation:

- a counter column carrying a nonzero cell, because without one
  `totalRemainingLimit` read correctly and computed as `limit − debt` over all
  columns give the same answer;
- a held type that is unpriced *and* carries cost, because without one
  `marketValue − pricedCostBasis` and `marketValue − costBasis` agree — on the
  suite's own fixture the two differ by ₺81.344 and by a sign;
- a year with a second value type, so the card's marker has something to mark.

The unpriced comparison names **types** rather than counting complaints. Section
3 renders localised names; a count would degrade to "both objected". Both sides
now carry `data-unpriced-types` from `shared/section3/codes.ts`, sorted the same
way, so the assertion is that they name the same things.

## 3. The chart options were pinned before they were lifted

Overview draws the same valuables value line Altın Eğrisi draws, so the option
builders moved to `sections/charts/options.ts`. The obvious proof that such a
move changed nothing is that Realisation VI's suite still passes, and **it is
false**: not one assertion anywhere in `tests/` reads a value out of an ECharts
option object. `Chart.tsx` renders `data-scale` from a JSX prop rather than from
what `valueAxis` returned, so the axis could have flipped to linear with the
entire suite green — including the case that exists to satisfy the log-toggle
acceptance line of Realisation VI, which is the line the chart view was built
around.

`tests/unit/chart-options.test.ts` was therefore written against the functions
where they stood, and only then did they move.

**Only what gained a second caller went.** `base`, `dateAxis`, `valueAxis` and
the value-series builder have two callers now; `Filter`, `logFloor`, `spanDays`
and `quantityLabel` have one each and stayed. Rule 7 asks a feature to earn its
place through repeated use, and a shared module of things one view uses is a
dependency pretending to be an abstraction.

`base` gained `{ zoom }`, and Overview passes `false`. Altın Eğrisi's zoom pair is
a wheel handler over the plot and a brush beneath, which suits a date axis
spanning years; a twelve-point category chart has nothing to zoom into, and the
inside handler would swallow the mouse wheel inside the element that *is* the
dashboard's own scroller. The page would stop scrolling wherever the pointer came
to rest — found on first use, never by a test.

## 4. The deep links were racing, and would have raced intermittently

`selectYear` in both grid stores begins with an `await`; it writes nothing
synchronously. So a card that selected a year and then switched destination lost
the race against the target section's own mount, whose `load()` reads
`activeYear`, still finds the previous one, and settles on the newest year
instead. The owner clicks 2023 and arrives at 2026 — sometimes.

Both stores gained a synchronous `focusYear` that writes a pending year, and
`load` prefers it over the year already open and over the newest. One module,
`sections/overview/navigate.ts`, owns the pairing, so a card and a tile cannot
come to mean different things by "open the section that owns this".

## 5. Read-only is structural, not intended

The Overview store exposes no mutator and no component on the page receives a
callback that reaches one. There is no code path from this screen to a write —
which is a stronger statement than "nothing here writes", and the only one worth
making about a page whose whole content is the owner's money.

**Schema v3 is unchanged.** Realisation VIII added no table, no column and no
channel. It loops the per-year channels that Realisations III and IV already
built — `s1:years` once, then `s1:workspace` and `s2:grid` per year, plus the
single lifetime `s3:ledger`. A multi-year channel would have wanted to assemble
something in the main process, and `years.ts` forbids exactly that: "No
arithmetic lives here. Totals are computed by the section engines and stored
nowhere." Saving nineteen synchronous SQLite reads was not worth a second place
where a rule about the owner's money is written down.

## 6. What is photographed and what is measured

"Renders beautifully in all ten palettes, both densities" splits in two.
*Beautifully* is not automatable and was photographed. *Nothing clipped* is, and
it is what this project's own history says matters: `app.css` carries a note
recording that §8.3's amendment cost the ledger two columns and pushed a button
off the edge at 1080p, found by looking.

So the suite resizes the window to 1920 × 1080, 2560 × 1440 **and 1280 × 820** —
that last being the size `main/index.ts` actually opens, which nothing maximises,
and therefore the size a dashboard laid out against 1920 would be wrong at. Every
tile figure and every card net is asserted unclipped at all three, and the year
cards' accent custom properties are asserted to resolve in all ten palettes,
because a collapsed `color-mix` renders as nothing and no other test would notice.

---

## 7. What this Realisation proves

- `tests/unit/overview-selection.test.ts` — every tile's absent states, the four
  year-card branches, both wrong readings of `totalRemainingLimit` written down
  so a future simplification fails here, and both chart series against hand-typed
  points.
- `tests/unit/chart-options.test.ts` — the option objects the lift moved, pinned
  before it moved them: the time axis, the log flip, the zoom pair and its
  absence, and a colour for every option in all ten palettes.
- `tests/e2e/overview.spec.ts` — the surface-to-surface cross-check over a
  discriminating fixture, the year with no columns refusing to report zero, the
  deep link landing on the year it was asked for, nothing clipped at three
  window sizes, the accents resolving in ten palettes, and no console error.
- `tests/e2e/shell.spec.ts` — the last stub is gone; every destination is
  furnished.

428 unit tests, 219 Electron-hosted, 98 end-to-end, all three audits, and every
Realisation I to VII acceptance check still passing. Cold start 687 ms against a
1.500 ms budget; unlock 525 ms against 1.000 ms.
