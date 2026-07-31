# REALISATION

**Project:** JADEITE · **Companion:** `XJADEITE.md` (the specification — authoritative for every rule referenced below)
**Ladder:** eleven Realisations, Roman-numbered. One version bump per Realisation: **Realisation I → v0.1 … Realisation XI → v1.1.**
**Amended 30 July 2026:** the former Realisation XII (migration importer, v1.2) is retired before construction. Migration is manual and carries no version — see *After the ladder* and XJADEITE §18. The rulings of 2026-07-29 (the configuration split, the explicit and reversible Section 2 freeze, point revisions) stand unchanged and are restated where this document referenced them.

## Global rules of the ladder

1. Every Realisation ends **built, tested, committed, pushed, and released privately** with a git tag containing only the version (`v0.3` — nothing else).
2. **Security exists from Realisation I.** No section is built before the vault.
3. **Definition of Done (applies to every Realisation):** builds and runs on CachyOS; zero console errors on the happy path; cold-start budget respected (XJADEITE §3.4) from Realisation II onward; all *previous* Realisations' acceptance checks still pass (regression rule); no AI attribution anywhere in commits/tags/artefacts; no new network egress beyond the allowlist.
4. A Realisation may be subdivided (I-a, I-b) if implementation reality demands smaller chunks; the version still bumps only when the whole Realisation's acceptance passes.
5. Order of III–VIII may be tuned during the build if a dependency argues for it; **XI (Windows) is fixed last** by the owner's ruling.
6. **No Realisation reads a foreign file format, and no Realisation requires the owner's real data.** Every acceptance check below is reproducible with figures typed by hand into the app. The owner's source workbook and deck are never opened by the build (XJADEITE §18.2).
7. **No single-use code ships.** If a feature would be run once and then carried forever, it is cut at design time rather than built (XJADEITE §1, §18.1).

---

## Realisation I — The Vault · v0.1

**Goal:** the encrypted foundation exists and is trustworthy before a single grid is drawn.

**Scope**
- Electron + React + TypeScript scaffold (Vite, electron-builder, lockfile-pinned), hardening posture per XJADEITE §3.3.
- Storage layer: SQLCipher database via `better-sqlite3-multiple-ciphers`; schema v1 (XJADEITE §5.3) with migrations framework.
- Key model in full: DEK generation, dual wrapping, `jadeite.keys` envelope file, Argon2id (256 MiB / t=3 / p=4).
- First-run ceremony: create master password → display recovery key #1 exactly once (print-friendly, copy-hostile).
- Lock screen; unlock; auto-lock on idle timeout (setting, default 10 min).
- Password reset ceremony: consume recovery key → set new password → issue next recovery key (XJADEITE §4.3, verbatim behaviour).
- Settings table inside the vault; GPL-3.0 licence file; private repo initialised.

**Out:** any section UI, palettes beyond a plain working theme, backup.

**Acceptance**
- [ ] Vault created; `strings jadeite.db` yields no legible user data.
- [ ] Wrong password fails cleanly; correct password unlocks.
- [ ] Reset ceremony: old recovery key opens once, is dead on second use; new key issued and works; old password dead.
- [ ] Kill-and-relaunch mid-session corrupts nothing (WAL discipline).
- [ ] Tag `v0.1` pushed, version-only.

---

## Realisation II — Shell, Themes, Language · v0.2

**Goal:** the app's face and voice — navigation, ten palettes, Turkish/English.

**Scope**
- App shell: section navigation (Sections 1–4 + Overview + Altın Eğrisi as destinations, stubs allowed), window chrome, keyboard map skeleton.
- Token system (CSS custom properties); all **ten palettes** implemented from canonical published values; Default Light/Dark authored; instant palette switching; palette persisted in the unencrypted `config.json` (XJADEITE §4.1, amended 2026-07-29 — it must be readable before the vault opens, or the lock screen cannot honour it).
- Year-accent derivation algorithm (accent sequence per palette, muted per the elegance constraint, manual override plumbing) — consumed later by III.
- i18next with **manual-only** language switching; Turkish primary and default; English complete for all shell strings; Turkish number/currency/date formatting engine (`1.234,56 ₺`), used by everything thereafter.
- Cold-start instrumentation; budget enforced from here on.

**Out:** any real data entry.

**Acceptance**
- [ ] All ten palettes render the shell with no hard-coded colour anywhere (audit script greps for hex literals in components).
- [ ] Language switches only by hand; OS locale demonstrably ignored (run under `LANG=en_US.UTF-8`, app stays Turkish).
- [ ] Launch → lock ≤ 1.5 s; unlock → shell ≤ 1 s on the main rig.
- [ ] The lock screen already wears the chosen palette and language, before any password is typed (§4.1 configuration split).
- [ ] Tag `v0.2`.

---

## Realisation III — Section 1: Income & Expenses · v0.3

**Goal:** the year-workspace grid — the heart of daily use.

**Scope**
- **Grid spike first:** TanStack Table proof against the real shape (16+ columns × 12 rows, editable, grouped headers, per-column sort/filter, custom cells). Go/no-go recorded; fallback path (AG Grid CE) exercised only if the spike fails the visual or editing bar.
- Year-workspaces: create year (inherits previous year's column set), switch with the deliberate workspace transition, per-year accent applied (from II).
- Column management: add/rename/reorder/retire per year; groups (Income | Expenses | TOTAL); column value types TRY/USD/EUR/plain.
- Entry editing: positive-amount convention, refund flag, notes; empty is empty.
- **Keyboard-first entry ergonomics (XJADEITE §6.4):** Tab/Enter traversal, type-and-go, single-value paste, undo of last edit, no modal on the common path. This is now a graded requirement, not a nicety — all historical data will be typed through this grid.
- Computed income subtotal and net TOTAL per month row; year summary row.
- Per-column filter and sort (view-only reordering).

**Acceptance**
- [ ] A 6-income + 10-expense month row can be entered and its arithmetic matches to the kuruş.
- [ ] A category retired in year N+1 leaves year N untouched.
- [ ] Refund renders distinctly and sums correctly.
- [ ] A full 12-month year can be entered **without touching the mouse**.
- [ ] Workspace switch is smooth on the 280 Hz main display and acceptable on the laptop.
- [ ] Tag `v0.3`.

---

## Realisation IV — Section 2: Payments / Installments · v0.4

**Goal:** the forward-looking year tracker, structurally incapable of the source's bugs.

**Scope**
- The exact grid of XJADEITE §7: 12 month lines; horizontal bank columns; top rows Bank Name / Credit Limit; per-month TOTAL DEBT; bottom rows DEBT / Remaining Limit / TOTAL REMAINING LIMIT; GRAND TOTAL DEBT at the intersection; counter columns (bank + person, reversed by engine).
- Instant recalculation on every edit; one bank definition drives every appearance (no duplicated lists anywhere).
- Elegant magnitude cues (restrained bars on TOTAL DEBT; palette-consistent state cues).
- Year rollover: freeze to read-only archive; new year carries banks, clears amounts; archive reachable by year selector.

**Acceptance**
- [ ] Typed by hand from the owner's known state (6 banks, counter columns Sayaç A/Sayaç B/Sayaç C), the engine reproduces grand total debt **₺48,271.63** and total remaining limit **₺1,240,596.08** — computed, not formula-copied.
- [ ] Adding a December value in *any* bank updates every dependent total (the F-column bug is impossible).
- [ ] Rollover archives are read-only and lossless.
- [ ] Tag `v0.4`.

---

## Realisation V — Section 3: Valuables · v0.5

**Goal:** ledger, holdings, prices — the Turkish-valuables core.

**Scope**
- Persons management (create/rename/colour; **Ortak** built-in).
- Closed type list seeded (XJADEITE §8.2); units per type (mg vs pieces).
- 3a ledger: auto-numbered, date (+provisional flag), type, **direction Alış / Elden Çıkarma**, quantity, unit price, computed totals, source, person, note; bottom totals.
- 3b holdings: derived per person × type, cross-checked against the ledger; discrepancy indicator if manual edits ever disagree with derivation.
- 3c manual current prices per type, with timestamp; the live-value slot rendered (empty until VII).
- Cost basis vs market value, unrealised G/L per person and grand (XJADEITE §8.6).
- Ledger entry ergonomics: a long historical run of purchases must be typeable in one sitting — date/type/quantity/price flow, sensible field defaults carried from the previous row, keyboard-only path.

**Acceptance**
- [ ] Enter the three known 2026 purchases + a disposal; holdings, cost **₺188,000**, market **₺195,150** @ ₺6,505/g, unrealised **+₺7,150**, Kişi A **₺130,100** / Kişi B **₺65,050** all reproduced.
- [ ] Ledger numbering cannot duplicate; dates validate; `date_provisional` can be set and cleared per row.
- [ ] Direction maths correct: disposals reduce holdings, never cost-basis history.
- [ ] Thirty consecutive ledger rows can be entered without the mouse and without a modal.
- [ ] Tag `v0.5`.

---

## Realisation VI — Section 4 + Altın Eğrisi · v0.6

**Goal:** the scratchpad, and the charts that end PowerPoint.

**Scope**
- Section 4: indefinite label:value lines; always-visible TOTAL / AVERAGE / MEDIAN; add/remove/reorder; instant recompute.
- Altın Eğrisi (ECharts): **Spektrum** price line on a true date axis; **Frekans** quantity columns; market-value-over-time; log-scale toggle, zoom, hover; per-type and per-person filters; palette-native styling.

**Acceptance**
- [ ] Median correct for odd and even counts; empty state sane.
- [ ] With test data containing a 300 alongside 10s: linear view crushes, **log toggle makes both readable** — the falsification incentive is dead.
- [ ] A deliberately mistyped date is visually obvious on the date axis.
- [ ] Charts update live as the Section 3 ledger changes; zero manual chart maintenance exists.
- [ ] Tag `v0.6`.

---

## Point revision v0.6c — the valuables model

**Goal:** settle what a valuables row *is* before live prices are pointed at it.

Not a ladder rung. It amends Sections 3 and Altın Eğrisi, both already released, so it takes a letter per §17 and Realisation VII still claims `v0.7`. Recorded plainly because it is the **first point revision to carry a schema migration**, and that must not become licence to smuggle rungs into letters: it qualifies only because it advances no section and adds no feature — it corrects the shape of data already being stored.

Three owner rulings of 30 July 2026 drive it (§8.2, §8.3, §8.5 as amended), all of which arrived from reading a sample of the owner's own outgoing-gold record and reconnoitring the real price source.

**Scope**
- **Schema v2** — the first migration since Realisation I. `s3_transactions` gains `denomination` and `piece_count`, and `quantity` becomes a **generated column** (`denomination × piece_count`), so §5.3's "derived values are computed, never stored" is enforced by SQLite rather than by discipline and every existing `SELECT` keeps working.
- The backfill is **unit-aware**: a coin migrates as `denomination = 1, piece_count = quantity` (thirty çeyrek are thirty pieces of one), a weighable as `denomination = quantity, piece_count = 1` (10 g with nothing recorded about how it was split is one chunk). Both are lossless and every row's derived quantity is unchanged, which is what preserves Realisation V's figures and Altın Eğrisi's series.
- **Ledger grid** — `Denomination` and `Count` columns, with `Quantity` derived beside them. Inert denomination for `piece`-unit types, one grid for both.
- **Ata as a sixth gold coin** (§8.2), distinct from Tam. Seeded into the closed list; no user-defined types still.
- **Holdings composition** — 3b may report *30 g as 2 × 10 g + 2 × 5 g*, not only a weight.
- **Altın Eğrisi** — Frekans continues to plot total quantity per date; the new fields must not change a single existing series point.

**Acceptance**
- [ ] A v1 vault opens, migrates to v2, and every Realisation V figure is unchanged afterwards — 30 g, ₺188.000, ₺195.150, +₺7.150, Kişi A ₺130.100 / Kişi B ₺65.050.
- [ ] `1 × 10 g` and `2 × 5 g` are distinguishable records that agree on total quantity, and holdings reports the chunk count for each.
- [ ] Ata and Tam coexist as separate types with separate prices.
- [ ] Altın Eğrisi's three series are point-for-point identical to v0.6b for the same ledger.
- [ ] Cost basis still consumes lots oldest-first **by weight** — a 7 g disposal against a 10 g bar behaves as before.
- [ ] `package.json` reads `0.6.2` (§17).
- [ ] Tag `v0.6c`, and `gh release create`.

---

## Realisation VII — Live Prices · v0.7

**Goal:** haremaltin beside the owner's numbers — never over them.

The source's real shape is now known rather than assumed — §14.1 records it, §14.2 the two silent failures, §14.3 the type mapping. Build against those, not against a search result.

**Scope**
- Provider interface + haremaltin implementation: **websocket snapshot** (connect → first `price_changed` frame → disconnect) for current prices; `ajax/cur/history` for series. Polite rate limiting; response validation.
- Manual refresh button (primary); optional auto-refresh interval setting; timestamped snapshots into `s3_prices_live`.
- **Coins fetched at their ESKİ codes** (§8.5); Gram from `KULCEALTIN`; **satış** is the displayed figure.
- Side-by-side rendering in 3c and holdings; drift indicator when live and manual diverge notably.
- Egress allowlist: the **two** provider hosts of §14.1 and nothing else — the socket lives on a
  different machine from the history endpoint. Enforced at session level for the renderer and for
  Chromium-stack main traffic, and by an in-process chokepoint for the socket, which rides Node's
  stack where `webRequest` cannot see it (§3.3, amended). The predicate that widens must be the
  **request** predicate and not the **navigation** one. A test proves each path separately.
- Graceful offline/broken-provider behaviour: quiet, non-blocking, manual authority intact.

**Acceptance**
- [ ] Refresh populates live values with timestamps; airplane-mode run degrades silently.
- [ ] Egress test: any non-allowlisted request is blocked and logged in dev.
- [ ] Provider swap demonstrated with a mock second provider behind the same interface.
- [ ] **A response whose returned date range falls short of the range requested is rejected as a failed fetch**, not stored (§14.2 item 1). Proven with a recorded stale response.
- [ ] **A response with no `data` key is handled as absent data, not as zero** (§14.2 item 2).
- [ ] **A type the provider's response omits shows no live value and does not read as ₺0.** This
      box named Ziynet until §8.2's amendment struck the type; its subject is gone and its
      guarantee is not, so it is re-pointed rather than retired.
- [ ] `package.json` reads `0.7.0` (§17).
- [ ] Tag `v0.7`, and `gh release create`.

---

## Realisation VIII — Overview · v0.8

**Goal:** the zoomed-out dashboard — the showpiece.

**Scope**
- Year cards (net result per year, accent-tinted); grand tiles: current debt, remaining limit, valuables market value, unrealised G/L.
- Trend charts: net-by-month across years; year-over-year comparison; valuables value line.
- Read-only; every figure derived; deep-links into the owning section.

**Acceptance**
- [ ] Every Overview number equals its section source (automated cross-check).
- [ ] Renders beautifully in all ten palettes, both densities (1440p rig, 1080p laptop).
- [ ] `package.json` reads `0.8.0` (§17).
- [ ] Tag `v0.8`, and `gh release create`.

---

## Point revision v0.8b — the four reconfigurations

**Goal:** answer what the owner found the first time they used the application, rather than the second.

Not a ladder rung. It amends Realisations II, IV, V and VI — all released — so it takes a letter per §17, and Realisation IX still claims `v0.9`. It arrived the way the best corrections do: the owner ran the built app end to end, offline, and it neither crashed nor raised an error screen. What they filed instead were four things the specification had got wrong about their life.

**It advances no section and adds no feature, which is what qualifies it.** Two of the four *remove* a capability, and neither removal is a shortcut: Section 2 loses a year it was never going to fill, and Section 4 loses a label that was taxing the only activity it exists for. The third changes a format and not a fact — dates are still stored ISO-8601 (§5.2) — and the fourth is chrome. The acceptance figures of Realisations IV through VIII are unchanged, and the regression rule is what proves it.

The precedent this must not become is the one v0.6c named: a letter is not a place to smuggle a rung. What makes these four honest is that after them the application does less than it did, in three of the four cases, and looks like itself in the fourth.

**Scope**
- **Section 2 has no year** (§7.1, §7.3 as amended). The year selector, the year rollover and the frozen read-only archive are gone, and so is the `year` column on `s2_banks` and `s2_cells`. Ödemeler is one standing grid of the twelve months the owner is living in — *"i am not logging previous years bank debts."* Section 1 keeps its year-workspaces untouched; creating a year there no longer touches Ödemeler at all. The Overview's two debt tiles stop choosing a year to speak for.
- **Schema v4** — the second migration to touch the owner's real shape, and the first to delete any of it. Section 2's tables are rebuilt without the year and **only the most recent grid survives**; `s4_lines(label, value, position)` becomes `s4_cells(slot, value)`. Both halves run in one transaction whose statement order is the whole of its safety, because `foreign_keys` is ON and cannot be lifted inside a transaction. `years.s2_archived` is left in place as a dead column rather than dropped: its column-level `CHECK` makes `DROP COLUMN` refuse, and rebuilding `years` risks exactly the lockout v3's comment documents.
- **Section 4 is a grid of value boxes** (§9, amended). No labels. Ten boxes to a row, ten rows to begin with, a fresh row of ten whenever the last row is first used — because the owner's month holds a hundred and twenty figures, not a hundred. TOTAL, AVERAGE and MEDIAN are unchanged and still recompute per box.
- **Dates read `GG/AA/YYYY`** (§13, amended), in both languages, everywhere the app prints one — the ledger, the price stamps, the chart axes and the settings sample. The Section 3 date box accepts the same shape, and tolerates `.` and `-` and single digits. Storage stays ISO-8601; the main-process validators are untouched, which is the proof.
- **A jade glyph and an app icon.** The mark stands beside the JADEITE wordmark in the rail and on the four ceremony screens, palette-tinted so it is native in all ten themes and hard-codes no colour (§12.2). The application also gains the OS window and taskbar icon it has never had.

**Acceptance**
- [ ] A v3 vault opens, migrates to v4, and the newest Payments grid survives intact — banks, counter columns, credit limits and every amount. Earlier years are gone, deliberately.
- [ ] A v3 vault whose Section 4 held labelled lines keeps every figure, in order, in slots 0…n−1.
- [ ] A v3 vault with no banks, one with no Section 4 rows, and one where a bank name repeats across years all migrate without raising; a migrated vault opens twice.
- [ ] Ödemeler shows twelve months and no year control anywhere, and its totals still reconcile down the months and across the columns.
- [ ] Adding and deleting a year in Section 1 leaves Ödemeler exactly as it was.
- [ ] The Overview's debt and remaining-limit tiles equal Ödemeler's own figures and deep-link to it.
- [ ] A hundred and twenty figures go into Hesap Alanı from the keyboard alone, the grid growing as they land, with TOTAL / ORTALAMA / ORTANCA correct at the end.
- [ ] `15/03/2026` is accepted, `31/02/2026` is refused at the cell, and every date on screen reads `GG/AA/YYYY` in both languages.
- [ ] The glyph renders in all ten palettes and on the lock screen; the window and taskbar carry the app icon.
- [ ] All previous Realisations' acceptance checks still pass, and a run with no network is still silent.
- [ ] `package.json` reads `0.8.1` (§17).
- [ ] Tag `v0.8b`, and `gh release create`.

---

## Realisation IX — Backup, Transfer & Hardening · v0.9

**Goal:** the data can survive disks, moves, and audits.

**Scope**
- `.jbk` container: envelope header + database + checksums; create/restore ceremonies with credential verification; backup log.
- Post-credential-change backup prompt (mandated, XJADEITE §4.4); periodic reminder setting.
- **Import-database** (machine transfer): full replacement after explicit confirmation. This is JADEITE reading its own sealed container and is **the only import in the application** (XJADEITE §15, §16.2) — no foreign format is parsed here or anywhere.
- In-app "Credentials & Backup Truth Table" page — the §4.4 contract, readable in thirty seconds by future-owner.
- Hardening pass: dependency audit, IPC surface review, **fuzz the `.jbk` container parser** (malformed header, truncated body, bad checksum, wrong format version — the only untrusted input the app has), WAL/crash-recovery torture, cold-start re-verify on both machines.

**Acceptance**
- [ ] Backup → wipe → restore = byte-equivalent data; old-credential backup opens per the truth table (live-vault path and dead-vault path both demonstrated).
- [ ] Restore with wrong credentials fails cleanly and informatively.
- [ ] A corrupted or hand-edited `.jbk` is rejected without a crash and without partial application.
- [ ] Truth-table page ships in Turkish and English.
- [ ] Tag `v0.9`.

---

## Realisation X — Linux Finalisation · v1.0

**Goal:** "the app became realized" — on Linux.

**Scope**
- Full-pass QA of every acceptance list above on CachyOS (main rig) **and** Arch/GNOME (laptop).
- Packaging: electron-builder **pacman** package (primary, installer-grade) + deb; install/uninstall/upgrade-in-place verified; desktop entry, icon set.
- Performance polish to budgets; final visual sweep across all ten palettes; string freeze TR/EN.
- Documentation inside the app: first-run tour (skippable), the truth table, licence notice.

**Acceptance**
- [ ] Fresh-machine install from the pacman package to working vault in under two minutes.
- [ ] Zero known defects against XJADEITE; deviations either fixed or spec-amended consciously.
- [ ] Tag `v1.0`.

---

## Realisation XI — Windows Port · v1.1 *(final rung)*

**Goal:** parity on Windows, pixel-identical by construction — and the ladder's end.

**Scope**
- NSIS installer; `%APPDATA%\jadeite\` storage; native-module builds (SQLCipher, argon2) for Windows; code-path audit for path/locale assumptions.
- Full acceptance re-run on Windows; rendering parity spot-check against Linux screenshots.

**Acceptance**
- [ ] All prior acceptance lists pass on Windows 10/11.
- [ ] A vault created on Linux, moved as `.jbk`, opens on Windows (and back).
- [ ] Tag `v1.1`. **The application is complete.**

---

## After the ladder — Migration Day *(no version, no code, no tag)*

The old life enters by hand, per XJADEITE §18. This is an owner activity, not a Realisation: nothing is built, nothing is released, nothing is versioned.

- Checklist of the nine forensic corrections: **XJADEITE §18.3** — kept beside the keyboard.
- Verification fixtures the typed data must reproduce: **XJADEITE §18.4**.
- Suggested order (Section 3 → Section 2 → Section 1): **XJADEITE §18.5**.
- `JADEITorigin.xlsx` and `Altın_Eğrisi.pptx` stay on the archive HDD, outside the repo and outside every session, until the fixtures pass (§18.2).
- Any friction met while typing is filed as a defect against the owning section — the sessions are the app's real ergonomics test.
- When the fixtures go green: **LibreOffice and PowerPoint are retired for this job, permanently.**

---

*Ladder ends at v1.1. Anything after — new palettes, new valuable types if the closed list is ever reopened, SAAT-family integrations — begins with a spec amendment to `XJADEITE.md`, then a new Realisation numbered XII.*
