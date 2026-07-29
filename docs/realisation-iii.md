# Realisation III — Section 1: Income & Expenses

Companion notes to `REALISATION.md` and `XJADEITE.md`. Two things are recorded
here because the ladder asks for them: the grid spike's verdict, and the
decisions Section 1 had to settle where the specification left room.

---

## 1. Grid spike — TanStack Table · **GO**

REALISATION III opens with a spike: prove TanStack Table against the real shape
before committing to it, with AG Grid CE as the fallback if it fails the visual
or the editing bar.

**Verdict: go.** The fallback was not exercised, because nothing failed.

The proof was taken against the production grid rather than a throwaway, and the
shape it was taken against is the one that matters — the source workbook's row,
sixteen columns wide. The evidence is `tests/e2e/section1.spec.ts`, which runs
against the packaged application.

The amounts in that fixture are nobody's, and it is worth being exact about what
that costs. The committed test proves that sixteen columns of kuruş total
exactly — a property of the arithmetic, not of any particular row. It does not
compare JADEITE against the workbook, because the workbook is gitignored and its
figures are not going into the repository either.

**The comparison the acceptance line actually asks for lives in
`scripts/verify-workbook.mjs`.** It reads `JADEITorigin.xlsx` where it sits on
the owner's machine, feeds each month through this very engine, and checks
JADEITE's two computed figures against the two the sheet computed for itself.
Nothing it reads is written down; it prints a verdict and exits. So the
repository holds the method and the machine holds the data, and the check stays
reproducible for as long as the workbook exists:

```
node scripts/verify-workbook.mjs          # July 2026, the acceptance row
node scripts/verify-workbook.mjs --all    # every month, for forensics
```

Run against the workbook as it stands, all forty-seven months carrying data —
September 2022 through July 2026 — reconcile to the kuruş, July 2026 among them
at `172.605,89` and `139.700,62`. That is a good deal more than the acceptance
line asked for, and it is the strongest evidence available that the engine has
not merely been tested against itself.

| Claim the spike had to settle | Evidence |
|---|---|
| 16+ columns × 12 rows | 6 income + 10 expense columns built by hand, 12 month rows always present |
| Grouped headers | `GELİR` \| `GİDER` \| `TOPLAM` render as a header band over their own columns |
| Editable cells | Eleven amounts typed into July 2026 through the real UI |
| Per-column sort | Three-state header; empty cells sort last in both directions |
| Per-column filter | Rows hidden without any total changing |
| Custom cells | Refund marks, month names, per-currency totals, right-aligned tabular figures |

**Why it was never really in doubt, and what the risk actually was.** TanStack is
headless: `createColumnHelper().group()`, `getSortedRowModel`,
`getFilteredRowModel` and `flexRender` are its documented core, and 12 × 19 is
not a scale that troubles anything. The real risk was never the library's
capability — it was whether *we* could make it look like JADEITE rather than
like a component library. Headless is exactly what makes that our problem to
solve rather than a vendor's to permit, which is why §3.2 chose it.

**What would have failed the spike.** A grid that owned its own stylesheet, that
could not put a `<tfoot>` outside the sorted body, or that renumbered rows under
sort. None of those apply.

**Measured switch smoothness:** 23 frames across a workspace switch, median
16.6 ms, worst 48.6 ms. The transition animates `transform` and `opacity` only —
nothing that forces layout or paint per frame — which is what has to hold on the
laptop's integrated GPU. Under `prefers-reduced-motion` it is an instantaneous
swap, decided in CSS so no code path can drift from it.

Read that as a floor, not as the acceptance figure. It was taken on a headless
CI display running at roughly 60 Hz, which is not the owner's 280 Hz panel; the
median simply tracks that display's frame interval. **The acceptance line —
"smooth on the 280 Hz main display and acceptable on the laptop" — still needs
the owner's own two machines.** What the automated figure does establish is that
the switch produces a continuous frame stream with no multi-hundred-millisecond
stall, and that the incoming year's rows are in hand before anything moves.

So the app measures itself and says what it found. Every workspace switch is
sampled (`store/frame-stats.ts`) and reported two ways: a `[workspace-switch]`
line in the house style of Realisation II's `[cold-start]`, and a Performance
block in Settings. Switch a year on each machine, read the figures, judge the
line. The budget is derived rather than assumed — the median of the samples
stands in for that display's frame interval, and a frame counts as dropped when
it took more than twice it, so the same code judges 280 Hz and 60 Hz without
either being written into it. Nothing is recorded and nothing leaves, which is
the opposite of the telemetry §16.2 forbids.

### The bug the spike actually caught

Worth recording, because it is a trap in TanStack rather than in this code.
`flexRender` treats a cell or header *function* as a React component type. Column
definitions built inline therefore hand React a brand-new component on every
render, and React responds by unmounting and remounting the whole grid — so
every cell loses whatever was being typed into it, and any open menu closes
itself.

It surfaced as a refund toggle that would not stay toggled. The fix is
structural and is now the rule at the top of `Grid.tsx`: every renderer is
declared once at module level, and per-column and per-table data travel through
`meta`, which may change identity freely because it is only ever props.

---

## 2. Decisions Section 1 had to settle

Each of these was a place where the specification permitted more than one
reading. The reading chosen is recorded with the reason, so a later Realisation
can disagree deliberately rather than by accident.

### 2.1 Mixed currencies never mix

A column is TRY, USD, EUR or a plain number (§6.2). Totals are therefore
computed **per value type**: the TOTAL group holds an income-subtotal and a net
column for each type the year actually uses.

An all-lira year — the real workbook's case — yields exactly one bucket, so the
grid draws exactly the income-subtotal and net pair §6.2 describes. A year that
also holds a dollar column gets a second pair rather than a single number that
means nothing. No exchange rate exists anywhere in JADEITE, and none is applied;
retyping a column changes which bucket it totals into and nothing else.

The rejected alternative was one total summing everything. It is the sort of
silent nonsense this application was written to end.

### 2.2 A refund counts against its own category

Stored positive with a flag (§5.2), inverted once, in one function:

```
contribution(e) = e.is_refund ? −e.amount : +e.amount

income(m,u)  = Σ contribution(e)  over income columns of type u
expense(m,u) = Σ contribution(e)  over expense columns of type u
net(m,u)     = income(m,u) − expense(m,u)
```

An expense refund lowers expenses and raises the net; an income refund lowers
income and lowers the net. A refund never crosses into the other group — reading
"an expense refund is income" would inflate `GELİR TOPLAM` with money that was
never income.

Aggregates may go negative even though every stored amount is `>= 0`. That is
not clamped: `CHECK (amount >= 0)` constrains stored cells, and clamping a
computed total would hide money.

### 2.3 Retiring a column is not one operation but two

- **Not inheriting it.** Creating the next year copies the previous year's
  columns; leaving one out retires it and destroys nothing. This is what §6.2
  actually describes.
- **Deleting it from the year in view.** This destroys that year's cells for
  that column, and only that year's — each year owns its own `s1_categories`
  row, so year N cannot be reached from year N+1 under any cascade.

Deletion is a hard `DELETE`, not a soft flag. A hidden-but-populated column
would force the year's total either to include invisible money or to exclude
existing money, which is the dropped-column bug of §18.2 #1 rebuilt on purpose.

Because there is no backup until Realisation IX and no undo journal in the
schema, deleting a column that holds data names what it destroys — how many
cells and how much money — rather than asking "are you sure?" about an
unspecified quantity of the owner's records. A column holding nothing goes
without a dialogue, because a confirmation guarding nothing is theatre.

**Schema v1 is unchanged.** No migration was needed for any of this.

### 2.4 Empty is empty; zero is a number

An absent `s1_entries` row is an empty cell and renders as nothing at all — no
character, no placeholder, no `0,00 ₺`. A typed `0` is a stored row and renders
as `0,00 ₺`.

These are two different facts about a month: "I checked, it was zero" and "I have
not filled this in". Clearing a cell deletes its row, taking the note and the
refund flag with it — a note is a note *about* a number, and there is none left.

§6.3 forbids a *glyph* standing in for absence, which is what the workbook's
`'-'` was. It says nothing against a real zero.

### 2.5 The year accent is anchored, not derived

`accentForYear` counts from an anchor year stored in the vault's `settings`
table and written once, when the vault's first year is created. It is never
recomputed.

Deriving it from the earliest year present would make every workspace's colour a
function of the whole dataset, so back-filling one older year would repaint every
year the owner had already learnt to recognise. The accent *is* how a workspace
is known at a glance (§6.1, §12.3); it does not get to move. A vault predating
this rule repairs the anchor once, then treats it as frozen. Deleting a year does
not touch it either — delete and recreate a year and it comes back the colour it
was.

The manual override §12.3 promises lives in the year menu, and offers the active
palette's own accent sequence rather than an arbitrary colour picker: an override
should keep the year inside the palette's character, and it is muted by exactly
the same rules as a sequence value.

### 2.6 A new year looks only backwards

The donor is the newest year *older* than the one being created. A year created
before every existing year inherits nothing — borrowing forwards would furnish a
historical workspace with categories the owner had not invented yet. No gaps are
filled: a workspace exists only if it was asked for.

A fresh vault opens on the current calendar year with no columns. Reading the
year from the system clock is not OS-locale detection: §13 prohibits taking the
*language* and the formatting conventions from the machine, and the vault already
timestamps every row it writes.

### 2.7 Sorting and filtering are view state, and the year total is not negotiable

Sorting reorders the twelve rows on screen and writes nothing. A row sorted to
the top still reads `Aralık`; there is no ordinal column that renumbers. Empty
cells sort last in both directions, because an empty cell is not a small number.
A third click restores calendar order.

The TOTAL group's columns sort too — "which month was worst?" is a question
about the net, not about a category — which is why sort state is keyed by grid
column id rather than by category id. Those headers carry no menu: a computed
column has nothing to rename, retype, reorder or delete.

Filtering hides rows. It **never** changes the year summary. A filtered view
gains its own clearly separate line for the visible months, and the year's own
figure goes on saying what it always said — a total whose range silently
disagrees with its label is precisely the defect §1 was written against.

The summary row is grid chrome, pinned below the body: it never sorts and is
never hidden. Neither sort nor filter is persisted; both reset on a year switch
and on relaunch.

### 2.8 Nothing from the vault survives a lock

Locking zeroises the key and closes the database in the main process. The
renderer has to be equally careful and it is easy not to be: a Zustand store is
module state, so a section unmounting when the lock screen appears leaves its
store holding a plaintext copy of the year's amounts, notes and column names
until the process exits.

The invariant is therefore named once, in `store/vault-scoped.ts`, rather than
re-established by each section remembering to do it. A store holding vault data
registers its own reset; `App` calls `forgetVaultData()` the moment the vault
reports itself locked — idle timeout, Ctrl+L or password reset alike.
Realisations IV to VI add one registration each. Appearance and language are
deliberately *not* registered: they live in `config.json` and the lock screen
needs them (§4.1).

This was a real defect, found while reviewing the finished Realisation. No test
caught it because the end-to-end fixture raises the auto-lock timeout to keep
the OS idle clock from locking long headless runs, so nothing ever locked with
a section open.

The auto-lock timeout itself is read out of the vault into the appearance store,
so that store registers a partial reset too — only the vault-derived part of it.
Appearance and language stay: they were never in the vault, and the lock screen
needs them. "Nothing derived from the vault survives a lock" has to mean all of
it, not just the section that prompted the rule.

### 2.9 A year can be removed, but never the last one

A mistyped year would otherwise sit in the switcher permanently. Deletion is
offered from the year menu and refuses the last remaining year, because the
switcher has to have somewhere to be and a vault with no years would meet its
owner with a modal instead of a grid.

The confirmation names the reach of it deliberately. `years` is the parent of
`s2_banks` and `s2_cells` as well, so from Realisation IV a year deleted here
takes its Payments grid with it — a dialogue mentioning only columns would be
describing half of what the button does. A year holding nothing at all goes
without a dialogue, for the same reason an empty column does.

### 2.10 The amount parser refuses rather than guesses

The app language decides the separators — Turkish reads `1.234,56`, English
reads `1,234.56` — and neither is inferred from the string, because `1.234` is a
thousand in one and one-and-a-bit in the other.

A leading minus is refused outright rather than absolute-valued: amounts are
entered positive and the column's group carries the sign, and silently taking
`|x|` would resurrect the June-2025 elektrik sign slip that convention exists to
retire. More than two decimals is a question, not a rounding opportunity. Digits
are assembled as strings, so no float ever touches money.
