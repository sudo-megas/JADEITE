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

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 1, name: 'initial', sql: V1 }
])

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version
