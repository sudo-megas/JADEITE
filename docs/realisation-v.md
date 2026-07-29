# Realisation V — Section 3: Valuables

Companion notes to `REALISATION.md` and `XJADEITE.md`. Recorded here: the one
figure that decided the section's central design, and the places where the
specification permitted more than one reading. The reading chosen is written down
with its reason, so a later Realisation can disagree deliberately rather than by
accident.

---

## 1. Cost basis was decided by an acceptance figure, not by preference

§8.6 asks for cost basis and market value side by side with the difference named.
It does not say what a *disposal* does to cost basis, and that is the whole
question: a ledger with no disposals has only one possible answer, and this
ledger's defining event is a disposal of roughly a kilogram.

Three readings were weighed against the figures `REALISATION.md` asks Section 3
to reproduce — 30 g held, cost basis ₺188.000.

| Reading | What it gives for 30 g | Verdict |
|---|---|---|
| Lifetime acquisition total | the cost of ~1,2 kg | Compares what was paid for a kilogram against the market value of thirty grams, and reports a catastrophic loss where a car was in fact bought. |
| Running weighted average | ≈ ₺90.000 | Blends four years of gold bought between ₺1.000/g and ₺6.505/g into a holding bought this year. Misses the acceptance figure by a factor of two. |
| **Oldest lot first** | **₺188.000** | Reproduces it. |

₺188.000 for 30 g is ₺6.266,67 per gram, which is unmistakably 2026 pricing. The
only way the surviving thirty grams cost that much is if the cheap early gold is
what left — which is exactly what happened. So the arithmetic was not chosen for
elegance; it was read off the owner's own figure and then implemented.

Cost basis is therefore **the cost of the lots still held, oldest consumed
first, per (person, type)**. It answers a question the owner can check by hand:
*what did the gold I still have cost me.*

Two consequences worth stating.

**No lot state is stored.** Lots are rebuilt from the ledger on every read
(`computeHoldings`), so an acquisition row means the same thing forever and there
is nothing that can fall out of step with it. That is what "disposals reduce
holdings, never cost-basis history" means in practice: history is append-truth,
and a disposal is a row rather than an edit.

**Each residual lot is valued by the same function that drew its own row's
total.** A cost basis that disagreed with the visible sum of the rows behind it
would be the workbook's defect wearing a new hat.

---

## 2. The two axes, and the one way they can part

Realisation IV's suite asserts that the Payments grid totalled down its months
equals the same grid totalled across its columns. Section 3 has the same
discipline on the axis it owns: a holding is computed **twice** — once by adding
signed quantities, once by measuring what the FIFO lots have left — and the unit
suite asserts the two agree.

They can part in exactly one way: the ledger disposes of more of something than
it records acquiring. `Holding.oversold` is that disagreement, and it is
§8.4's "discrepancy indicator" given a concrete cause rather than a vague one.

It is **flagged and shown, never clamped**. During the typing sessions of §18.5
this is the expected state of gold for as long as it takes to enter the purchases
that precede the car: the holding reads −10 g, the page says why, and entering
the missing row clears it without anything being corrected. A figure that hid the
shortfall would leave the owner hunting for a purchase they had no reason to know
was missing.

---

## 3. Decisions Section 3 had to settle

### 3.1 The ledger is not sorted, and not filtered

The planning note for this Realisation said the opposite — that Section 3 would
take Section 1's per-column sort and filter, because unlike Section 2 its rows
are not the calendar. That was wrong, and the reason is a column.

The **Total Quantity** column of §8.3 is a *running* holding: how much of this
type existed after this row. A running total in any order but chronological
describes nothing. Sorting by amount would not merely lose an ordering, it would
make a whole column lie — and filtering to one person would do the same, because
the column runs across all of them.

So rows arrive in the vault's own order, by date then by number, and the
per-person and per-type views that a filter would have provided are what 3b
already is. The charts of Realisation VI get filters of their own, where a
running column is not on screen to be broken by them.

This lands in the same place Realisation IV did (`docs/realisation-iv.md` §2.3)
by a different road, which is some evidence it is the right place.

### 3.2 Row numbers are the stored `seq`, gaps and all

`AUTOINCREMENT` makes the source workbook's hand-typed 14, 14, 17, 17
unrepresentable, which is what the acceptance asks for. It also will not reissue
a number after the row holding it is deleted, so a gap appears where a duplicate
used to be possible.

The gap is kept. Renumbering would make a row's identity mutable, and a gap is
honest — it says a row was removed, which is true. A ledger read in date order
also shows numbers out of sequence when a forgotten purchase is typed late, and
that too is honest: it is what makes §18.3 item 6's impossible date visible
instead of tidy.

### 3.3 Deleting a person reassigns; it never cascades

`foreign_keys = ON` and `s3_transactions.person_id` carries no `ON DELETE`, so a
bare delete is refused by SQLite. That is the right instinct wearing the wrong
error, and the obvious fix is the wrong one: `ON DELETE CASCADE` would delete a
lifetime of ledger because a name was tidied up.

So `deletePerson` moves every row to **Ortak** and then removes the person, in one
transaction, and the confirmation says how many rows will move and that none is
deleted. §8.1 already names Ortak as the home for rows of unknown ownership, so
this is not a new idea — it is the same one applied to a second case. Ortak
itself can be neither renamed nor removed, in the interface as well as in the
vault, because it is a contract rather than a default.

### 3.4 A person's colour is an accent slot, not a colour

§8.1 asks for a colour dot. Storing a colour would put a literal into the vault
and, worse, into a picker in the renderer, which `audit-colours.mjs` refuses on
sight and §12.2 refuses on principle.

So `persons.colour` holds a **slot in the active palette's accent sequence** — the
same mechanism years use (§12.3) — and the dot resolves against whichever palette
is in force. The same person is one hue in Nord and another in Kanagawa Lotus,
and both are hues that palette chose for itself. `accentAt` was factored out of
`accentForYear` for this; years index the sequence by their distance from the
anchor, persons by their stored slot.

### 3.5 Dates are typed as ISO-8601 and displayed in the app's language

`<input type="date">` was rejected. It draws its format from the browser locale,
and Electron is started with `--lang=en-US`, so an application that speaks Turkish
would have shown an American date — precisely the operating-system leak §13
prohibits.

Entry is therefore `YYYY-MM-DD`, which is also how §5.2 stores it, and display
goes through `formatDate` in the app's language. The append row carries the
previous row's date forward, so a run of purchases needs a day changed rather
than a date typed.

### 3.6 One read serves the whole section

There is no `years` call in `Section3Api` and no year argument anywhere in it: the
ledger is a lifetime, not a workspace, and `s3_transactions` has no year column to
scope one.

Everything comes from `ledger()` in a single crossing. Holdings derive from the
transactions and the prices *together*, so fetching them separately would let the
screen show a holding computed from one read beside a market value computed from
another — two views of one truth, which is the defect this application exists to
answer.

### 3.7 An unpriced holding is counted but not valued

A type held with no manual price contributes to cost basis and to nothing else.
`marketValue` and `unrealised` are `null` for it, `missingPrices` names it, and the
totals carry both a full `costBasis` and a `pricedCostBasis` so that
`unrealised = marketValue − pricedCostBasis` is a like-for-like comparison rather
than a market value measured against a cost it excludes.

The rejected alternative — contributing zero — would have reported the whole cost
basis as an unrealised loss the moment a price was missing.

### 3.8 The live column exists from this Realisation and is empty

`s3_prices_live` is read (newest snapshot per type) and 3c draws the column,
labelled "no provider yet". Nothing writes it until Realisation VII, and Section 3
ships no network code, no provider module and no change to the egress allowlist.

Drawing it now settles the shape of the page once. A column that appeared later
would move every figure on that page sideways, and the empty cell says something
true in the meantime: there is no provider, which is not the same as there being
no price.

---

## 4. The arithmetic that was genuinely new

Sections 1 and 2 needed only money, and `shared/money.ts` was enough. Section 3
counts three different things and quotes a price against each, so
`shared/section3/units.ts` exists:

```
mg     value = round(qty_mg    × price_per_gram  / 1000)
piece  value = qty             × price_per_piece
minor  value = round(qty_minor × price_per_major / 100)
```

Three things about it are deliberate.

**The multiplication is decomposed.** Multiplying first would form
`quantity × unitPrice` in full, which for a weighable type is a thousand times
larger than the answer and the first thing to leave exact integer range. So the
whole-unit part is multiplied out exactly and only the remainder — always smaller
than the scale — is ever divided.

**Halfway rounds away from zero,** the direction a person doing it on paper would
go. One milligram of gold at ₺6.505/g is 6,505 kuruş and becomes 7; the unit suite
pins the case either side of it.

**The parser was not written twice.** `parseAmount` was refactored into
`parseFixedPoint`, and `parseQuantity` calls the same function with three decimal
places instead of two — or none at all for a coin, because a third of a çeyrek
does not exist and refusing the decimal point is more honest than rounding one
away. Every rule about what a comma means therefore lives in one place, which is
the same reason `signedQuantity` is the only function that knows what `dispose`
means.

`MAX_QUANTITY` and `MAX_UNIT_PRICE` cap one row at 10^15 kuruş, an order of
magnitude inside `Number.MAX_SAFE_INTEGER`. They are not a guess at the owner's
wealth; they are what makes a mistyped extra digit a refusal at the cell rather
than a figure arithmetic can no longer represent.

**Schema v1 is unchanged.** `persons`, `valuable_types`, `s3_transactions`,
`s3_prices_manual` and `s3_prices_live` were authored in Realisation I with the
right CHECK constraints and seeds, and needed nothing. No migration was written —
the second Realisation in a row for which that is true.

---

## 5. The append row is the section

§6.4 makes keyboard-first entry a graded requirement rather than a nicety, because
every figure in this application arrives by hand and roughly thirty-eight gold
events are waiting to be typed.

The append row is always at the foot of the ledger. It carries **date, type,
direction and person** forward from the row just committed and clears quantity,
price, source and note — which is the split a run of purchases actually wants,
since they are usually the same person buying the same thing and never the same
amount at the same price. Enter anywhere in the row commits it and returns the
caret to its first field.

`tests/e2e/section3.spec.ts` types thirty consecutive rows through the keyboard
alone and asserts no dialogue ever opened. After the first row, each further one
is four Tabs, a quantity, a Tab, a price and Enter.

A refusal keeps everything on screen. A cell that discarded a rejected edit would
lose a row in the middle of exactly the session this section was built for.

---

## 6. What the acceptance figures cost, and where they live

Realisations III and IV reconciled their figures against the retiring workbook
with a script that read it where it sat, gitignored, on the owner's machine. Those
scripts are gone: §18.2 now forbids any tool opening the source artefacts, and
they were in any case precisely what §1 refuses — hardcoded to one workbook's
defects and useless to anyone else.

Nothing was lost, because none was needed. The six figures `REALISATION.md` names
are enough to *author* a ledger that produces them: three acquisitions and one
disposal, arranged so the disposal consumes an early lot entirely and leaves a
later one whole.

| Date | Person | Direction | Quantity | Unit price |
|---|---|---|---|---|
| 2026-01-15 | Kişi A | acquire | 10 g | ₺5.000,00 |
| 2026-02-20 | Kişi A | acquire | 20 g | ₺5.900,00 |
| 2026-03-10 | Kişi B | acquire | 10 g | ₺7.000,00 |
| 2026-04-05 | Kişi A | **dispose** | 10 g | ₺6.500,00 |

At ₺6.505,00/g this derives to 30 g held, cost ₺188.000, market ₺195.150,
unrealised +₺7.150, Kişi A ₺130.100 and Kişi B ₺65.050 — every figure of the
acceptance list, every step an exact integer number of kuruş, and not one number
that is anybody's real history.

The same fixture is proved three times over: in the unit suite against the pure
engine, in the Electron-hosted suite through a real encrypted database, and in the
end-to-end suite by typing it into the real interface and reading all six figures
back off the screen.
