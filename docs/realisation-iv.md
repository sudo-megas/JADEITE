# Realisation IV — Section 2: Payments / Installments

Companion notes to `REALISATION.md` and `XJADEITE.md`. Two things are recorded
here because the ladder asks for them: where the grid stops being TanStack's and
starts being ours, and the decisions Section 2 had to settle where the
specification left room.

---

## 1. No spike this time, and what the last one still cost

TanStack Table was settled in Realisation III (`docs/realisation-iii.md` §1) and
was not re-litigated. Section 2 asked two things of it the spike never
exercised — a **third header row** and a **three-row footer** — and the answer
in both cases was that it should not provide them.

TanStack yields exactly one header row per level of the column tree. A third row
therefore means a third nesting level: every leaf wrapped in a single-child
group whose header draws the credit limit. That was tried on paper and rejected.
It renders in the wrong order, because group headers descend; it makes
`column.parent` point at a synthetic wrapper, which breaks the `data-group`
attribute every band-tinting rule in `app.css` depends on; and it encodes an
*editable data row* as table structure, which is a lie about what the row is.

So the Credit Limit row and the lower two footer rows are written by hand over
`table.getVisibleLeafColumns()` — the same technique Section 1's selection row
already uses (`sections/section1/Grid.tsx`). The division that results:

| Bar | §7.1 | Drawn by |
|---|---|---|
| group band | — | `getHeaderGroups()[0]` |
| 1. Bank Name | top bar 1 | `getHeaderGroups()[1]` |
| **2. Credit Limit** | top bar 2 | **hand-written `<tr>`** |
| twelve month lines | body | `getRowModel()` |
| 1. DEBT | bottom bar 1 | `getFooterGroups()[0]` |
| **2. Remaining Limit** | bottom bar 2 | **hand-written `<tr>`** |
| **3. TOTAL REMAINING LIMIT** | bottom bar 3 | **hand-written `<tr>`** |

**GRAND TOTAL DEBT needed no code at all.** It is the footer of the TOTAL DEBT
column, which lands on the DEBT row by construction — the intersection §7.1
describes, for free. That is the one place where the layout and the library
agreed completely, and it is worth writing down because everything around it
had to be argued for.

The structural rule from III's closing note applies unchanged and is restated at
the top of `sections/section2/Grid.tsx`: every renderer handed to `flexRender` is
declared once, at module level. It cost an afternoon once; it did not cost one
again.

**Schema v1 is unchanged.** `s2_banks`, `s2_cells` and `years.s2_archived` were
authored in Realisation I and needed nothing. No migration was written.

---

## 2. Decisions Section 2 had to settle

Each of these was a place where the specification permitted more than one
reading. The reading chosen is recorded with the reason, so a later Realisation
can disagree deliberately rather than by accident.

### 2.1 A counter column is one flag, inverted in one function

§7.1 says counter values "are computationally reversed relative to debts —
stored positive with `is_counter`; the engine applies the sign". That is
implemented as `signedDebt` in `shared/section2/engine.ts`, a two-line function
that is the only place in the application which knows what the flag means. It is
the deliberate mirror of Section 1's `signedContribution`.

The rejected alternative was storing counter values negative, as the sheet does.
That is the shape §5.2 exists to make unrepresentable: a stored sign is a sign
that can be forgotten, and forgetting one is precisely the June-2025 elektrik
slip that §18.2 records.

A related refusal: **a bank cannot become a counter column.** There is no
`setIsCounter`. Flipping it would re-sign a year of the owner's money in one
click, which is the same class of accident wearing a different hat. To change
one, delete it and add it again — an operation that says what it destroys first.

### 2.2 The remaining limit belongs to the card, not to the net

This one was decided wrongly first, and the workbook corrected it.

The planning ruling read `TOTAL REMAINING LIMIT = Σ credit limits − GRAND TOTAL
DEBT`, on the reasoning that a counter column reduces what is owed and should
therefore restore headroom. Checked against the sheet, that produces a figure
that misses REALISATION.md's own acceptance line by exactly the counter total.

The reading that reproduces it — and that the sheet's own `C23=SUM(C22:H22)`
corroborates — is simply the total of the row above it:

```
REMAINING[bank]       = credit_limit − DEBT[bank]      (real banks only)
TOTAL REMAINING LIMIT = Σ REMAINING[bank]
```

Three reasons, in ascending order of how much they should have mattered from the
start. It is what the sheet computes. It is what "bottom bar row 3" means: the
total of a row, and a counter column has no cell in that row because it has no
limit. And it is the only one that is *true* — money someone else is paying back
reduces what you owe, but it does not restore headroom on a Banka C card, and
a number that mixes the two is neither.

`counters[].remaining` is therefore `null`, not `0`. A zero would read as "no
headroom left" and would join the row's total. The unit suite asserts the null
and asserts the two candidate formulas differ by the counter total, so the
question cannot be quietly reopened.

### 2.3 A grid whose rows are the calendar is not sorted

Section 1 has three-state per-column sort and six filter modes. Section 2 has
neither, and `getSortedRowModel` / `getFilteredRowModel` are not installed at
all.

§7 asks for neither, and the section's stated purpose is "what month, how much
in total, seen in advance". Chronology is the entire semantic. Sorting twelve
months by amount destroys the only ordering the section is about, and makes the
paid/pending cue of §2.5 below nonsense the moment July sits above March.
Filtering would additionally force Section 1's selection-row discipline across
three interdependent footer rows, to answer a question the magnitude bar already
answers at a glance.

The rejected alternative was consistency for its own sake: the same header
affordances in both sections because they are both grids. They are not the same
kind of grid.

### 2.4 Freezing a year is a decision, not a side effect

§7.3 as written reads as an automatic freeze — "on starting a new tracking year,
the previous grid is frozen". Taken literally, an owner who adds 2027's
workspace in October loses the ability to correct November.

So the freeze is an explicit act in Section 2, and it is reversible.
`years.createYear` carries the bank set over and clears the amounts, exactly as
§7.3 requires, and leaves `s2_archived` alone. The specification has been amended
to say so (§7.3, dated), with a row in the §19 register, rather than left to
disagree silently with the code.

Reversibility is what keeps the confirmation short. Nothing is destroyed in
either direction, so the dialogue says what will happen and how to undo it and
stops there — unlike deleting a year, which cannot be undone and says so.

`assertOpen` is called inside the transaction of every mutation rather than at
the IPC edge, because freezing is a *state*, and a state read outside the write
it guards is a race with whatever else the owner has open.

### 2.5 Paid and pending are read from the calendar, not stored

§7.2 asks for "subtle paid/pending state cues". `s2_cells` has no paid flag, and
adding one would ask the owner to maintain a second record of something the
calendar already knows — and would have cost the first migration.

So `monthState` derives it: months before this one read settled, this one reads
current, later ones read pending. `computeGrid` takes `today` as an argument
rather than reading a clock, which keeps the module pure and lets a test assert
December-as-pending in July without mocking `Date`.

One consequence, stated so it is not later mistaken for a bug: **a past year
reads entirely settled and a future year entirely pending.** That is correct.
The cue answers "where am I in the year", and in a year that is over or has not
begun, the answer is the same for all twelve months.

### 2.6 The year lives above the sections that use it

`years` parents `s1_categories`, `s1_entries`, `s2_banks` and `s2_cells`. Until
Realisation IV its whole lifecycle lived in `db/section1.ts`, which was accurate
only while one section existed.

It moved to `db/years.ts`, re-exported from its old home so no caller and no
Realisation III test noticed. The reason is one query: the donor year — the
newest year strictly older than the new one — must be the same for both grids,
or the two halves of a workspace disagree about their own ancestor. One
`createYear`, one donor query, one transaction, both `INSERT … SELECT`s.

Two alternatives were rejected. Calling into `db/section2.ts` from
`db/section1.ts` would make Section 1 learn what a bank is, and would need a
cycle to let Section 2 ask whether a year exists. Duplicating the donor query in
each section would produce two carry-overs free to disagree about which year is
"previous" — the same shape as the defect this section exists to retire.

`yearUsage` grew with it, and now counts all four tables. The delete-year
confirmation had been describing half of what the button does, which
`section1.ts` admitted in a comment; it no longer does.

### 2.7 Each section keeps its own open year

The `years` table is shared. The *open* year is not: each store holds its own
`activeYear` and its own `switchToken`.

The rejected alternative was one app-wide current year. It reads tidier until
the owner checks an old instalment plan in Section 2 and finds the income grid
has followed them to 2019. Two sections are two workspaces onto one vault, not
one cursor. There is an e2e test for this specifically, because it is the only
thing that would catch a shared store reappearing later.

### 2.8 The magnitude bar is scaled by the year, and drawn by the palette

§7.2 asks for the source's data bars "honoured in spirit, executed elegantly".
One band behind the figure in the TOTAL DEBT cell, its width the month's share
of the year's largest month — `peakMonthDebt`, computed once in the engine, so
no component ever decides what "big" means.

The colour is `color-mix(in oklch, var(--year-accent) 28%, transparent)`: the
year's own accent, so the bar is palette-native in all ten palettes and per-year
by construction, with no colour literal anywhere near it (`audit-colours.mjs`
would refuse one). A month where the counter columns exceed the cards reads in
`--success` instead, because money coming back is not debt.

### 2.9 The footers are not sticky, and that is the simpler answer

Section 1 pins its `tfoot`, and its own comment records the cost: stacking two
sticky rows means hand-keeping an offset in step with a font size. Section 2 has
three such rows.

It also has twelve body rows, which never scroll vertically — the scroll here is
horizontal, across the banks. So the problem does not arise, and the three
bottom bars are `position: static`. Where Section 1 had to choose which figure
was worth pinning, Section 2 simply does not have to.

### 2.10 The December bug cannot be written down

The sheet computes `I16` as `SUM(C16+D16+E16+G16+H16)+(J16+K16+L16)` and `I18`
the same way. Column F is not there. It was added after the formula was written,
and the total went on looking like a total.

Three things make that unrepresentable here, and they are worth separating
because only the first is obvious:

1. **Totals iterate their inputs.** `computeGrid` walks the columns that exist.
   There is no list of column names anywhere for a new column to be missing from.
2. **The two axes are asserted equal.** The grid can be totalled down its months
   or across its columns; `tests/unit/section2-engine.test.ts` asserts the two
   agree, and then walks all 108 cells asserting that changing any one of them
   moves every figure that depends on it by exactly that amount.
3. **One bank definition drives every appearance.** The sheet keeps its bank
   names in row 2 *and* row 21, and they have already diverged — column C reads
   one bank at the top and a different one at the bottom.

The third was found rather than assumed: `scripts/verify-payments.mjs` compares
the two rows and reports the divergence, naming the column and not the banks.

The script also carries a watch list, in the doctrine
`scripts/verify-workbook.mjs` established: where §18.2 records a defect *in the
sheet*, disagreement is reported rather than failed, because agreeing there would
mean JADEITE had faithfully reproduced a defect. `I16` and `I18` are on it — and
both currently *agree* numerically, because column F happens to hold nothing in
this copy of the workbook. That agreement is luck, not design, and a script that
printed `ok` would be claiming a reproduction that has not happened. So both
print a note either way, and `--december` places a value in F in memory and
prints exactly how far the sheet's own figures would then be wrong.

---

## 3. What the acceptance figures cost, and where they live

The same split as Realisation III: the repository holds the method, the owner's
machine holds the data, and nothing is written down.

`tests/unit/section2-engine.test.ts` proves the arithmetic against the sheet's
*shape* with amounts that are nobody's. `tests/e2e/section2.spec.ts` builds that
shape by hand through the real UI and reads all five figures back off the screen.
`scripts/verify-payments.mjs` does the comparison REALISATION.md actually asks
for, against `JADEITorigin.xlsx` where it sits, gitignored, on the owner's
machine:

```
node scripts/verify-payments.mjs             # the two acceptance figures
node scripts/verify-payments.mjs --months    # every month line, for forensics
node scripts/verify-payments.mjs --december  # what a value in F would do to the sheet
```

It bundles `src/shared/section2/engine.ts` and calls it — the same function the
renderer calls, never a reimplementation — and prints a verdict. All thirteen
figures reconcile to the kuruş, including the two REALISATION.md names.
