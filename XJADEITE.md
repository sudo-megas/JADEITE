# XJADEITE

**Project:** JADEITE — the secure personal wealth & possessions tracker
**Copyright:** sudo-megas · **Licence:** GPL-3.0 · Free and Open-Source Software
**Status:** Specification v3 · amended 31 July 2026 (supersedes v2) · Companion document: `REALISATION.md`
**Amendments:** 2026-07-29 — §4.1, §5.1, §7.3, §16.6, §17, §19 (configuration split into two files; the Section 2 freeze made explicit and reversible; point revisions), settled during Realisations II and IV. · 2026-07-30 (Realisation VII) — §3.3, §5.3, §8.2, §8.3, §14.1, §14.3, §16.2, §19 (two allowlisted hosts and where the session governs them; ziynet struck from the closed list; the socket's decimal format; identification is impossible; the price ceiling). · 2026-07-30 — §1, §15, §16.2, §18, §19, §20 (the migration importer is retired before construction; the ladder ends at Realisation XI; nothing ships that only this owner could use; the `.jbk` importer's remit is backup, restore, copy and merge). · 2026-07-31 (point revision v0.8b, after the owner's first use of the built application) — §5.3, §7.1, §7.3, §9, §12.3, §13, §19 (Section 2 loses its year, its rollover and its archive; Section 4 loses the label and becomes a grid of value boxes; dates read `GG/AA/YYYY`). · 2026-07-31 (pre-Realisation IX survey) — §20 (what open item Q2 actually gates, measured against schema v3; **no ruling made** — the question is narrowed, not answered).
**Provenance:** Every decision in this document was settled explicitly between the owner and the architect during pre-realisation review. The forensic findings below were extracted from `JADEITorigin.xlsx` (the retiring workbook), `Altın_Eğrisi.pptx` (the retiring chart deck) and one year-banding screenshot. Those artefacts are the owner's private reference material; **the build never reads them** (§18).

---

## 1. Mission & Philosophy

JADEITE exists so that its owner never needs an office suite again for tracking what they have, what they owe, and what they earn. It replaces one LibreOffice workbook and one PowerPoint deck — both of which were found, on forensic inspection, to be silently rotting (a dropped column reference in a hand-typed total, two hand-maintained charts drifting apart, data falsified by a factor of 1000 to survive a chart axis). JADEITE's totals are computed by code written once and tested, not by formulas re-typed per cell.

Guiding truths:

- **It is the most secure environment on the owner's machine.** Everything at rest is encrypted; nothing legible ever leaves.
- **Rendering is identical everywhere.** The app ships its own rendering engine; a file that looks different in another suite is a category of problem that no longer exists.
- **It is a lifetime app.** Data outlives UI. The schema is the app; the interface is replaceable.
- **It is eye-candy with a straight face** — elegant, serious, corporate-feeling, charismatic. Never chaotic, never childish. Clarity is a hard requirement, not a style preference.
- **Dependency count is not a constraint.** The question is never "how minimal" but "how superb." Package size up to 1 GB is acceptable.
- **Nothing single-use ships, and nothing ships that only this owner could use.** Every feature in the binary earns its place twice: through repeated use over the life of the app, and by being usable by a second person who has never seen the owner's files. A feature shaped around one particular document fails both tests at once. Scaffolding is refused at design time, which is the cheapest moment to refuse it (§18.1).
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

No spreadsheet, presentation, or document-parsing library appears anywhere in the dependency tree — by construction (§16.2).

### 3.3 Electron hardening posture (non-negotiable)

`contextIsolation: true`, `nodeIntegration: false`, sandboxed renderers, strict CSP, no remote content of any kind, preload exposes a minimal typed IPC surface only. Network egress is limited to the **two** allowlisted price-provider hosts of §14.1 — the socket lives on a different machine from the history endpoint — and nothing else. No telemetry, no crash reporting, no update checks.

**Amendment of 30 July 2026 — where "blocked at the session level" is true, and where it is not.** This clause read "everything else is blocked at the session level", and Realisation VII measured that claim rather than repeating it. Electron's `webRequest` filter intercepts **Chromium's** network stack: a renderer's request and a main-process `net.request` both pass through it, and cancelling either one works. Node's own stack does not go near it — a global `fetch` is invisible to the filter and cannot be cancelled by it, and Node's `WebSocket` is the same stack. The price socket is therefore governed by a single in-process chokepoint that every outbound URL must pass, while the renderer and the history request are governed by the session as this clause always claimed. Both remain true statements; only one of them was ever true of everything.

The renderer's own policy did not move. `connect-src 'none'` stands in both of its homes, because the provider runs in the main process and the renderer never acquired a reason to reach the network. And the predicate that widened is **not** the one governing navigation: `will-navigate` still permits nothing but this application's own files, since a permitted top-level navigation to a provider host would hand a remote origin the preload bridge.

### 3.4 Cold start (hard requirement)

- Launch → lock screen: **≤ 1.5 s** on the reference rig (Ryzen 7 9800X3D / NVMe), **≤ 3 s** on the reference laptop (Ryzen 5 3450U / SATA SSD).
- Successful unlock → interactive Section grid: **≤ 1 s** (excluding the deliberate Argon2id cost, which is password-entry time and a security feature, not a performance defect).
- No splash-screen theatre.

---

## 4. Security Architecture

### 4.1 Vault layout and the configuration split

**Amended 2026-07-29.** JADEITE keeps **two configuration files, split by sensitivity**: one unencrypted file for general application configuration, and the encrypted vault for everything else.

The **data directory** (per-OS, §5.1) contains exactly two app-managed files:

- `jadeite.db` — the SQLCipher database. All user data lives here, together with every setting that governs access to it (auto-lock timeout and, later, backup policy). Changing any of those requires the vault key.
- `jadeite.keys` — the cleartext key-envelope header: format version, Argon2id parameters, two salts, and two wrapped copies of the DEK (§4.2). This file contains no secrets usable without a credential; it is data-store plumbing, not user configuration.

The **config directory** (per-OS, §5.1) contains exactly one app-managed file:

- `config.json` — general application configuration, unencrypted: **the active palette and the app language, and nothing else.**

**Why the split exists (owner's ruling).** Both of those are needed *before* the vault is open. Keeping them inside it meant the lock screen could not honour the owner's own palette or language, so the app greeted its owner in a theme they had not chosen. That is a worse outcome than a plain file holding two preferences.

**Rules that keep the split honest:**

1. **One home per value.** Appearance and language live *only* in `config.json` and are never mirrored into the vault. Two copies of one truth is the failure that let the source workbook's bank list diverge from itself.
2. **Nothing about money, ever.** `config.json` holds no amount, no credential, no key material, and nothing that assists in opening the vault. What it discloses to a reader is that JADEITE is installed and which colours its owner prefers.
3. **Untrusted on read.** The file is hand-editable by construction, so every field is validated: an unknown palette or an unsupported language falls back to the default rather than propagating, and unrecognised keys are ignored.
4. **Separate directories.** `config.json` lives in the OS configuration directory, not beside the database, so the data directory still holds exactly the two files named above.
5. **Written atomically**, owner-only (`0600`).

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

**Data** (encrypted at rest — `jadeite.db`, `jadeite.keys`):

- Linux: `~/.local/share/jadeite/` (honouring `XDG_DATA_HOME`)
- Windows (post-port): `%APPDATA%\jadeite\`

**Configuration** (unencrypted — `config.json`, §4.1):

- Linux: `~/.config/jadeite/` (honouring `XDG_CONFIG_HOME`)
- Windows (post-port): `%APPDATA%\jadeite\`

Default OS user locations. Data is encrypted at rest exactly per the v1 manifesto; configuration carries only appearance and language.

### 5.2 Value representation

- **All monetary amounts are stored as integers in minor units** (kuruş / cents). No floats touch money.
- **All amounts are stored positive; the category/direction carries the sign.** Expenses are not negative numbers; disposals are not sneaky sign flips. A refund is an explicit flag on an entry, not a `+` where a `−` was forgotten. (This retires two documented incidents in the source workbook: the June-2025 elektrik sign slip and the `'-'` text placeholders.)
- Quantities of weighable valuables are stored as integer milligrams; countable coins as integer pieces.
- Dates are ISO-8601 strings; a boolean `date_provisional` flag exists for hand-entered historical rows whose date is still under review (§18.3, item 6).

### 5.3 Schema sketch (informative, finalised in Realisation I)

`settings` · `years` · `s1_categories(year, name, kind[income|expense], position)` · `s1_entries(year, month, category, amount, is_refund, note)` · `s2_banks(name, credit_limit, position, is_counter, counter_party)` · `s2_cells(month, bank, amount)` · `persons` · `valuable_types` (closed seed list, §8.2) · `s3_transactions(seq_auto, date, date_provisional, type, direction[acquire|dispose], denomination, piece_count, quantity*, unit_price, source, person, note)` · `s3_prices_manual(type, value, updated_at)` · `s3_prices_live(type, value, fetched_at, provider)` · `s3_price_fetch(provider, attempted_at, outcome, succeeded_at)` · `s4_cells(slot, value)` · `backup_log`.

*(Amended 31 July 2026.)* The Section 2 tables carried a `year` referencing `years`, and Section 4's table was `s4_lines(label, value, position)`. Both changed in schema v4 — see §7.3 and §9. `years` remains, parenting Section 1's two tables alone.

Derived values (totals, holdings, remaining limits, gains) are **computed, never stored**.

The schema is authored from this document alone. It was never derived from, and does not mirror, the layout of any external file.

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

### 6.4 Entry ergonomics (elevated requirement)

Because **all** data — historical and future — arrives by hand (§18), keyboard-first entry is a first-class feature, not a convenience: Tab/Enter traversal, type-and-go without mouse acquisition, paste of a single value, undo of the last edit, and no modal dialogue on the common path. The same requirement applies to Sections 2, 3 and 4.

---

## 7. Section 2 — Payments / Installments

**Purpose (owner's ruling):** *not* data collection. It is the forward-looking tracker — "what month, how much in total, seen in advance." Already-certain future payments are written here.

### 7.1 Grid

- **12 fixed month lines** (Ocak → Aralık). One standing grid — see §7.3.
- **Indefinite bank/card columns**, added horizontally by the owner.
- Top bar rows: **1. Bank Name**, **2. Credit Limit**.
- Per-month computed **TOTAL DEBT** column, closely set at line end.
- Bottom bar rows: **1. DEBT** (per-bank total), **2. Remaining Limit** (per-bank: limit − debt), **3. TOTAL REMAINING LIMIT** (full-width).
- The intersection of the DEBT row and the TOTAL DEBT column is **GRAND TOTAL DEBT**.
- **Counter columns** (opt-in), placed after TOTAL DEBT: row 1 = bank, row 2 = person (e.g. "sayacA"). Their values are computationally reversed relative to debts — they reduce totals. Stored positive with `is_counter`; the engine applies the sign.
- All totals, limits, and remainders recalculate instantly on every edit. Structural bugs of the source workbook (the December formula that silently dropped a bank column; the bank list duplicated in two places and already diverged) are impossible by construction: one bank definition, engine-owned totals.

### 7.2 Visual language

The source's icon-sets and data-bars are honoured in spirit, executed elegantly: restrained magnitude bars on TOTAL DEBT, subtle paid/pending state cues — palette-consistent, never carnival.

### 7.3 One standing grid — no year

**Amendment of 31 July 2026, after the owner's first use of the application.** Section 2 has no year. It holds one set of bank and counter columns and twelve month lines, and it is about the present: *"that section is simply for let us see what debts and fixed installments we have right now."* There is no year selector, no year rollover, no read-only archive, and no year column in `s2_banks` or `s2_cells`.

This subsection previously specified the opposite, and both of its earlier readings are recorded here rather than deleted. The original required that "on starting a new tracking year, the previous grid is frozen as a **read-only archive** reachable from a year selector; the new year begins with the bank set carried over and amounts cleared" — written against the source workbook, which overwrote itself every January. An amendment of 2026-07-29, during Realisation IV, then made the freeze an **explicit, reversible act** rather than an automatic consequence of creating the next year, because the original wording meant that adding 2027's workspace in October silently removed the ability to correct November.

**The capability is genuinely gone, and that is recorded rather than glossed.** There is no longer any way to look at what a bank was owed in a previous year, and no archive to freeze or reopen. The owner's ruling is that there is nothing to look at: *"i am not logging previous years bank debts."* The rollover machinery was built to protect a history this section was never going to accumulate, and the migration that removes the year keeps only the most recent grid — earlier years' banks and amounts are dropped (schema v4). A later Realisation that wants payment history back should disagree with this paragraph deliberately rather than rediscover the gap.

What §7.3 was really answering — "nothing is destroyed by January anymore" — is answered differently and more simply: nothing is destroyed by January because January is not a boundary. The twelve lines are the twelve months the owner is living in, and an instalment plan that runs past December runs into the same grid it started in.

Section 1 keeps its year-workspaces (§6.1) untouched. That is where a year of history belongs, and creating a year there no longer touches Section 2 at all.

---

## 8. Section 3 — Valuables

Grounded, per the manifesto, in Turkish economy and culture.

### 8.1 Persons

Owner-defined persons (free creation, rename, colour dot). Every transaction belongs to a person; historical rows whose ownership the owner cannot recall default to **Ortak (Unassigned)** for later reassignment.

### 8.2 Valuable types — closed list (owner's ruling: "only these")

Built-in gold set: **Gram**, **Çeyrek**, **Yarım**, **Tam**, **Ata (Cumhuriyet)**, **2.5 (Gremse / İki Buçuklu)**, **5 (Ata5 / Beşli)** · plus **USD**, **EUR**, **Gümüş (silver, gram)**. Ten types. No user-defined custom types.

**Amendment of 30 July 2026 — Ziynet is the family, not a member of it.** The list carried an eleventh type, *Ziynet (22 ayar, gram)*, and the owner's ruling is that the word names the parent category: çeyrek, yarım, tam, ata, 2,5 and 5 are all **ziynet altını**. Standing it in the closed list *beside* those six named a category as though it were a product. The owner's gram gold is 24 ayar — which is what `KULCEALTIN` quotes, and §14.3's evidence agrees, none of their twenty-four dated purchase prices falling inside `AYAR22`'s band against sixteen inside `KULCEALTIN`'s — and the 22-ayar things they hold are the coins, each of which already has a row. So the type described nothing they own.

**The capability it carried is genuinely gone, and that is recorded rather than glossed.** There is now no type in which *weighable* 22-ayar gold — bilezik, burma, anything sold by the gram rather than struck — can be entered. The rejected alternative was renaming the row to *22 Ayar Bilezik*, which would have kept that home at no migration cost; the owner ruled for the shorter list with the trade-off stated. Reopening a closed list costs an amendment here and a Realisation of its own, so a later rung wanting bilezik back should disagree with this paragraph deliberately rather than rediscover it.

The migration that removes it is **conditional** on no ledger row depending on the type. `foreign_keys` is ON before migrations run and three tables reference `valuable_types(code)` with no `ON DELETE`, so an unconditional delete against a vault holding one ziynet row would abort, roll back, and re-fail on every subsequent open — locking the owner out behind the only interface that could have cleared it. History is not tidied away to shorten a list (§16.1).

**Amendment of 30 July 2026 — Tam and Ata are two products, not one.** The list previously read "Tam (Cumhuriyet)", which conflated them. The owner's real source quotes both, and they are distinct: measured against the çeyrek price on 28 March 2026, Tam is 3,722× and Ata is 3,833× — about 3% apart, because *Cumhuriyet altını is the Ata*, not the Tam. The owner's own retiring workbook priced its coins at ₺10.280, which is a **Tam** price (real quotes that day: Tam 10.270/10.572, Ata 10.542/10.799), so the holding being retired is Tam and Ata was simply absent from the list. Both now exist, and the closed list is six gold coins rather than five.

Recorded so the sizes are never re-derived: ordered smallest to largest, **Çeyrek < Yarım < Tam < Ata < 2.5 < 5** — verified against real quotes, at 1,000 · 1,917 · 3,722 · 3,833 · 9,444 · 18,996 times the çeyrek price. The ordering is the useful fact; the ratios drift, because each denomination carries its own premium (Tam trades at 3,722× çeyrek, not the 4,0× its gold content implies).

The names *Gremse* for 2.5 and *Ata5* for 5 are the source's, and market usage reads them as two-and-a-half Tam and five Ata respectively. That is not asserted here as measurement — the observed ratios cannot separate 2,5 × Tam from 2,5 × Ata within the premium noise — and nothing depends on it, since each of the six has exactly one quoted counterpart and no mapping choice arises.

Every coin above is 22 ayar, which is also what **Ziynet** is; ziynet differs only in being sold by the gram rather than as a struck coin.

### 8.3 Sub-section 3a — Transaction ledger

Columns: **No** (auto-numbered — the source's hand-typed duplicates 14,14,17,17 are structurally impossible), **Date** (+ provisional flag), **Type**, **Direction** (**Alış / Elden Çıkarma** — acquire / dispose), **Denomination**, **Count**, **Quantity** (auto = denomination × count), **Total Quantity** (auto), **Unit Price**, **Transaction Total** (auto), **Obtained where / gone where**, **Person**, note. Bottom row: computed totals.

**Amendment of 30 July 2026 — a weighable row records its denomination and its count, not only the total.** The ledger previously stored one quantity, which made `1 × 10 g` and `2 × 5 g` the same row. They are not the same thing, in the owner's words: *"'2 x 5gr' let me know that there are physically 2 chunks of gold, that is pretty much matters."* A total destroys information that no later computation can recover — how many physical pieces are in the drawer — so the two fields are stored and the total is derived, in the same spirit as every other computed figure in this application.

This applies to the **weighable** types only (`mg` units: Gram and Gümüş). Coins are counted in pieces, so their denomination is the type itself and `Count` is the whole story; the denomination column is inert for them rather than absent, so one grid serves both.

Holdings (§8.4) may therefore report a composition — *30 g held as 2 × 10 g + 2 × 5 g* — and not merely a weight. Cost basis is unaffected: lots are still consumed oldest-first **by weight**, because a disposal of 7 g out of a 10 g bar is a real event and a bar is not indivisible in the market.

**Those two sentences pull against each other, and the resolution is that composition is reported only while it is knowable.** A disposal that consumes whole chunks leaves a composition; one that splits a chunk does not, because 10 g acquired against 7 g disposed leaves 3 g with no honest chunk story — the bar was cut, or swapped, or was never a bar. In that case 3b reports the remainder as **an unattributed weight and says so**, in the same spirit as `oversold` (§8.4): the figure that cannot be derived is named rather than invented. A composition that quietly reported *3 g as 1 × 3 g* would be the workbook's defect wearing a new hat.

**This is the first schema migration since Realisation I** and the reason it is worth one: the alternative was the note field, which would hold the same fact where nothing can total, chart or verify it.

Direction exists because reality demanded it: lifetime purchases (~1,2 kg charted+ledgered) versus current holdings (30 g) differ by a car — that event becomes an honest ledger entry instead of gold silently vanishing between two documents.

### 8.4 Sub-section 3b — Holdings

Per person × per type: current quantity (derived from the ledger and cross-checked), current value = quantity × current price (from 3c). Per-person totals and grand total.

### 8.5 Sub-section 3c — Current prices

- **Manual entry is the authority.** Owner types current unit prices per type.
- If the live provider (§14) has data, it is displayed **beside** the manual value — backing it up, never replacing it — with its fetch timestamp.
- **One price per type**, not a series. Price history is the ledger's own rows (§11.3).

**Amendment of 30 July 2026 — coins are quoted at the ESKİ price.** The source quotes every coin twice, ESKİ and YENİ. **The owner's ruling is that the ESKİ quote is the one that values their holdings**, on the owner's understanding that YENİ denotes a coin struck in the current year and that everything from an earlier year — 2025 included — is ESKİ. The holdings were acquired between 2022 and 2025.

The ruling stands, and the reasoning behind it is recorded as **the owner's, not as measurement**, because the price data does not confirm it. Two findings, both from the source's own ten-year history:

- **The gap is small.** Over 3.628 shared days the çeyrek ESKİ/YENİ satış ratio averages **0,9946** — about half a percent — ranging 0,9670 to 1,0000. On 29 July 2026 the six coins sat at 0,9908 · 0,9893 · 0,9877 · 0,9937 · 0,9941, and **`ATA5` quoted ESKİ and YENİ identically**, so for the 5 the distinction is inert. An earlier draft of this clause claimed roughly 2,5%; that figure came from a handful of late-March 2026 days and was not representative.
- **There is no annual reclassification visible in the prices.** If YENİ rolled over each 1 January, the ratio would step at the boundary. Tested across ten consecutive new years (2017–2026) the change was between −0,0044 and +0,0013 — noise, against daily variation ten times larger. The series behave like two standing products with a small drifting premium, not like a category that reassigns itself yearly.

Nothing here overturns the ruling: ESKİ is the lower of the two, so the choice errs toward understating the §8.6 market value rather than overstating it, which is the right direction for a figure the owner checks by hand. But if the owner's definition is right, then a coin bought this year is misvalued by roughly a percent until January; and if it is wrong, the whole distinction is a product difference the holdings should simply be matched against once. Either way the correction is the same and is deliberately deferred: **store each coin's mint year and derive the classification.** That is more schema than a half-percent question earns today, and it is written down so a later Realisation can disagree on purpose.

The other rejected alternative was storing both quotes, which doubles every price row and pushes a choice onto each ledger row for the same half percent.

### 8.6 Cost vs. market (owner: "exactly should")

Both bases are always visible: **cost basis** (what was paid, from the ledger) and **market value** (holdings × current price), with the difference shown explicitly as **unrealised gain/loss**, per person and in total. (In the source data at inspection time: cost ₺188,000 vs market ₺195,150 = +₺7,150 unrealised — two disagreeing totals that never explained themselves; now they do.)

---

## 9. Section 4 — Calculation Zone

Deliberately unfancy. A grid of plain **value boxes**, ten to a row, with always-visible computed **TOTAL**, **AVERAGE**, **MEDIAN** headers that move as the boxes are filled. The grid begins at ten rows and grows a fresh row of ten whenever the last row is first used, so a month of a hundred and twenty figures never runs out of room and a short month never shows a page of empty boxes. The source workbook only ever sketched this section in placeholder text; JADEITE's is the first real implementation.

**Amendment of 31 July 2026, after the owner's first use of the application.** This section specified "an indefinite list of `label : value` lines (add/remove freely)" and shipped that way in Realisation VI. It was wrong about what the section is for. The owner's finding: *"it is difficult for user to add every expense in a month… there could be 120 transactions in a month… user have to enter all of them by tags???"* A label typed before every figure is a per-figure tax on the one activity §9 exists to serve, which is totalling a column of numbers quickly.

**The label is gone, and with it the capability it carried.** A box holds a figure and nothing else; there is no way to name a figure, and no way to write a heading between two of them. The rejected alternative was an optional label — which keeps the tax as a temptation and leaves two shapes of row to reason about — and the owner ruled for bare boxes with the trade-off stated. A line that needs naming belongs in Section 1, where a category is a column and the naming is done once instead of once per figure.

The arithmetic is unchanged: TOTAL, AVERAGE and MEDIAN over the boxes that hold a figure, exact to the kuruş, with an empty grid answering "—" rather than zero. An untouched box is not a zero (§6.3's rule, which this section keeps); a box holding a typed zero is.

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

*(Amended 31 July 2026.)* Year accents belong to Section 1 and the Overview. Section 2 wore one until §7.3's amendment left it with no year to derive one from, and it now takes the palette's own accent — which is what the year-accent variables already fall back to.

---

## 13. Localisation

- **Turkish is primary.** English available.
- **Manual switching only.** The app must never read the OS locale, and must never change language on its own — the owner's explicit prohibition. Language is a setting inside the vault, defaulting to Turkish on vault creation.
- Number/date/currency formatting follows the selected app language, not the OS.
- **Dates read `GG/AA/YYYY` — day, month, year, separated by a slash — in both languages** *(amended 31 July 2026, at the owner's request)*. This is the application's own convention, chosen once and applied everywhere it prints a date; the prohibition above is on reading the machine's conventions, not on having any. Note that it is not ICU's Turkish default, which uses full stops. Dates are still **stored** as ISO-8601 (§5.2) — this rule is about what the owner reads and types, and the two are deliberately different things.

---

## 14. Live Price Provider

- Source: `https://www.haremaltin.com` or a derived endpoint of that source (per the v1 manifesto; the source workbook's own AÇIKLAMA column says "HAREM" — this is the owner's real-world source, not a hypothetical).
- Implemented as a **swappable provider module** behind a stable interface: an unofficial source *will* change someday and must be replaceable without touching anything else.
- **Manual refresh is primary**; optional auto-refresh interval. Polite rate limiting. Fetched values are timestamped snapshots stored beside — never over — manual prices (§8.5).
- Graceful degradation: offline or provider-broken states are quiet and non-blocking; manual values carry on as authority.
- This is the **only** permitted network egress in the entire application.

### 14.1 What the source actually is (reconnoitred 30 July 2026)

Recorded because it was established by real requests, and because a provider written against a guess fails silently. **None of this is a stable contract** — it is an unofficial source, which is exactly why §14 requires the interface to be swappable.

**Live prices arrive over a websocket, not an HTTP endpoint.** `wss://hrmsocketonly.haremaltin.com`. On connection the server pushes an unsolicited `price_changed` event carrying all 55 instruments, with no subscribe step — so *connect → take the first frame → disconnect* is a single-shot snapshot of about one and a half seconds, which is precisely the primitive manual-refresh-primary needs. The socket.io **polling** transport is disabled server-side, so there is no plain-HTTP route to a current price.

**History is a plain JSON endpoint.** `POST https://www.haremaltin.com/ajax/cur/history`, form body `kod` · `dil_kodu` · `tarih1` · `tarih2`, requiring the header `X-Requested-With: XMLHttpRequest` (without it the request 404s) and a session cookie from the chart page. It returns daily closes as `{alis, satis, kayit_tarihi}` — dot-decimal strings, four places — reaching back to 2012 for gold. No key, no token, no authentication.

**Amendment of 30 July 2026 — "four places" is true here and false of the socket.** The history endpoint does send four decimals. The socket does not send a consistent number of any: a single `price_changed` frame carried `CEYREK_ESKI` as `"10124"` with no decimal point at all, `GUMUSTRY` as `"94.017"` with three, and `USDTRY` as `"47.3600"` with four. A parser written to the sentence above would have read a çeyrek as ₺1,01 and stored it without complaint — and would have passed every fixture-based test, because the fixtures were written from the same sentence. Recorded because it is the one silent failure of this source that reconnaissance missed, and because it is the argument for capturing a real frame into the fixtures rather than authoring one to the documentation.

**The widely-circulated recipe is dead.** `/tmp/altin.json` and its siblings are still named in the source's own JavaScript, every call site preceded by `PASIF: AJAX SİSTEMİ DEVRE DIŞI` and an early return. They 404. Anyone reviving this module from a web search will find that recipe first; it has not worked since before this was written.

### 14.2 Two silent failures the provider must defend against

Both were observed, and both return HTTP 200 with `error:false`. This is what §14's "response validation" is for, and neither is detectable by checking the status code.

1. **A stale cache silently truncates the tail.** Asking for history from 2022-01-01 returned a complete-looking series ending four months early; asking from 2023-01-01 returned one that was current. It is not monotone in the start date and it reproduces, so it is a cache keyed on the parameter tuple rather than a stale product — two of seven coin series were affected on the day of testing. **The returned range must therefore be validated against the range requested, and a stale tail treated as a failed fetch.** A provider that trusted it would quietly price today's holdings at a four-month-old figure.
2. **Short ranges omit the data key entirely.** A span of thirty days or fewer returns valid JSON with no `data` key at all — not an empty array. The source's own page guards on exactly this, which is evidence the behaviour is expected rather than a fault.

### 14.3 Type mapping

Established against 24 of the owner's own dated purchase prices, each tested for whether it falls inside that day's real quoted alış/satış band.

| §8.2 type | Source code | Basis |
|---|---|---|
| Gram | `KULCEALTIN` (GRAM ALTIN) | **16 of 24** owner prices inside band, against 7 for `ALTIN` (HAS ALTIN) and **0 for `AYAR22`**. That last figure is why `AYAR22` still appears in this table with no row of its own: it is the negative control. `AYAR22` quotes 22-ayar gold per gram, and not one of the owner's twenty-four dated purchase prices falls inside its band — which is consistent with their statement that the gram gold is 24 ayar and the 22-ayar holdings are the coins. A price-band match is not a measurement of fineness; the owner's ruling establishes that and this agrees with it. The tempting label match and the tighter spread both pointed at HAS ALTIN on two anchor points; twenty-four points settled it the other way. |
| Çeyrek · Yarım · Tam · Ata · 2.5 · 5 | `CEYREK_ESKI` · `YARIM_ESKI` · `TEK_ESKI` · `ATA_ESKI` · `GREMESE_ESKI` · `ATA5_ESKI` | ESKİ per §8.5. All six ESKİ codes were called and **all six return real series** — presence in the source's catalogue is not evidence of that, since `/tmp/altin.json` is also catalogued and 404s. Sizes verified in ascending order. |
| USD · EUR | `USDTRY` · `EURTRY` | TRY per unit. |
| Gümüş | `GUMUSTRY` | TRY per gram — confirmed against `GUMUSUSD`, which is quoted per kilogram. |

The owner's recorded purchase prices sit **at or slightly above satış**, which is an ordinary retail premium, so **satış** is the figure to display and a small positive spread against it is not an error.

**Nothing on the source prohibits this.** `robots.txt` permits everything but `/uye/` and sets no crawl delay; there is no terms-of-use document, no copyright assertion and no anti-automation clause. The etiquette is therefore entirely self-imposed, which for a single-user desktop app doing a handful of manual refreshes a day means: cache, ask rarely, and back off on error.

**Amendment of 30 July 2026 — the app cannot identify itself, and pretending otherwise would be worse than not trying.** This clause asked it to "identify politely". The history endpoint answers 404 with HTML to any request without a browser User-Agent, so a header naming JADEITE does not announce the application — it breaks the request. What remains of politeness is therefore entirely a matter of volume: a floor of one minute between attempts, exponential backoff to a half-hour ceiling while the source is failing, one connection of about a second and a half per refresh, and request parameters that are fixed rather than derived from the ledger — because asking only for the types the owner holds, over the owner's own date range, would make every request a small disclosure of the portfolio (§16.1).

---

## 15. Backup & Machine Transfer

- **Backup is the single sanctioned exception** to the no-outgoing-data rule, on the owner's terms: the backup is an encrypted container (`.jbk` = key envelope header + SQLCipher database + checksums) readable by nothing on Earth except JADEITE plus a valid credential. Nothing legible ever leaves.
- Backup destinations are local paths chosen by the owner (the archive HDD is the intended home). No cloud, ever.
- The app prompts for a backup after every credential change (§4.4) and offers periodic reminders.
- **Machine transfer:** primary home is the main rig; the laptop (or any future machine) is served by moving the `.jbk` by USB/drive and using the app's **import-database** function. Import fully replaces the local vault after explicit confirmation and credential verification. No network sync exists or will exist.
- **`.jbk` import is the only import in the application.** It is JADEITE reading JADEITE: same schema, same DEK, no interpretation step, no legible payload. It is load-bearing for the rig ↔ laptop workflow and for disaster recovery, and it is used for the life of the app — which is precisely why it survives the rule in §1 that nothing single-use ships. It ingests no foreign format of any kind (§16.2).
- **The importer's remit is backup, restore, copy and merge** (owner's ruling, 30 July 2026) — moving one JADEITE vault's data to another JADEITE, and nothing else. It carries no feature that reads or explains a foreign document. Full replacement is specified above and lands in Realisation IX; **merge** is named here as intended but not yet designed, because two vaults whose rows have diverged need a conflict rule and one invented in passing would be worse than none (open item Q2, §20).

---

## 16. Prohibitions (hard, permanent)

1. **No outgoing data** in any legible form: no PDF/CSV/XLSX export, no printing pipeline, no share targets, no clipboard bulk-export features. The encrypted `.jbk` backup (§15) is the sole exception.
2. **No foreign-format ingestion.** JADEITE cannot read `.xlsx`, `.ods`, `.pptx`, `.csv`, `.json`, or any other external data file. No import wizard, no column mapper, no parser. The only artefact the app ingests is its own sealed `.jbk` (§15). Data enters through the owner's keyboard and, from Realisation VII, through the one sanctioned provider of §14 — whose responses are prices and nothing else, are validated before they are believed (§14.2), and are stored beside the owner's own figures rather than over them (§8.5). That is a second door, it is named here so it cannot be treated as a precedent, and it opens onto two hosts and no others.
3. **No telemetry, analytics, crash reporting, or update phoning** of any kind.
4. **No cloud** anything.
5. **No OS-locale detection** (§13).
6. **No external configuration files beyond the single `config.json` of §4.1**, which carries the palette and the app language and nothing else. Every other setting lives inside the encrypted vault. *(Amended 2026-07-29; the original rule put all settings in the vault, which left the lock screen unable to honour the owner's own palette or language.)*
7. **No portable build** — installer only.
8. **No AI implications, flags, or banners anywhere in the build or release process**: commits, tags, release notes, code comments, and artefact metadata contain no AI attribution of any kind.
9. Release tags contain **only** the version (`v0.5` — correct; `v0.5 - bugfix` — incorrect).

---

## 17. Versioning, Repository & Release Discipline

- Versions are two digits: **v0.1, v0.2, … v0.9, v1.0, v1.1**. One bump per Realisation, regardless of the Realisation's size.
- **Point revisions** (amended 2026-07-29): work that amends an already-released Realisation rather than advancing the ladder takes a lower-case letter suffix — **v0.2b, v0.2c, …** The next ladder rung still claims the next two-digit version, so a v0.2b never consumes v0.3. A suffix is a version, not a description: `v0.2b` is correct, `v0.2 - config split` is not (§16.9 stands unchanged). `package.json` must carry valid semver, so it holds the equivalent patch number: **v0.2b → `0.2.1`**, v0.2c → `0.2.2`.
- **The ladder's final rung is Realisation XI → v1.1** (the Windows port). Data entry is not a Realisation and carries no version bump.
- Documents use Roman numerals (**Realisation I → v0.1**, Realisation II → v0.2, … Realisation XI → v1.1); git tags use Arabic, version-only.
- The repository is **private** on the owner's GitHub for the entire realisation ladder; every Realisation is built, tested, committed, pushed, and released privately. Any future opening of the source (GPL-3.0 permits it) is solely the owner's decision, after the ladder completes.
- Security implementation starts at Realisation I — the vault exists before any section does.
- The ladder may be subdivided further if implementation reality demands smaller chunks; Realisation quantity may grow, never shrink in rigour.
- **Every release is data-free by construction.** A release contains code, palettes, and strings — never figures. No build step reads the owner's files; no acceptance check requires shipping data.

---

## 18. Migration (manual, by the owner — no importer exists)

### 18.1 Ruling (amendment of 30 July 2026)

The migration importer — formerly Realisation XII, v1.2 — is **retired before construction**. It will not be built. Reasons recorded:

1. **Single use.** It would have been the most expensive-per-use code in the project: xlsx parsing, pptx parsing, Excel date-serial decoding, a nine-correction confirmation UI and a verification screen — all to run once, on one machine, against one file, and then sit in the binary forever. This contradicts §1: nothing single-use ships.
2. **Not generalisable.** A correct importer for that workbook is hardcoded to that workbook's defects (the dropped F reference, the phantom column T, `0.300` meaning 300 g). It could never read anyone else's spreadsheet, because every person lays out a spreadsheet differently. A genuinely universal xlsx importer is a different product — column-mapping UI, type inference, date heuristics, merged-cell handling — and still fails on creative layouts. Out of scope, permanently.
3. **Privacy.** No build session ever needs to read the owner's real financial history. The build produces the empty machine; only the owner fills it. Nothing that could carry the owner's figures out of the owner's hands is required to construct JADEITE.

Historical data therefore enters JADEITE exactly as all future data will: **typed by the owner into the app's own grids.** The human is the parser. Every failure mode the importer would have guarded against is absent, because there is no interpretation step. A secondary benefit is deliberate: those typing sessions are the app's real ergonomics test (§6.4) — friction discovered there is a defect worth filing.

### 18.2 Source artefacts — handling

`JADEITorigin.xlsx` and `Altın_Eğrisi.pptx` remain the owner's private reference material for the typing sessions.

- Kept on the archive HDD, **outside the repository** and outside any build, tooling, or assistance session.
- Never parsed by JADEITE and never opened by any tool acting on the app's behalf.
- **Not to be deleted** until manual entry has been verified against §18.4 — they are the only copy of the history.
- After verification passes: archive or destroy at the owner's discretion.
- Note for any future opening of the source: **this document and `REALISATION.md` themselves contain real figures** (§18.4, and the acceptance lists of Realisations IV–V). If the repository is ever made public, either omit these documents or replace the fixtures with synthetic equivalents first.

### 18.3 Manual-entry checklist (the forensic corrections, applied by hand)

The forensic review found nine defects in the sources. Each is now a rule for the owner's typing rather than a line of code.

| # | Finding in the source | What to type |
|---|---|---|
| 1 | Sheet 2 totals `I16`/`I18` silently omit column F | Type cell values only — **never a total**. JADEITE computes every total; the source's total cells are the thing being retired. |
| 2 | June 2025 ELEKTRİK entered `+500.0` ("forgot the minus") | Enter `500.0` as an ordinary expense. Positive amount; the column's group carries the sign (§5.2). |
| 3 | `'-'` text placeholders throughout | Leave the cell **empty**. No placeholder text exists in JADEITE. |
| 4 | Phantom table column `T` headed "1" | Do not create it. |
| 5 | Chart quantities `0.300` / `0.400` (real values divided by 1000 to survive a linear axis) | Enter **300 g** and **400 g**. The log-scale toggle (§11) makes falsification unnecessary forever. |
| 6 | Chart row serial `45612` (16 Nov 2024) @ ₺1,865 — impossible for that date | **Resolved: the date is 16 Nov 2023** (§20 Q1, closed 30 July 2026). Type it plainly — **no provisional flag**. The year was typed wrong, not the month. |
| 7 | Frequency chart runs one-plus purchases behind the price chart / ledger | Reconcile by eye **before** typing: the charted events plus the two ledger buys missing from the frequency chart. Enter each event exactly once. Altın Eğrisi derives from the ledger, so the two can never drift again. |
| 8 | pptx rows carry no ownership | Person = **Ortak**, reassigned later as the owner recalls. |
| 9 | Lifetime ≈ 1,200 g (through 18 Jul 2026) vs current holdings 30 g — the car | Author the gap as dated **Elden Çıkarma** transaction(s) so holdings derive to 30 g. This is the event the two source documents hid between them. |

### 18.4 Verification fixtures (the typed data must reproduce these)

After the typing sessions, JADEITE's own computed figures must match the inspected state of the retired sources:

- **Section 2:** grand total debt **₺48,271.63**; total remaining limit **₺1,240,596.08**.
- **Section 3:** holdings **30 g**; cost basis **₺188,000**; market value **₺195,150** at the recorded manual price ₺6,505/g; unrealised **+₺7,150**; per person Kişi A **₺130,100**, Kişi B **₺65,050**.
- **Altın Eğrisi:** 40+ acquisition events; corrected lifetime quantity **1,200 g** through 18 Jul 2026; price series ₺1,000/g (4 Aug 2022) → ₺6,505/g (18 May 2026) on a true date axis.

A mismatch means either a typo or an engine defect — both worth finding. Resolve before the sources are retired.

### 18.5 Order of entry (suggested, after v1.1)

1. **Section 3** — persons, then 3c current prices, then the 3a ledger oldest → newest, cross-checking each event against the Frekans chart of the deck. Holdings and Altın Eğrisi derive themselves.
2. **Section 2** — the current tracking year only: banks, credit limits, month cells, counter columns. Verify against §18.4.
3. **Section 1** — year-workspaces oldest → newest (Sep 2022 onward), letting column inheritance carry each year's set forward.

Roughly 47 month-rows, ~38 gold events, and one debt year. Not a build task, not a Realisation, no tag.

---

## 19. Decision Register (compact)

| Topic | Ruling |
|---|---|
| Framework | Electron + React (three-way comparison recorded; RAM cost accepted; cold start is the real metric) |
| Platform order | Linux to full completion → finalise → Windows port |
| Machine strategy | Main rig primary; transfer via encrypted `.jbk` + import function; no sync |
| Language | Turkish primary, English optional, **manual switch only, never OS locale** |
| Credentials | Master password; **every successful password reset consumes the recovery key and issues a fresh one**; exactly one valid at any time; both lost = unrecoverable |
| Backup | Encrypted `.jbk` only; prompt after credential changes; truth table in §4.4 |
| Sign convention | Amounts positive; category/direction carries sign; refunds explicit |
| Section 1 | Year-workspaces (Niri-style), per-year column sets with inheritance |
| Section 2 | Forward-looking tracker; **one standing grid of twelve months and no year at all** — the year selector, the rollover and the read-only archive are struck, and with them any way to see a previous year's debts. The owner does not log them (§7.3, amended twice) |
| Section 2 totals | `TOTAL DEBT = Σ banks − Σ counters`; **`TOTAL REMAINING LIMIT` is the total of the Remaining Limit row** — counter columns have no limit and no cell in it |
| Section 3 scope | Gold set + USD + EUR + silver — **closed list of ten**; **six** gold coins, Tam and Ata being different products; **ziynet struck** as the family's name rather than a member of it, and with it the only home for weighable 22-ayar gold (§8.2, amended twice) |
| Egress enforcement | **Two** allowlisted hosts. Session-level for the renderer and for Chromium-stack main traffic; a single in-process chokepoint for Node-stack traffic, which `webRequest` cannot see. The navigation predicate is **not** the request predicate — widening one must never widen the other (§3.3, amended) |
| Price ceiling | `MAX_UNIT_PRICE` is ₺500.000 per unit. The former ₺100.000 was reasoned about per gram and silently refused a beşli price, which is quoted per piece at about ₺207.000 — a defect that shipped in Realisation V and was found by pointing a provider at the closed list |
| Section 4 | **A grid of bare value boxes**, ten to a row, growing by rows. The `label : value` line of Realisation VI is struck: an etiket per figure is a tax on the one thing the section is for, and a figure that needs naming belongs in Section 1 (§9, amended) |
| Date format | **`GG/AA/YYYY` in both languages** — the app's own convention, not ICU's Turkish default and not the machine's. Storage stays ISO-8601 (§13, §5.2) |
| Weighable quantities | **Denomination × count, stored; total derived** — `2 × 5 g` is two physical chunks and not the same record as `1 × 10 g` (§8.3, amended) |
| Coin pricing | **ESKİ quotes** — owner's ruling. The gap averages 0,5% and shows no annual step, so the owner's "struck this year" reading is recorded as theirs, not as measurement; mint-year storage is the deferred correction (§8.5, amended) |
| Live provider | Websocket for current prices, `ajax/cur/history` for history; **the returned date range must be validated** — a stale cache silently truncates it behind HTTP 200 (§14.1–14.2) |
| Gold price series | `KULCEALTIN` (GRAM ALTIN), established against 24 of the owner's own dated prices — not `ALTIN`/HAS, whose label and spread both mislead (§14.3) |
| Cost vs market | Both, plus explicit unrealised G/L per person and total |
| Single-use code | **Refused.** Every shipped feature must earn its place through repeated use **and be usable by someone who has never seen the owner's files** (§1) |
| Foreign-format import | **None, permanently** (§16.2). The only ingestible artefact is JADEITE's own `.jbk` |
| Migration | **Manual, by the owner**, after v1.1; no importer is built; checklist §18.3, fixtures §18.4 |
| Ladder end | **Realisation XI → v1.1** (Windows port). Typing carries no version |
| Year accents | Automatic from palette, elegance constraint, manual override |
| Overview | Yes — late realisation |
| Altın Eğrisi | Yes — as a derived view, never a data store |
| Palettes | The ten named palettes, canonical published values |
| Configuration | **Two files, split by sensitivity**: unencrypted `config.json` for palette and language (needed before unlock), encrypted vault for everything else. One home per value, never mirrored (§4.1) |
| Versioning | Two digits per Realisation; **lower-case letter suffix for point revisions** to an already-released Realisation (§17) |
| Naming | `XJADEITE.md`, `REALISATION.md`, Realisation I/II/III…, British *-isation* throughout, git tags Arabic version-only |

---

## 20. Open Items (owner-side, non-blocking)

- ~~**Q1:** true date of the ₺1,865 purchase (chart serial 45612).~~ **Closed 30 July 2026 — the date is 16 November 2023,** confirmed by the owner as real history.

  Two independent lines agree. The owner's outgoing-gold record carries a row dated **2023-11-16 at ₺1.865/g**, and the chart's serial `45612` decodes to 2024-11-16 — exactly **366 days** later, one leap year. **The year was typed wrong, not the month**, which is why the earlier reading of "fits Sep–Oct 2023" was close without being right. Independently, GRAM ALTIN quoted **1.850,41 / 1.873,93** on 2023-11-16 and ₺1.865 falls inside that band, so the price corroborates the date without reference to the owner's files at all.

  The row is therefore typed with its real date and **no provisional flag**. This also retires §18.3 item 6's assumption that the price was ground truth and the date merely approximate: both are now known exactly.
- **Q2:** what **merge** should mean for `.jbk` import (§15). Full replacement is specified and sufficient for the rig ↔ laptop workflow. Merge needs a conflict rule for the case both vaults have been edited since they parted — newest-timestamp-wins, per-section choice, or a review screen. To be settled before Realisation IX designs the container, not during it.

  **What the question gates, measured 31 July 2026 against schema v3.** Not the conflict rule — that can be designed whenever merge is built, and postponing it costs nothing. What cannot be postponed is whether the v1 `.jbk` **reserves** what any merge would need, because the container ships in Realisation IX and is then carried for the life of the app, and because a backup already written cannot acquire a field it was written without. Three facts, read out of `schema.ts` rather than assumed:

  - **No vault identity exists.** Neither the schema nor anything else in `src` carries a UUID or equivalent. Two `.jbk` files therefore cannot be shown to descend from the same vault — and merging two *unrelated* vaults is a different and considerably worse operation than merging two copies of one.
  - **No table carries a row-change timestamp.** `years.created_at`, `s3_prices_manual.updated_at` and `backup_log.created_at` each stamp an event, not a mutation. Newest-timestamp-wins is therefore unimplementable on today's schema, whichever way the owner rules.
  - **`s3_transactions.seq` is per-vault `AUTOINCREMENT`.** Two vaults independently number their rows 1, 2, 3, so the sequence cannot be the identity a merge matches on.

  The question to answer before the container is designed is therefore narrower than the conflict rule: **does the v1 `.jbk` header carry a vault UUID?** Row-change timestamps can arrive in a later schema version if merge is ever ruled in, and the header carries a format version, so that break is survivable. An identity written at first run is not survivable in the same way — it is missing from every backup taken before it exists, which is precisely the old backup a merge would one day be pointed at.

*End of specification. The build plan lives in `REALISATION.md`.*
