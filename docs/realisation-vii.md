# Realisation VII — Live Prices

Companion notes to `REALISATION.md` and `XJADEITE.md`. The first rung that opens a
socket, and therefore the first whose hardest problem is not what the application
does but what it refuses. §14.2 records two failures of this source that arrive as
HTTP 200 with `error:false`; a third was found during the build, in the one place
the reconnaissance had already written down and got wrong.

---

## 1. Four questions were measured before any transport was written

Realisation III set the precedent — a spike, a recorded go/no-go, a named fallback —
and this rung had more to establish than that one did, because everything below the
provider interface depended on facts about Electron and about an unofficial source
that nobody had checked.

**Electron's Node is not the project's Node.** `package.json` requires Node ≥ 24 and
that constrains the runtime that runs npm, vitest and the build scripts. The main
process runs the Node compiled into `electron@42.8.0`, which the manifest says
nothing about. It turned out to be 24.18.0 with a global `WebSocket`, so the
hand-rolled reader was viable — but the inference that got there was a non-sequitur
and the answer cost one assertion in a suite that already runs inside Electron.

**`net.request` is governed by the session; Node's `fetch` is not.** A probe bound a
local server, installed the real filter, and issued both. `webRequest.onBeforeRequest`
saw the `net.request`, reported its `webContentsId` as `undefined`, and cancelling it
produced `net::ERR_BLOCKED_BY_CLIENT`. It never saw the `fetch` at all, and
cancelling did not stop it reaching the server. That single result decided three
things: the history request uses `net` and is therefore session-governed in the
literal sense §3.3 claims; the socket needs a chokepoint because nothing else can
reach it; and the discrimination the next section depends on is real.

**The socket answers at EIO=4.** Open frame, client sends `40`, server acks
`40{sid}`, then `42["price_changed", …]` at about ten kilobytes. The reader tries 4
then 3 anyway, because an unofficial source is free to move between them and §14
asks that such a change cost nothing.

**And the coin prices did not fit.** More on that in §4.

## 2. Decisions the provider had to settle

### 2.1 `isPermitted` was not widened, because it answers two questions

`session.ts` had one predicate with two callers: `onBeforeRequest` asking *may this
request leave?* and `will-navigate` asking *may the renderer become this page?* The
file's own header promised that §14's host would "be added here, in one place", and
that promise was a trap. Adding the provider to `isPermitted` answers both questions
at once, and the second answer makes `https://www.haremaltin.com/` a permitted
top-level navigation target — at which point a remote origin inherits the preload
and, through it, `window.jadeite` and the whole vault API.

So the widening lives in a second predicate, `isPermittedRequest`, consulted only by
the request filter and gated on the request not having come from a renderer.
`isPermitted` is byte-identical to what Realisation I shipped and still governs
navigation. The rejected alternative was the promise as written; what it would have
cost is the reason this paragraph exists rather than a one-line diff.

**Both CSP homes stayed at `connect-src 'none'`.** That is the quiet consequence of
putting the provider in the main process: the renderer never acquired a reason to
reach the network, so the policy did not have to move for it, and
`tests/e2e/hardening.spec.ts` passes the meta-tag assertion unedited. Widening the
renderer's policy to serve a module in another process would have granted egress to
everything that runs there in order to give it to one thing that does not.

### 2.2 The claim "blocked at the session level" was true of less than it said

§3.3 asserted that everything outside the allowlist is blocked at the session level.
After the probe that is knowably false of Node's stack, and the price socket rides
Node's stack. Two honest options existed: keep the sentence and let the socket be
the exception nobody wrote down, or say what governs what. §3.3 is amended, and the
chokepoint in `src/main/prices/egress.ts` is the mechanism the amendment names.

It refuses by returning the parsed `URL` rather than a boolean. A caller that wants
to connect has to come through it to get a usable object, so "check, then use"
cannot decay into "use" — which is what a `canFetch()` predicate the caller is
trusted to consult eventually becomes.

`scripts/audit-egress.mjs` is the third build gate, and it denies module specifiers
rather than only call names: someone who imports `node:tls` and writes their own
client trips nothing otherwise.

### 2.3 The mocks are shipped code, and that is the argument for them

§14 requires the provider to be swappable "without touching anything else". An
interface with one implementation has never been asked to prove that, so there are
three from the first day. They also settle a harder problem: five of this rung's
seven acceptance checks concern what happens when a fetch goes wrong, and
REALISATION.md rule 6 forbids a test that needs the owner's data — to which this
rung adds that no test may touch the network at all. A recorded body handed to a
mock is how a stale response becomes a repeatable assertion.

The default is inverted from the obvious one. An unpackaged build gets the **mock**,
and the real source must be asked for by name. `npm run test:e2e` builds unpackaged
and drives the real application, so defaulting the other way would put one forgetful
test between this project and a third party's server.

### 2.4 A snapshot is stored only when the figure moved, and a fetch is recorded either way

Auto-refresh at a quarter of an hour across ten types would reach roughly three
hundred and fifty thousand rows a year, nearly all of them saying what the row above
already said. Appending only on change makes `s3_prices_live` a genuine price history
and removes any need for a pruner.

It also breaks the obvious way to answer *when did this last update?*. The newest
`fetched_at` in the price table is the last time a price **moved**, which on a quiet
afternoon is days ago, and a refresh that worked would be indistinguishable on screen
from one that failed. `s3_price_fetch` is one row carrying the last attempt, its
outcome, and the last time an attempt succeeded — three columns because after a
failure the last attempt and the last success are different moments, and one row
because nothing reads a fetch history and rule 7 refuses a table built for a reader
that does not exist.

### 2.5 Decimals are assembled from digits, and the reason is measurable

`Math.round(parseFloat(s) * 100)` is the obvious conversion and it is wrong often
enough to matter. Over four hundred thousand four-decimal strings in the price range
it disagrees two hundred and one times: `1051.4950` becomes `105149` because the
nearest double to it is below it. One kuruş, on about one string in two thousand,
always in the direction of disagreeing with arithmetic the owner could redo by hand
and never reconcile.

`src/shared/money.ts` was the other candidate and is the wrong tool: it reads the
*application language's* separators (§13), and this source is dot-decimal whatever
the interface is set to.

### 2.6 The provider swap is demonstrated between two working providers

Showing it against `offline-mock` would prove that a failure propagates, which is
not what §14 is asking. `mock` and `mock-b` differ by one per cent on every quote, so
the assertion is that the figures on screen followed the swap and that each stored
row names the provider that said so — the reason `s3_prices_live` gained a `provider`
column, and the reason that column crosses the bridge rather than sitting in the
database being notionally auditable.

### 2.7 Politeness is volume, because identification is impossible

§14.3 asked the application to identify politely. The history endpoint answers 404
with HTML to any request without a browser User-Agent, so a header naming JADEITE
does not announce the application — it breaks the request. The clause is amended.
What is left is a floor of one minute between attempts, exponential backoff to a
half-hour ceiling, one connection of about a second and a half, and request
parameters that are **fixed rather than derived from the ledger**: asking only for
the types the owner holds, over the owner's own date range, would make every request
a small disclosure of the portfolio (§16.1).

### 2.8 History is fetched, validated, and discarded

§8.5 says price history is the ledger's own rows; §11 says the charts derive entirely
from the ledger; §11.3 says market value over time uses price history "where
available". Storing provider closes with nothing reading them would have resolved
that tension in the worst direction — VIII's rule-7 test refuses to move four pure
functions without a second caller, and a table with no reader earns its place not
once but zero times. So the fetch and both of its refusals are built and proved, and
the table arrives with the rung that draws it.

That also removed an ordering hazard nobody had named. Had VII fed real closes into
Altın Eğrisi's value line, Overview's identically-captioned line would have drawn a
different series from the same data — which is verbatim the defect §11 exists to
retire.

## 3. Ziynet left the closed list, and something went with it

The owner's ruling: *ziynet* is the Turkish parent name for the ornamental-gold
family, so çeyrek, yarım, tam, ata, 2,5 and 5 are all ziynet altını and standing it
in the list *beside* those six named a category as though it were a product. Their
gram gold is 24 ayar — which §14.3's own evidence agrees with, none of the
twenty-four dated purchase prices falling inside `AYAR22`'s band against sixteen
inside `KULCEALTIN`'s — and the 22-ayar things they hold are the coins, each of which
already had a row.

**The delete is conditional, and that is not caution for its own sake.**
`foreign_keys` is ON before `migrate` runs, and three tables reference
`valuable_types(code)` with no `ON DELETE`. A single typed ziynet price — reachable
through ordinary use of 3c since v0.5 — would make an unconditional delete throw, roll
the migration back, and rethrow on **every subsequent open**. The owner would be
locked out of their vault by a tidying-up, unable to reach the only interface that
could have cleared the row. So the price rows go first, and the type row goes only
when no ledger row depends on it.

The rejected alternative was renaming it to *22 Ayar Bilezik*, which needs no delete
at all and keeps a home for weighable 22-ayar gold. The owner ruled for the shorter
list with that cost stated, and the cost is real: bilezik and burma now have nowhere
to be entered by weight, and reopening a closed list costs an amendment and a
Realisation of its own. §8.2 says so, so a later rung can disagree deliberately.

## 4. The ceiling had been wrong since Realisation V

`MAX_UNIT_PRICE` read ₺100.000 and `units.ts` justified it per **gram**, where gold
at ₺6.505 leaves it generous. But a coin is priced per **piece**. The real quotes on
30 July 2026 were ₺100.496 for the 2,5 and ₺206.869 for the 5, and `cleanPrice` gates
the manual price setter as well as the ledger — so the owner could not have typed a
beşli price at all, in a released application, and nobody had noticed because nobody
had typed one.

Pointing a provider at the closed list turned that from latent to fatal: one
over-ceiling quote in a frame of ten refuses the whole transaction and records a
working fetch as a failure. It is now ₺500.000, chosen against the multiplication
rather than the market — `MAX_QUANTITY × MAX_UNIT_PRICE` stays at 5 × 10¹⁵, inside
`Number.MAX_SAFE_INTEGER`, where a round million would not.

A second ceiling for live prices was rejected. A live figure sits in the same column,
in the same scale, as the owner's own; two bounds on one quantity is how the two
drift apart.

## 5. And the thing the reconnaissance got wrong

§14.1 recorded that the source sends "dot-decimal strings, four places". That is true
of the history endpoint. It is false of the socket, which in a single frame sent
`CEYREK_ESKI` as `"10124"` with no decimal point at all, `GUMUSTRY` as `"94.017"` with
three, and `USDTRY` as `"47.3600"` with four.

A parser written to that sentence would have read a çeyrek as ₺1,01 and stored it
without complaint — and would have passed every test, because the fixtures were
authored from the same sentence. It was found by capturing a real frame and asserting
against what came back rather than against what had been written down. The fixture is
now that capture, which is the only durable defence: a recorded frame cannot agree
with a mistaken assumption the way a hand-written one will.

**Schema v3** is the second migration this vault has performed. It removes a seeded
type conditionally, gives `s3_prices_live` a `provider` column with the index to
match, and adds `s3_price_fetch`. Every Realisation V figure survives it, asserted
from a v2 fixture rather than a v1 one — because v2 is what shipped, and the v2 → v3
upgrade is the only one any real vault will perform.

---

## 6. What this Realisation proves

- `tests/unit/prices-parse.test.ts` — both §14.2 failures, the three-day tolerance
  from both sides, the real wire format with its three decimal shapes, the kuruş
  disagreement `parseFloat` produces, and a table of bodies that must not throw.
- `tests/unit/egress.test.ts` — twelve URLs: the two that work and ten ways of nearly
  being them, including the suffix attack an `endsWith` test admits.
- `tests/unit/limiter.test.ts` — the backoff, and the two ways a limiter usually
  fails: a held button renewing its own wait, and a clock that moves backwards.
- `tests/unit/drift.test.ts` — the threshold, and every edge where a division would
  have been reached for.
- `tests/electron/egress-suite.ts` — the `webContentsId` gate proved directly, because
  the CSP stops a renderer's request before the gate can be observed; the dev warning;
  and the chokepoint, which no session can cancel.
- `tests/electron/prices-suite.ts` — the swap between two working providers, both
  silent failures through the provider interface with nothing stored, dedup across a
  price that returns to a previous value, and a fetch record that advances while the
  price table does not.
- `tests/electron/storage-suite.ts` — the v2 → v3 migration in both branches: the row
  removed when nothing depends on it, and the vault still opening when something does.
- `tests/e2e/section3-prices.spec.ts` — a refresh filling the column and stamping when
  the source was last asked, an absent figure rendering as words rather than ₺0,00, an
  unreachable provider leaving every typed figure where it was, and drift marked only
  when the two part company.

372 unit tests, 219 Electron-hosted, 90 end-to-end, all three audits, and every
Realisation I to VI acceptance check still passing. Cold start 682 ms against a
1.500 ms budget; unlock 525 ms against 1.000 ms.
