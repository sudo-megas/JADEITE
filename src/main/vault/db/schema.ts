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

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 1, name: 'initial', sql: V1 },
  { version: 2, name: 'denomination-and-count', sql: V2 }
])

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version
