# Realisation VI — Section 4 and Altın Eğrisi

Companion notes to `REALISATION.md` and `XJADEITE.md`. Two sections in one rung,
and they have almost nothing in common: §9 is the least fancy thing in the
application and §11 is the one that ends a PowerPoint deck. What they share is that
neither stores a number it could compute.

---

## 1. Section 4 — three statistics and one rounding decision

§9 wants TOTAL, AVERAGE and MEDIAN always visible over an indefinite list of
label-and-value lines. Everything about it is trivial except one thing, and that
thing is division.

### 1.1 The average and the even-count median are rounded to the input's precision

Values are integer hundredths, as `plain`-typed Section 1 columns already are, so
the total is exact. The average divides, and the median divides whenever the count
is even. Both are **rounded half up to hundredths**.

The rejected alternative was carrying the exact quotient. Three values of 1, 1 and
2 would then average to 1,3333333333333333 — a number with fourteen decimal places
of precision that none of its inputs has. In a scratchpad the owner is using to
answer a question quickly, that is worse than a rounded figure: it looks like
precision and is noise.

`divideRounded` is the only place the decision lives, and the unit suite pins both
parities and the exact halfway cases (1,00 and 1,01 average to 1,005, which becomes
1,01).

### 1.2 A line with a label and no figure is a heading, not a zero

`s4_lines.value` is nullable, and empty stays empty. A heading typed above three
figures must not join their average, and `count` reports the number of *figures*
rather than the number of lines so the interface can say which it means.

The e2e suite checks the case directly: three lines, two figures, average 200,00 —
where a heading counted as zero would give 133,33.

### 1.3 The statistics live in the renderer, not behind the bridge

`Section4Api` has five methods and none of them returns a statistic. Total, average
and median are three additions and a sort over data the renderer already holds;
crossing the bridge to fetch them would give one truth a second home, and a channel
that could disagree with the list beside it.

This is the opposite call from Section 3, where `computeHoldings` also runs in the
renderer but over a *single* read deliberately fetched whole — same principle,
different consequence.

### 1.4 Values are non-negative, like every other figure in the app

Figures reach §9 through `parseAmount`, which refuses a leading minus (§5.2). So a
scratchpad cannot net one figure against another today. That is a real limitation
and it is deliberate: the convention that no stored amount carries a sign is what
retires the June-2025 elektrik slip, and breaking it for the least important section
in the application would be a poor trade.

`divideRounded` therefore does not carry a sign branch. Should §9 ever want
netting, that function and the parser are the two places that have to learn about
it, and the comment in the engine says so.

**Schema v1 is unchanged.** `s4_lines` was authored in Realisation I and needed
nothing — the third Realisation running for which that is true.

---

## 2. Altın Eğrisi — a view with no store

### 2.1 It reads Section 3's store and has none of its own

§11 says the charts are "a *view*, never a data store", and the literal shape of
that ruling is that `sections/altin/AltinEgrisi.tsx` imports `useSection3Store`.
There is no `altin-store.ts`, no IPC channel, no table and no migration. The charts
have exactly one input, and it is the ledger.

That is the whole answer to the defect being retired. The deck this replaces held
two charts maintained by hand in a third application: they drifted a purchase apart
from each other, and both drifted from the ledger they described. Here a row
reaches all three series or none of them, which
`tests/unit/altin-series.test.ts` asserts by adding one row and checking that every
series grew by exactly one point.

The e2e suite asserts the same thing from the other side: there is no text field
and no form anywhere in the section. Zero manual chart maintenance is not a promise
about discipline; it is the absence of any way to do it.

### 2.2 The log toggle applies to two charts of three, and says why

§11 asks for a log-scale toggle, and the reason it exists is documented in the
specification's own §18.3 item 5: 300 g and 400 g were typed as `0.300` and `0.400`
so a linear axis would not crush them beside the 10 g purchases.

Spektrum and Frekans take the toggle. **Değer does not**, and this is the decision
worth recording. A market value can legitimately be zero, and can read negative
while a disposal's matching purchases are still being typed (`docs/realisation-v.md`
§2). Neither has a place on a logarithmic axis. The two ways to allow the toggle
anyway were both refused: dropping the non-positive points would hide data to make a
chart prettier, and clamping them would state something false. So the chart stays
linear and, when the toggle is on, says in one line why it did not follow.

### 2.3 The application detects the crushing itself

"With test data containing a 300 alongside 10s: linear view crushes, log toggle
makes both readable" is an acceptance line about what an eye can see, which is
awkward to assert.

But it is really a question about a *ratio*, so `spansOrdersOfMagnitude` answers it
from the data: when the largest value is ten times the smallest or more, the small
ones are within a pixel or two of the axis. When that is true and the toggle is
off, the page says so and names the toggle as the fix.

That turned an untestable visual claim into a testable one, and it is also simply
better: the owner is told the axis is misleading them rather than left to notice.

### 2.4 The price history is the ledger's own rows

§11.3 asks for "holdings × price history where available". There is no price
history table — §8.5 keeps one current price per type, not a series, and adding one
would be a second record for the owner to maintain, which §11 exists to abolish.

What *is* available is that every ledger row records a price on a date. So
`buildSeries` walks the events once, carrying running holdings and the newest price
seen per type, and emits the total at each event date. Where the ledger is silent
the line simply holds its last value, which is honest: nothing is known to have
changed.

Two events on one day collapse to the state that day ended in. A chart drawing both
would show a step the owner never held.

### 2.5 A true date axis, and why the mistyped date test measures a span

§11 asks for a real date axis specifically, because that is what makes an
out-of-order or mistyped date visible: on a category axis a stray point is the next
bar along, while on a time axis it lands in the wrong year.

The e2e suite measures this. The chart reports the span of dates it is drawing as a
data attribute, and the test types `2016-03-15` where `2026-03-15` was meant — one
digit, ten years — and asserts the span goes from 31 days to over 3.600, more than a
hundredfold. That is the quantity behind "visually obvious".

### 2.6 Colours are handed to ECharts, not read from the DOM

A canvas cannot resolve a CSS custom property, so a charting library has to be told
its colours. They come from `@shared/theme/palettes`, which §12.2 names as the one
place permitted to hold a colour value — series take successive entries from the
palette's own accent sequence, exactly as year workspaces do.

The alternative was `getComputedStyle` on the document root, which the shell test
already uses to *verify* tokens. It was refused for application code: it reads back
what the browser resolved, so a typo in a property name yields an empty string and a
chart with invisible lines rather than a build failure.

A palette switch replaces the ECharts instance rather than merging into it, because
ECharts merges option objects and a stale colour would otherwise survive the switch.

### 2.7 ECharts is imported through its core

`echarts/core` with `LineChart`, `BarChart`, and only the grid, tooltip, legend,
data-zoom and mark-line components registered. §1 says dependency size is not a
constraint and up to a gigabyte is acceptable — but a megabyte of gauge charts and
treemaps is not a dependency, it is ballast, and the renderer bundle went from
1,0 MB to 2,5 MB as it is.

Cold start was re-verified afterwards and is unaffected: 680 ms to the lock screen
against a 1.500 ms budget, 527 ms to the shell excluding Argon2id against 1.000 ms.

### 2.8 The charts are what a provisional date affects most

A row carrying `date_provisional` is at the wrong place on a date axis by
definition, so the section says how many such rows exist. §18.3 item 6's row — the
₺1.865 purchase whose price proves its date wrong — will sit visibly out of place
until open item Q1 is resolved, and the note explains that the curve misleads there
rather than leaving the owner to trust it.

---

## 3. What this Realisation proves

- `tests/unit/section4-engine.test.ts` — both median parities, the halfway cases,
  headings excluded, a thousand lines totalled exactly.
- `tests/unit/altin-series.test.ts` — all three series from one pass, 300 arriving
  as 300, drift made impossible, filters, and the order-of-magnitude detection.
- `tests/electron/section4-suite.ts` — a line survives storage: empty stays empty,
  an unlabelled line is allowed, order is kept, gaps close.
- `tests/e2e/section4.spec.ts` — the three headers on screen, the empty state
  saying nothing rather than zero, and ten lines typed without the mouse.
- `tests/e2e/altin.spec.ts` — the four acceptance lines of §11, including the
  hundredfold span that makes a mistyped date obvious and the absence of any way to
  add a point to a chart.

299 unit tests, 153 Electron-hosted, 81 end-to-end, both audits, and every
Realisation I to V acceptance check still passing.
