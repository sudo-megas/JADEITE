/**
 * Schema v1 — XJADEITE §5.3, with the value conventions of §5.2 enforced by
 * CHECK constraints rather than by discipline.
 *
 * Money is integer minor units (kuruş / cents); no float ever touches it.
 * Amounts are stored positive — the category or direction carries the sign, so
 * a forgotten minus cannot become a silent income entry. Derived values
 * (totals, holdings, remaining limits, gains) are computed, never stored.
 *
 * Migrations are kept as inline strings rather than .sql files so they survive
 * asar packaging without a filesystem read.
 */

export interface Migration {
  version: number
  name: string
  sql: string
}

const V1 = `
-- All app configuration lives here. There are no external config files.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE years (
  year            INTEGER PRIMARY KEY,
  accent_override TEXT,
  s2_archived     INTEGER NOT NULL DEFAULT 0 CHECK (s2_archived IN (0, 1)),
  created_at      TEXT NOT NULL
);

-- Section 1 — Income & Expenses. Each year owns its own column set, so
-- retiring a category next year never disturbs prior years.
CREATE TABLE s1_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  year       INTEGER NOT NULL REFERENCES years(year) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('income', 'expense')),
  value_type TEXT    NOT NULL DEFAULT 'TRY'
             CHECK (value_type IN ('TRY', 'USD', 'EUR', 'plain')),
  position   INTEGER NOT NULL,
  UNIQUE (year, name)
);

CREATE TABLE s1_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL REFERENCES years(year) ON DELETE CASCADE,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  category_id INTEGER NOT NULL REFERENCES s1_categories(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  is_refund   INTEGER NOT NULL DEFAULT 0 CHECK (is_refund IN (0, 1)),
  note        TEXT,
  UNIQUE (year, month, category_id)
);

-- Section 2 — Payments / Installments. One bank definition drives every
-- appearance, which is why the source workbook's duplicated-and-diverged bank
-- list cannot happen here.
CREATE TABLE s2_banks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  year          INTEGER NOT NULL REFERENCES years(year) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  credit_limit  INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  position      INTEGER NOT NULL,
  is_counter    INTEGER NOT NULL DEFAULT 0 CHECK (is_counter IN (0, 1)),
  counter_party TEXT,
  UNIQUE (year, name)
);

CREATE TABLE s2_cells (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  year    INTEGER NOT NULL REFERENCES years(year) ON DELETE CASCADE,
  month   INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  bank_id INTEGER NOT NULL REFERENCES s2_banks(id) ON DELETE CASCADE,
  amount  INTEGER NOT NULL CHECK (amount >= 0),
  UNIQUE (year, month, bank_id)
);

-- Section 3 — Valuables.
CREATE TABLE persons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  colour     TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  position   INTEGER NOT NULL DEFAULT 0
);

-- Closed list (§8.2): no user-defined types.
CREATE TABLE valuable_types (
  code     TEXT PRIMARY KEY,
  unit     TEXT    NOT NULL CHECK (unit IN ('mg', 'piece', 'minor')),
  position INTEGER NOT NULL
);

CREATE TABLE s3_transactions (
  seq              INTEGER PRIMARY KEY AUTOINCREMENT,
  date             TEXT    NOT NULL,
  date_provisional INTEGER NOT NULL DEFAULT 0 CHECK (date_provisional IN (0, 1)),
  type_code        TEXT    NOT NULL REFERENCES valuable_types(code),
  direction        TEXT    NOT NULL CHECK (direction IN ('acquire', 'dispose')),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price       INTEGER NOT NULL CHECK (unit_price >= 0),
  source           TEXT,
  person_id        INTEGER REFERENCES persons(id),
  note             TEXT
);

CREATE INDEX idx_s3_transactions_date ON s3_transactions (date);
CREATE INDEX idx_s3_transactions_type ON s3_transactions (type_code);

-- Manual prices are the authority; live prices sit beside them, never over.
CREATE TABLE s3_prices_manual (
  type_code  TEXT PRIMARY KEY REFERENCES valuable_types(code),
  value      INTEGER NOT NULL CHECK (value >= 0),
  updated_at TEXT    NOT NULL
);

CREATE TABLE s3_prices_live (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type_code  TEXT    NOT NULL REFERENCES valuable_types(code),
  value      INTEGER NOT NULL CHECK (value >= 0),
  fetched_at TEXT    NOT NULL
);

CREATE INDEX idx_s3_prices_live_type ON s3_prices_live (type_code, fetched_at);

-- Section 4 — Calculation Zone.
CREATE TABLE s4_lines (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  label    TEXT    NOT NULL DEFAULT '',
  value    INTEGER,
  position INTEGER NOT NULL
);

CREATE TABLE backup_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  destination TEXT NOT NULL,
  checksum    TEXT NOT NULL,
  reason      TEXT
);

-- Seeds -------------------------------------------------------------------

-- Historical imports without ownership default here (§8.1).
INSERT INTO persons (name, is_builtin, position) VALUES ('Ortak', 1, 0);

INSERT INTO valuable_types (code, unit, position) VALUES
  ('gram',      'mg',    1),
  ('ceyrek',    'piece', 2),
  ('yarim',     'piece', 3),
  ('tam',       'piece', 4),
  ('iki_bucuk', 'piece', 5),
  ('besli',     'piece', 6),
  ('usd',       'minor', 7),
  ('eur',       'minor', 8),
  ('gumus',     'mg',    9),
  ('ziynet',    'mg',   10);
`

/**
 * Schema v2 — the valuables model of point revision v0.6c.
 *
 * **The first migration this vault has ever performed.** `migrate` in
 * `connection.ts` has existed since Realisation I and has never had a second
 * migration to run, so everything below was verified against SQLite 3.53 (the
 * amalgamation this project bundles) before being written: every statement
 * applies inside one explicit transaction, and a failure part-way rolls the
 * table back untouched. That matters more here than anywhere else in the
 * application — the thing being altered is the owner's only copy of their
 * history.
 *
 * Three changes, all from the rulings of 30 July 2026.
 *
 * **1. A weighable row records its denomination and its count** (§8.3, amended).
 * `1 × 10 g` and `2 × 5 g` were the same row when quantity was one integer, and
 * they are not the same fact: the second says two physical chunks are in the
 * drawer. A total destroys that, and no later computation recovers it.
 *
 * **2. `quantity` becomes a generated column** rather than a stored one. §5.3's
 * opening rule is that derived values are computed and never stored, and a
 * generated column is that rule enforced by SQLite instead of by discipline —
 * `INSERT`ing into it is refused by the engine. Every existing `SELECT` that
 * reads `quantity` keeps working unchanged, which is why this is preferable to
 * dropping the column and making nine call sites multiply.
 *
 * The column is `VIRTUAL` rather than `STORED`: the product of two small
 * integers is cheaper to recompute than to keep on disk, and a virtual column
 * cannot drift from its inputs even in a file someone edited by hand.
 *
 * **3. The backfill is unit-aware,** which is a correction to the wording in
 * §8.3 that described it as `denomination = quantity, count = 1` for every row.
 * That is right for a weighable — 10 g of gold with nothing recorded about how
 * it was split is one chunk of 10 g — but wrong for a coin: thirty çeyrek are
 * thirty pieces of one, not one piece of thirty. Coins therefore migrate as
 * `denomination = 1, count = quantity`, which is both lossless and what the
 * grid should show. Every row's derived quantity is identical afterwards, which
 * is what keeps Realisation V's figures and Altın Eğrisi's series intact.
 *
 * `piece_count` rather than `count`, because `count` beside an aggregate
 * function of the same name in hand-written SQL is a trap for whoever reads it
 * next.
 *
 * **Ata** joins the closed list (§8.2, amended) between Tam and 2.5, since the
 * ordering is Çeyrek < Yarım < Tam < Ata < 2.5 < 5. Positions above it shift by
 * one; `position` carries no UNIQUE constraint, so the shift needs no dance.
 */
const V2 = `
ALTER TABLE s3_transactions
  ADD COLUMN denomination INTEGER NOT NULL DEFAULT 1 CHECK (denomination > 0);

ALTER TABLE s3_transactions
  ADD COLUMN piece_count INTEGER NOT NULL DEFAULT 1 CHECK (piece_count > 0);

-- Coins are pieces of one. Thirty çeyrek is 30 × 1, never 1 × 30.
UPDATE s3_transactions SET denomination = 1, piece_count = quantity
  WHERE type_code IN (SELECT code FROM valuable_types WHERE unit = 'piece');

-- A weighable or a currency amount is one chunk of itself until the owner says
-- otherwise; nothing in a v1 vault recorded how it was split.
UPDATE s3_transactions SET denomination = quantity, piece_count = 1
  WHERE type_code IN (SELECT code FROM valuable_types WHERE unit <> 'piece');

ALTER TABLE s3_transactions DROP COLUMN quantity;

ALTER TABLE s3_transactions
  ADD COLUMN quantity INTEGER GENERATED ALWAYS AS (denomination * piece_count) VIRTUAL;

-- Ata (Cumhuriyet) — §8.2 as amended. Tam and Ata are different coins.
UPDATE valuable_types SET position = position + 1 WHERE position >= 5;
INSERT INTO valuable_types (code, unit, position) VALUES ('ata', 'piece', 5);
`

/**
 * Schema v3 — the live provider of Realisation VII.
 *
 * Three changes, and the first is the one that needed care.
 *
 * **1. Ziynet leaves the closed list** (§8.2, amended 30 July 2026). The owner's
 * ruling: *ziynet* is the Turkish parent name for the ornamental-gold family —
 * çeyrek, yarım, tam, ata, 2,5 and 5 are all ziynet altını — so standing it in
 * the list *beside* those six named a category as though it were a product. The
 * owner's gram gold is 24 ayar and the 22-ayar holdings are the coins, which
 * leaves the row describing nothing they hold.
 *
 * **The delete is conditional, and that is not timidity.** `foreign_keys` is ON
 * before `migrate` runs (`connection.ts`), and three tables reference
 * `valuable_types(code)` with no `ON DELETE` clause. An unconditional delete
 * against a vault holding one ziynet row raises a constraint failure; the
 * migration's own transaction rolls back; `openDatabase` rethrows — and it
 * rethrows again on **every subsequent open**, because nothing has changed.
 * The owner would be locked out of their vault by a tidying-up, with no route
 * back in, since the only UI that could clear the row is behind the lock.
 *
 * So the two price tables are cleared first — a typed price is re-typable and
 * the type is being retired anyway — and the type row goes only when no
 * transaction points at it. A ledger row is history: §16.1 does not permit
 * destroying it to shorten a list. In every vault that exists today the row
 * goes and the list becomes ten; in one that already recorded ziynet history the
 * type survives, the vault opens, and the owner reassigns those rows at leisure.
 *
 * The rejected alternative was renaming the row to *22 Ayar Bilezik*, which
 * needs no delete at all and keeps a home for weighable 22-ayar gold. The owner
 * ruled for the shorter list with that trade-off stated. **The capability is
 * genuinely gone**: there is now no type in which bilezik or burma can be
 * recorded by weight, and reopening a closed list costs a specification
 * amendment and a Realisation of its own (§8.2, REALISATION.md). Recorded here
 * so a later rung can disagree deliberately rather than rediscover it.
 *
 * Positions need no dance. v2 shifted everything from 5 upward, leaving ziynet
 * last at 11, so removing it leaves 1…10 contiguous — unlike v2, which had to
 * open a gap. Said explicitly because the absence of a shift here is a fact
 * about v2's arithmetic, not an oversight.
 *
 * **2. A live price records which provider produced it.** §14 requires the
 * provider to be swappable, and a snapshot whose origin is unknown cannot be
 * audited afterwards — nor deduplicated per provider, which the writer needs.
 * `DEFAULT 'haremaltin'` makes the backfill exact: every row that could already
 * exist came from the only provider there was. In practice there are none,
 * since nothing has ever written this table.
 *
 * The index moves with it. The read that matters is *the latest value for this
 * type from this provider*, so `(type_code, provider, fetched_at)` is the
 * covering order; leaving the v1 index in place would have quietly made the
 * dedup check a scan.
 *
 * **3. A fetch is recorded even when nothing changed.** Snapshots are appended
 * only when the value differs from the last one for that type and provider —
 * which keeps `s3_prices_live` a genuine price history rather than a log of
 * polling, and removes any need for a pruner. But it also means a successful
 * refresh that confirms an unchanged price writes nothing at all, and 3c would
 * then have no way to say *when it last looked*: the newest `fetched_at` in the
 * price table is the last time a price **moved**, which on a quiet afternoon is
 * days ago. A refresh that worked would be indistinguishable from one that
 * failed.
 *
 * `s3_price_fetch` is therefore a single row — `CHECK (id = 1)` — carrying the
 * last attempt, its outcome, and the last time an attempt succeeded. One row
 * rather than one per attempt because nothing reads a fetch history, and rule 7
 * refuses a table built for a reader that does not exist. Three columns rather
 * than one because the interface wants the last success while the rate limiter
 * wants the last attempt, and after a failure those are different moments.
 */
const V3 = `
-- A typed price is re-typable; clear the children before the parent so the
-- delete below can never raise a foreign-key failure.
DELETE FROM s3_prices_live   WHERE type_code = 'ziynet';
DELETE FROM s3_prices_manual WHERE type_code = 'ziynet';

-- The type goes only if no ledger row depends on it. History is not tidied away.
DELETE FROM valuable_types
 WHERE code = 'ziynet'
   AND NOT EXISTS (SELECT 1 FROM s3_transactions WHERE type_code = 'ziynet');

-- Which provider said so (§14). The only provider that could have written an
-- existing row is the one this default names.
ALTER TABLE s3_prices_live
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'haremaltin';

DROP INDEX idx_s3_prices_live_type;
CREATE INDEX idx_s3_prices_live_type
  ON s3_prices_live (type_code, provider, fetched_at);

-- When the app last looked, as distinct from when a price last moved.
CREATE TABLE s3_price_fetch (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  provider     TEXT    NOT NULL,
  attempted_at TEXT    NOT NULL,
  outcome      TEXT    NOT NULL,
  succeeded_at TEXT
);
`

/**
 * Schema v4 — point revision v0.8b, the reconfigurations of 31 July 2026.
 *
 * Two sections lose a dimension apiece, both by the owner's ruling after using
 * the application for the first time.
 *
 * **1. Section 2 has no year** (§7.1, §7.3 as amended). Ödemeler was built as a
 * year workspace with a selector and a freezable archive, mirroring Section 1.
 * The owner does not log previous years' bank debts: the section answers *what
 * do we owe, and what instalments are running, right now*, and twelve month
 * lines answer that without a year attached to them. A selector offering years
 * the owner will never fill is a feature that has to be explained, and rule 7 of
 * the ladder refuses those.
 *
 * **The capability is genuinely gone, and that is recorded rather than glossed.**
 * Only the most recent grid survives this migration; every earlier year's banks
 * and amounts are dropped, and with them the frozen read-only archive of §7.3
 * and the freeze/reopen act that §7.3's own 2026-07-29 amendment introduced.
 * There is no longer any way to look at what a bank was owed last year. That is
 * the owner's decision, taken with the trade-off stated, and a later rung that
 * wants history back should disagree with this paragraph on purpose rather than
 * discover the gap.
 *
 * `MAX(year)` names the survivor. Every year present in `s2_banks` has at least
 * one bank in it — the table is where a year's columns live — so the newest year
 * is always a real grid rather than an empty shell, and a vault that never had a
 * bank migrates to an empty Section 2 without raising anything.
 *
 * **`UNIQUE (name)` is safe, and it was checked rather than assumed.** The old
 * constraint was `UNIQUE (year, name)`, so one name could repeat across years.
 * `assertNameFree` in `db/section2.ts` has always queried on year and name with
 * no `is_counter` predicate, which means a bank column and a counter column
 * could never share a name inside one year either. One year is copied, so the
 * names in it are already globally unique and the tightened constraint cannot
 * refuse the backfill.
 *
 * **The statement order is the whole of the safety here.** `applyPragmas` turns
 * `foreign_keys` ON before `migrate` runs, and `PRAGMA foreign_keys` is a no-op
 * inside a transaction — which is exactly where migrations execute. Enforcement
 * therefore cannot be lifted for the rebuild, so the sequence simply never
 * violates a constraint: both new tables are created and filled while the old
 * pair still stands, the child is dropped before the parent, and the parent is
 * renamed before the child so SQLite rewrites the child's `REFERENCES` clause
 * for us. No `legacy_alter_table` games, and no moment at which a row points at
 * a table that is not there.
 *
 * **`years.s2_archived` stays as a dead column.** It is Section 2's flag living
 * on Section 1's table, and nothing will read it after this. It is left alone
 * anyway: it carries a column-level `CHECK`, which SQLite's `DROP COLUMN`
 * refuses outright, so removing it would mean rebuilding `years` — the foreign-key
 * parent of `s1_categories` and `s1_entries`, and the one table in this vault
 * whose rebuild could fail in the way v3's comment above describes, locking the
 * owner out behind the only interface that could fix it. An unread column costs
 * a line of documentation. A bricked vault costs the history.
 *
 * **2. Section 4 is a grid of boxes, not a list of labelled lines** (§9, amended).
 * The owner's finding is blunt and correct: a month can carry a hundred and
 * twenty figures, and an *etiket* typed before each one makes the section
 * unusable for the only thing it is for. `s4_lines(label, value, position)`
 * becomes `s4_cells(slot, value)` — a box either holds a figure or it does not.
 *
 * **The labels are dropped and cannot be recovered.** §9 is the scratchpad, the
 * owner asked for the field's removal in the same breath as diagnosing it, and
 * the alternative — carrying a column nothing writes and nothing reads — is the
 * retiring workbook's habit rather than this application's.
 *
 * The table is deliberately sparse: an untouched box has no row at all, and a
 * box holding zero has a row holding zero. That is the same distinction
 * `computeStatistics` has always drawn between a heading and a figure, kept
 * without a nullable column to draw it with. `value` also gains the
 * `CHECK (value >= 0)` that `s1_entries.amount` and `s2_cells.amount` have
 * carried since v1 and that `s4_lines.value` never did, so §5.2's positive-amounts
 * rule is enforced by SQLite here too rather than by two layers of JavaScript.
 *
 * `ROW_NUMBER()` closes the gaps as it copies, so the boxes read in the order
 * the lines were arranged in. Nothing references `s4_lines` and it references
 * nothing, so this half carries none of the hazard the first half avoids.
 */
const V4 = `
-- Section 2 loses its year. Both tables are built and filled before either old
-- one is touched; see the note above on why the order is not negotiable.
CREATE TABLE s2_banks_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  credit_limit  INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  position      INTEGER NOT NULL,
  is_counter    INTEGER NOT NULL DEFAULT 0 CHECK (is_counter IN (0, 1)),
  counter_party TEXT,
  UNIQUE (name)
);

-- The newest grid is the one the owner is living in; the rest are not kept.
INSERT INTO s2_banks_new (id, name, credit_limit, position, is_counter, counter_party)
  SELECT id, name, credit_limit, position, is_counter, counter_party
    FROM s2_banks
   WHERE year = (SELECT MAX(year) FROM s2_banks);

CREATE TABLE s2_cells_new (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  month   INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  bank_id INTEGER NOT NULL REFERENCES s2_banks_new(id) ON DELETE CASCADE,
  amount  INTEGER NOT NULL CHECK (amount >= 0),
  UNIQUE (month, bank_id)
);

-- Bank ids are carried across unchanged, so the cells need no remapping.
INSERT INTO s2_cells_new (id, month, bank_id, amount)
  SELECT id, month, bank_id, amount
    FROM s2_cells
   WHERE year = (SELECT MAX(year) FROM s2_banks);

DROP TABLE s2_cells;
DROP TABLE s2_banks;

-- Parent first: renaming it rewrites the child's REFERENCES clause.
ALTER TABLE s2_banks_new RENAME TO s2_banks;
ALTER TABLE s2_cells_new RENAME TO s2_cells;

-- Section 4 — a fixed grid of value boxes (§9, amended). An untouched box has
-- no row; a box holding zero has a row holding zero.
CREATE TABLE s4_cells (
  slot  INTEGER PRIMARY KEY CHECK (slot >= 0),
  value INTEGER NOT NULL CHECK (value >= 0)
);

INSERT INTO s4_cells (slot, value)
  SELECT ROW_NUMBER() OVER (ORDER BY position, id) - 1, value
    FROM s4_lines
   WHERE value IS NOT NULL;

DROP TABLE s4_lines;
`

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 1, name: 'initial', sql: V1 },
  { version: 2, name: 'denomination-and-count', sql: V2 },
  { version: 3, name: 'live-provider', sql: V3 },
  { version: 4, name: 'year-free-payments-and-boxes', sql: V4 }
])

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version
