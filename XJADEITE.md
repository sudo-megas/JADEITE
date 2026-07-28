# XJADEITE

**Project:** JADEITE — the secure personal wealth & possessions tracker
**Copyright:** sudo-megas · **Licence:** GPL-3.0 · Free and Open-Source Software
**Status:** Specification v2 (supersedes JADEITE.md v1) · Companion document: `REALISATION.md`
**Provenance:** Every decision in this document was settled explicitly between the owner and the architect during pre-realisation review. Source artefacts: `JADEITorigin.xlsx` (the retiring workbook), `Altın_Eğrisi.pptx` (the retiring chart deck), one year-banding screenshot.

---

## 1. Mission & Philosophy

JADEITE exists so that its owner never needs an office suite again for tracking what they have, what they owe, and what they earn. It replaces one LibreOffice workbook and one PowerPoint deck — both of which were found, on forensic inspection, to be silently rotting (a dropped column reference in a hand-typed total, two hand-maintained charts drifting apart, data falsified by a factor of 1000 to survive a chart axis). JADEITE's totals are computed by code written once and tested, not by formulas re-typed per cell.

Guiding truths:

- **It is the most secure environment on the owner's machine.** Everything at rest is encrypted; nothing legible ever leaves.
- **Rendering is identical everywhere.** The app ships its own rendering engine; a file that looks different in another suite is a category of problem that no longer exists.
- **It is a lifetime app.** Data outlives UI. The schema is the app; the interface is replaceable.
- **It is eye-candy with a straight face** — elegant, serious, corporate-feeling, charismatic. Never chaotic, never childish. Clarity is a hard requirement, not a style preference.
- **Dependency count is not a constraint.** The question is never "how minimal" but "how superb." Package size up to 1 GB is acceptable.
- **Usage pattern is open → enter → close.** The app is not a resident. Therefore idle RAM is a non-metric and **cold start is a hard requirement** (§3.4).
- Linux first, Windows after finalisation. Installer only; no portable usage.

---

## 2. Product Pillars

1. **Section 1 — Income & Expenses** (year-workspaces)
2. **Section 2 — Payments / Installments** (the forward-looking year tracker)
3. **Section 3 — Valuables** (Turkish-economy valuables: ledger, holdings, prices)
4. **Section 4 — Calculation Zone** (freeform totals/average/median scratchpad)
5. **Overview** (the zoomed-out dashboard across all years)
6. **Altın Eğrisi** (automatic charts derived from Section 3 — a *view*, never a data store)

---

## 3. Platform & Stack

### 3.1 Framework decision (settled)

**Electron + React + TypeScript.** Chosen over Flutter and Avalonia after explicit three-way comparison. Rationale recorded: bundled Chromium guarantees pixel-identical rendering on CachyOS and Windows; the web ecosystem has the strongest editable data grids in the industry (and Sections 1–2 *are* grids); the ten target palettes all publish CSS-ready values; packaging to Linux and later Windows is mature. The RAM cost of Electron is accepted and rendered irrelevant by the open-enter-close usage pattern.

### 3.2 Pinned stack

| Layer | Choice | Notes |
|---|---|---|
| Shell | Electron (current LTS at Realisation I, pinned by lockfile) | auto-update **disabled** — updates are manual installs, the app never phones home |
| UI | React + TypeScript, built with Vite | strict mode |
| Grids | TanStack Table (headless) + custom cells | full styling control for the visual bar; confirmed by a spike in Realisation III before deep commitment |
| Charts | Apache ECharts | native log-scale toggle, zoom, hover — required by Altın Eğrisi |
| State | Zustand | |
| Storage | SQLite via `better-sqlite3-multiple-ciphers` (SQLCipher-compatible, AES-256) | one encrypted file |
| KDF | `argon2` (Argon2id, native binding) | §4 |
| i18n | i18next, **manual switching only** | §13 |
| Packaging | electron-builder → **pacman** target (CachyOS/Arch) + deb; NSIS at the Windows realisation | installer only |

### 3.3 Electron hardening posture (non-negotiable)

`contextIsolation: true`, `nodeIntegration: false`, sandboxed renderers, strict CSP, no remote content of any kind, preload exposes a minimal typed IPC surface only. Network egress is limited to the single allowlisted price-provider host (§14); everything else is blocked at the session level. No telemetry, no crash reporting, no update checks.

### 3.4 Cold start (hard requirement)

- Launch → lock screen: **≤ 1.5 s** on the reference rig (Ryzen 7 9800X3D / NVMe), **≤ 3 s** on the reference laptop (Ryzen 5 3450U / SATA SSD).
- Successful unlock → interactive Section grid: **≤ 1 s** (excluding the deliberate Argon2id cost, which is password-entry time and a security feature, not a performance defect).
- No splash-screen theatre.

---

## 4. Security Architecture

### 4.1 Vault layout

The data directory (per-OS, §5.1) contains exactly two app-managed files:

- `jadeite.db` — the SQLCipher database. All user data **and all settings** live here. There are no external config files (.toml/.lua/anything); nothing about the app is configurable from outside it.
- `jadeite.keys` — the cleartext key-envelope header: format version, Argon2id parameters, two salts, and two wrapped copies of the DEK (§4.2). This file contains no secrets usable without a credential; it is data-store plumbing, not user configuration.

### 4.2 Key model

A random 256-bit **DEK** (data-encryption key) seals `jadeite.db`. The DEK itself is never stored raw; it is stored **twice, wrapped**:

1. wrapped under a key derived from the **master password** via Argon2id;
2. wrapped under a key derived from the current **recovery key** via Argon2id.

Baseline Argon2id parameters: memory 256 MiB, iterations 3, parallelism 4 — recorded in `jadeite.keys` and tunable only at vault creation. **The DEK never changes for the life of the vault.** Credential changes re-wrap; they do not re-encrypt the database.

### 4.3 Recovery-key lifecycle (owner's exact ruling)

1. **Initial setup:** owner creates the master password → the app generates **recovery key #1**, displays it exactly once, never again.
2. **Password reset:** owner enters the current recovery key → it is consumed and permanently dead → owner sets a new master password → the app immediately generates and displays the next recovery key, exactly once.
3. **Every successful password reset both consumes the old recovery key and issues a fresh one.** At any moment, exactly one valid recovery key exists.
4. Password forgotten **and** recovery key lost → the vault is unrecoverable **by design**. (House rule: "let me go water his cemetery.") There is no third copy, no back door, no support channel.

Recovery-key format: 24 characters of Crockford Base32 in six groups (`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`, ≈120 bits) with a checksum group — designed to be written on paper without ambiguity.

### 4.4 Credentials & Backup Truth Table (verbatim contract)

A backup is sealed by the same DEK as the live vault but carries **the credential envelopes that existed at backup time**.

| Situation | Outcome |
|---|---|
| Live vault healthy, current password known | **Every backup ever made is openable.** The app holds the DEK in memory and can open any backup of this vault regardless of the credentials in force when it was taken. Old passwords are irrelevant. |
| Live vault lost (disk death); restoring from backup | You need the password **or** recovery key that was current **at the moment that backup was made**. |
| Live vault lost + backup's password forgotten + backup's recovery key lost | Cemetery. No bypass exists. |

**Mandated behaviour:** after every successful password change or reset, JADEITE immediately prompts for a fresh backup, so the newest backup always matches the newest credentials.

**Honest limitation (recorded):** because the DEK is stable, a *stolen* old backup plus its old password remains readable forever; rotating a password does not retroactively protect copies an attacker already holds. This is true of any encrypted-file scheme and is accepted — the threat model here is disk failure and forgetfulness, not espionage.

---

## 5. Data Foundation

### 5.1 Location

- Linux: `~/.local/share/jadeite/`
- Windows (post-port): `%APPDATA%\jadeite\`

Default OS user locations, encrypted at rest, exactly per the v1 manifesto.

### 5.2 Value representation

- **All monetary amounts are stored as integers in minor units** (kuruş / cents). No floats touch money.
- **All amounts are stored positive; the category/direction carries the sign.** Expenses are not negative numbers; disposals are not sneaky sign flips. A refund is an explicit flag on an entry, not a `+` where a `−` was forgotten. (This retires two documented incidents in the source workbook: the June-2025 elektrik sign slip and the `'-'` text placeholders.)
- Quantities of weighable valuables are stored as integer milligrams; countable coins as integer pieces.
- Dates are ISO-8601 strings; a boolean `date_provisional` flag exists for migrated rows whose date is under review (§18).

### 5.3 Schema sketch (informative, finalised in Realisation I)

`settings` · `years` · `s1_categories(year, name, kind[income|expense], position)` · `s1_entries(year, month, category, amount, is_refund, note)` · `s2_banks(year, name, credit_limit, position, is_counter, counter_party)` · `s2_cells(year, month, bank, amount)` · `persons` · `valuable_types` (closed seed list, §8.2) · `s3_transactions(seq_auto, date, date_provisional, type, direction[acquire|dispose], quantity, unit_price, source, person, note)` · `s3_prices_manual(type, value, updated_at)` · `s3_prices_live(type, value, fetched_at)` · `s4_lines(label, value, position)` · `backup_log`.

Derived values (totals, holdings, remaining limits, gains) are **computed, never stored**.

---

## 6. Section 1 — Income & Expenses

### 6.1 The year-workspace model (owner's design)

Years are **workspaces**, in the exact sense of Linux desktop-environment workspaces: 2024 is workspace 1, 2025 is workspace 2. Switching years is a page change with a deliberate, smooth transition — not an infinite scroll through a continuous table. This intentionally breaks from the source workbook's single long table.

- Each workspace shows **12 month rows** (Ocak → Aralık).
- Each workspace carries a **year accent** — a colour identity derived from the active palette (§12.3) — applied with restraint: banding, headers, the workspace switcher. The source workbook's hand-painted year bands (2023 blue, 2024 cream, 2025 green, 2026 salmon) are the ancestor of this feature, now automated and palette-aware.

### 6.2 Columns

- Columns belong to **groups**: Income group, Expenses group, then a closely-set computed **TOTAL** column (net = income − expenses; income subtotal also shown, mirroring the source's GELİR TOPLAM / GENEL TOPLAM pair).
- **Each year owns its column set.** Creating a new year inherits the previous year's columns as a starting point, freely editable thereafter. Retiring a category next year never disturbs prior years (this retires the "can't delete a finished column or old data goes puff" problem).
- Columns are user-named, reorderable, and typed: **TRY (default), USD, EUR, or plain number**. All relevant currency glyphs and formats are first-class; Turkish number formatting (`1.234,56 ₺`) is the default presentation.
- Per-column **filtering and sorting** (sorting reorders the view only; month order in data is immutable).

### 6.3 Entry rules

- Amounts entered positive; the column's group decides the sign in computation.
- Refund flag available on any entry (renders distinctly; counts against its category).
- Empty means empty — no `'-'` placeholder text exists anywhere in JADEITE.

---

## 7. Section 2 — Payments / Installments

**Purpose (owner's ruling):** *not* data collection. It is the forward-looking tracker — "what month, how much in total, seen in advance." Already-certain future payments are written here.

### 7.1 Grid

- **12 fixed month lines** (Ocak → Aralık), one year of view.
- **Indefinite bank/card columns**, added horizontally by the owner.
- Top bar rows: **1. Bank Name**, **2. Credit Limit**.
- Per-month computed **TOTAL DEBT** column, closely set at line end.
- Bottom bar rows: **1. DEBT** (per-bank total), **2. Remaining Limit** (per-bank: limit − debt), **3. TOTAL REMAINING LIMIT** (full-width).
- The intersection of the DEBT row and the TOTAL DEBT column is **GRAND TOTAL DEBT**.
- **Counter columns** (opt-in), placed after TOTAL DEBT: row 1 = bank, row 2 = person (e.g. "sayacA"). Their values are computationally reversed relative to debts — they reduce totals. Stored positive with `is_counter`; the engine applies the sign.
- All totals, limits, and remainders recalculate instantly on every edit. Structural bugs of the source workbook (the December formula that silently dropped a bank column; the bank list duplicated in two places and already diverged) are impossible by construction: one bank definition, engine-owned totals.

### 7.2 Visual language

The source's icon-sets and data-bars are honoured in spirit, executed elegantly: restrained magnitude bars on TOTAL DEBT, subtle paid/pending state cues — palette-consistent, never carnival.

### 7.3 Year rollover

On starting a new tracking year, the previous grid is frozen as a **read-only archive** reachable from a year selector; the new year begins with the bank set carried over and amounts cleared. Nothing is destroyed by January anymore (the source workbook overwrote itself annually).

---

## 8. Section 3 — Valuables

Grounded, per the manifesto, in Turkish economy and culture.

### 8.1 Persons

Owner-defined persons (free creation, rename, colour dot). Every transaction belongs to a person; historical imports without ownership default to **Ortak (Unassigned)** for later reassignment.

### 8.2 Valuable types — closed list (owner's ruling: "only these")

Built-in gold set: **Gram**, **Çeyrek**, **Yarım**, **Tam (Cumhuriyet)**, **2.5 (İki Buçuklu)**, **5 (Beşli)** · plus **USD**, **EUR**, **Gümüş (silver, gram)**, **Ziynet (gram)**. No user-defined custom types.

### 8.3 Sub-section 3a — Transaction ledger

Columns: **No** (auto-numbered — the source's hand-typed duplicates 14,14,17,17 are structurally impossible), **Date** (+ provisional flag), **Type**, **Direction** (**Alış / Elden Çıkarma** — acquire / dispose), **Quantity**, **Total Quantity** (auto), **Unit Price**, **Transaction Total** (auto), **Obtained where / gone where**, **Person**, note. Bottom row: computed totals.

Direction exists because reality demanded it: lifetime purchases (~1,2 kg charted+ledgered) versus current holdings (30 g) differ by a car — that event becomes an honest ledger entry instead of gold silently vanishing between two documents.

### 8.4 Sub-section 3b — Holdings

Per person × per type: current quantity (derived from the ledger and cross-checked), current value = quantity × current price (from 3c). Per-person totals and grand total.

### 8.5 Sub-section 3c — Current prices

- **Manual entry is the authority.** Owner types current unit prices per type.
- If the live provider (§14) has data, it is displayed **beside** the manual value — backing it up, never replacing it — with its fetch timestamp.

### 8.6 Cost vs. market (owner: "exactly should")

Both bases are always visible: **cost basis** (what was paid, from the ledger) and **market value** (holdings × current price), with the difference shown explicitly as **unrealised gain/loss**, per person and in total. (In the source data at inspection time: cost ₺188,000 vs market ₺195,150 = +₺7,150 unrealised — two disagreeing totals that never explained themselves; now they do.)

---

## 9. Section 4 — Calculation Zone

Deliberately unfancy. An indefinite list of `label : value` lines (add/remove freely), with always-visible computed **TOTAL**, **AVERAGE**, **MEDIAN** headers. The source workbook only ever sketched this section in placeholder text; JADEITE's is the first real implementation.

---

## 10. Overview

The zoomed-out dashboard (the workspace metaphor's natural "overview," as in Niri): all years as cards with net results; grand totals — current debt, remaining limit, valuables market value, unrealised G/L; trend charts and year-over-year comparison. Read-only; every number is derived from Sections 1–3. This is the corporate-charismatic showpiece and is scheduled late (Realisation VIII).

---

## 11. Altın Eğrisi (the chart view)

Replaces `Altın_Eğrisi.pptx` — two charts the owner maintained by hand in a third application because the spreadsheet could not visualise its own ledger, which drifted (one chart a purchase behind the other) and forced data falsification (300 g and 400 g entered as 0.300 and 0.400 so a linear axis wouldn't crush the small bars).

JADEITE's version is **derived entirely from the Section 3 ledger** — zero maintenance, always current:

1. **Spektrum** — unit-price line over time (real **date axis**, so an out-of-order or mistyped date is visibly impossible to miss).
2. **Frekans** — acquisition quantity per date (columns).
3. **Market value over time** — holdings × price history where available.

All charts are interactive: **log-scale toggle**, zoom, hover values. The 300 stays 300 forever and remains readable.

---

## 12. Theming & Palettes

### 12.1 The ten palettes

Selectable in-app; canonical published values are authoritative (owner's ruling — no external palette file needed):

| Palette | Mode |
|---|---|
| Default Light | light |
| Default Dark | dark |
| Noctalia | dark |
| Catppuccin Latte | light |
| Catppuccin Frappé | dark |
| Catppuccin Macchiato | dark |
| Catppuccin Mocha | dark |
| Rosé Pine Dawn | light |
| Nord | dark |
| Kanagawa Lotus | light |

(6 dark, 4 light.) Default Light/Dark are JADEITE's own restrained neutrals, defined in Realisation II.

### 12.2 Token system

Every colour in the app resolves through CSS custom properties; palettes are token maps. No component ever hard-codes a colour.

### 12.3 Year accents

Automatic: each year takes the next accent from the active palette's accent sequence, applied with deliberate restraint (banding, headers, switcher chips). **Elegance constraint (owner's words): this is not a kid's-play app — colours must never be chaotic; clarity must be high.** Accents are muted toward the palette's surface tones; a manual per-year override exists.

---

## 13. Localisation

- **Turkish is primary.** English available.
- **Manual switching only.** The app must never read the OS locale, and must never change language on its own — the owner's explicit prohibition. Language is a setting inside the vault, defaulting to Turkish on vault creation.
- Number/date/currency formatting follows the selected app language, not the OS.

---

## 14. Live Price Provider

- Source: `https://www.haremaltin.com` or a derived endpoint of that source (per the v1 manifesto; the source workbook's own AÇIKLAMA column says "HAREM" — this is the owner's real-world source, not a hypothetical).
- Implemented as a **swappable provider module** behind a stable interface: an unofficial source *will* change someday and must be replaceable without touching anything else.
- **Manual refresh is primary**; optional auto-refresh interval. Polite rate limiting. Fetched values are timestamped snapshots stored beside — never over — manual prices (§8.5).
- Graceful degradation: offline or provider-broken states are quiet and non-blocking; manual values carry on as authority.
- This is the **only** permitted network egress in the entire application.

---

## 15. Backup & Machine Transfer

- **Backup is the single sanctioned exception** to the no-outgoing-data rule, on the owner's terms: the backup is an encrypted container (`.jbk` = key envelope header + SQLCipher database + checksums) readable by nothing on Earth except JADEITE plus a valid credential. Nothing legible ever leaves.
- Backup destinations are local paths chosen by the owner (the archive HDD is the intended home). No cloud, ever.
- The app prompts for a backup after every credential change (§4.4) and offers periodic reminders.
- **Machine transfer:** primary home is the main rig; the laptop (or any future machine) is served by moving the `.jbk` by USB/drive and using the app's **import-database** function. Import fully replaces the local vault after explicit confirmation and credential verification. No network sync exists or will exist.

---

## 16. Prohibitions (hard, permanent)

1. **No outgoing data** in any legible form: no PDF/CSV/XLSX export, no printing pipeline, no share targets, no clipboard bulk-export features. The encrypted `.jbk` backup (§15) is the sole exception.
2. **No telemetry, analytics, crash reporting, or update phoning** of any kind.
3. **No cloud** anything.
4. **No OS-locale detection** (§13).
5. **No external configuration files** — all settings live inside the encrypted vault (§4.1).
6. **No portable build** — installer only.
7. **No AI implications, flags, or banners anywhere in the build or release process**: commits, tags, release notes, code comments, and artefact metadata contain no AI attribution of any kind.
8. Release tags contain **only** the version (`v0.5` — correct; `v0.5 - bugfix` — incorrect).

---

## 17. Versioning, Repository & Release Discipline

- Versions are two digits: **v0.1, v0.2, … v0.9, v1.0, v1.1, …** One bump per Realisation, regardless of the Realisation's size.
- Documents use Roman numerals (**Realisation I → v0.1**, Realisation II → v0.2, …); git tags use Arabic, version-only.
- The repository is **private** on the owner's GitHub for the entire realisation ladder; every Realisation is built, tested, committed, pushed, and released privately. Any future opening of the source (GPL-3.0 permits it) is solely the owner's decision, after the ladder completes.
- Security implementation starts at Realisation I — the vault exists before any section does.
- The ladder may be subdivided further if implementation reality demands smaller chunks; Realisation quantity may grow, never shrink in rigour.

---

## 18. Migration (scheduled last — Realisation XII, owner's ruling)

Migration happens only after the app is fully realised **including the Windows port**: "everything built … the app became realized, then import."

### 18.1 Sources

1. `JADEITorigin.xlsx` — Sections 1–3 seed data (Sep 2022 → Jul 2026 at inspection).
2. `Altın_Eğrisi.pptx` — the deep gold history: 36 purchase events Aug 2022 → Jun 2026 with dates (Excel serials), unit prices, and quantities.

### 18.2 Correction table (agreed during forensic review — applied by the importer, each correction flagged for one-click confirmation)

| # | Finding in source | Correction |
|---|---|---|
| 1 | Sheet 2 formulas `I16`/`I18` silently omit column F | Totals recomputed by engine; discrepancy report shown if any figure shifts |
| 2 | June 2025 ELEKTRİK entered `+500.0` (owner: "forgot the minus") | Imported as an ordinary expense of 500.0 |
| 3 | `'-'` text placeholders throughout | Imported as empty |
| 4 | Phantom table column `T` headed "1" | Dropped |
| 5 | Chart quantities `0.300` / `0.400` (owner: real values 300 g and 400 g, divided by 1000 to survive the linear axis) | Restored to **300** and **400** |
| 6 | Chart row serial `45612` (16 Nov 2024) @ ₺1,865 — impossible for that date; fits Sep–Oct 2023 | Imported with price as ground truth, date ≈ Oct 2023, `date_provisional = true`, pending the owner's haremaltin history check (open item Q1) |
| 7 | Frequency chart one-plus purchases behind the price chart / ledger | Sources merged and de-duplicated on (date, price, quantity) |
| 8 | pptx rows carry no ownership | Person = **Ortak** pending reassignment |
| 9 | Lifetime (~1,200 g through 18 Jul 2026: 1,090 g charted + two ledger buys missing from the frequency chart) vs current holdings (30 g) | Gap entered as dated **Elden Çıkarma** transaction(s) — the car — authored by the owner in the wizard, so holdings derive correctly |

### 18.3 Acceptance fixtures (the app must reproduce these from imported data)

- Section 2 grand total debt **₺48,271.63**; total remaining limit **₺1,240,596.08** (figures valid as of inspection; the importer recomputes and reports).
- Section 3: current holdings **30 g**; cost basis **₺188,000**; market value **₺195,150** at the recorded manual price ₺6,505/g; unrealised **+₺7,150**; per person Kişi A **₺130,100**, Kişi B **₺65,050**.
- Altın Eğrisi: 36+ merged acquisition events; corrected lifetime quantity **1,200 g** (through 18 Jul 2026); price series ₺1,000/g (4 Aug 2022) → ₺6,505/g (18 May 2026) rendered on a true date axis.

---

## 19. Decision Register (compact)

| Topic | Ruling |
|---|---|
| Framework | Electron + React (three-way comparison recorded; RAM cost accepted; cold start is the real metric) |
| Platform order | Linux to full completion → finalise → Windows port |
| Machine strategy | Main rig primary; transfer via encrypted file + import function; no sync |
| Language | Turkish primary, English optional, **manual switch only, never OS locale** |
| Credentials | Master password; **every successful password reset consumes the recovery key and issues a fresh one**; exactly one valid at any time; both lost = unrecoverable |
| Backup | Encrypted `.jbk` only; prompt after credential changes; truth table in §4.4 |
| Sign convention | Amounts positive; category/direction carries sign; refunds explicit |
| Section 1 | Year-workspaces (Niri-style), per-year column sets with inheritance |
| Section 2 | Forward-looking tracker; read-only archive on rollover |
| Section 3 scope | Gold set + USD + EUR + silver + ziynet — **closed list** |
| Cost vs market | Both, plus explicit unrealised G/L per person and total |
| Migration | **Last of all**, after Windows; corrections table §18.2 |
| Year accents | Automatic from palette, elegance constraint, manual override |
| Overview | Yes — late realisation |
| Altın Eğrisi | Yes — as a derived view, never a data store |
| Palettes | The ten named palettes, canonical published values |
| Naming | `XJADEITE.md`, `REALISATION.md`, Realisation I/II/III…, British *-isation* throughout, git tags Arabic version-only |

---

## 20. Open Items (owner-side, non-blocking)

- **Q1:** true date of the ₺1,865 purchase (chart serial 45612) — check haremaltin price history; until then the row stays `date_provisional`.

*End of specification. The build plan lives in `REALISATION.md`.*
