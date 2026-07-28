# REALISATION

**Project:** JADEITE · **Companion:** `XJADEITE.md` (the specification — authoritative for every rule referenced below)
**Ladder:** twelve Realisations, Roman-numbered. One version bump per Realisation: **Realisation I → v0.1 … Realisation XII → v1.2.**

## Global rules of the ladder

1. Every Realisation ends **built, tested, committed, pushed, and released privately** with a git tag containing only the version (`v0.3` — nothing else).
2. **Security exists from Realisation I.** No section is built before the vault.
3. **Definition of Done (applies to every Realisation):** builds and runs on CachyOS; zero console errors on the happy path; cold-start budget respected (XJADEITE §3.4) from Realisation II onward; all *previous* Realisations' acceptance checks still pass (regression rule); no AI attribution anywhere in commits/tags/artefacts; no new network egress beyond the allowlist.
4. A Realisation may be subdivided (I-a, I-b) if implementation reality demands smaller chunks; the version still bumps only when the whole Realisation's acceptance passes.
5. Order of III–VIII may be tuned during the build if a dependency argues for it; XI (Windows) and XII (Migration) are fixed last by the owner's ruling.

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
- Token system (CSS custom properties); all **ten palettes** implemented from canonical published values; Default Light/Dark authored; instant palette switching; palette persisted in vault.
- Year-accent derivation algorithm (accent sequence per palette, muted per the elegance constraint, manual override plumbing) — consumed later by III.
- i18next with **manual-only** language switching; Turkish primary and default; English complete for all shell strings; Turkish number/currency/date formatting engine (`1.234,56 ₺`), used by everything thereafter.
- Cold-start instrumentation; budget enforced from here on.

**Out:** any real data entry.

**Acceptance**
- [ ] All ten palettes render the shell with no hard-coded colour anywhere (audit script greps for hex literals in components).
- [ ] Language switches only by hand; OS locale demonstrably ignored (run under `LANG=en_US.UTF-8`, app stays Turkish).
- [ ] Launch → lock ≤ 1.5 s; unlock → shell ≤ 1 s on the main rig.
- [ ] Tag `v0.2`.

---

## Realisation III — Section 1: Income & Expenses · v0.3

**Goal:** the year-workspace grid — the heart of daily use.

**Scope**
- **Grid spike first:** TanStack Table proof against the real shape (16+ columns × 12 rows, editable, grouped headers, per-column sort/filter, custom cells). Go/no-go recorded; fallback path (AG Grid CE) exercised only if the spike fails the visual or editing bar.
- Year-workspaces: create year (inherits previous year's column set), switch with the deliberate workspace transition, per-year accent applied (from II).
- Column management: add/rename/reorder/retire per year; groups (Income | Expenses | TOTAL); column value types TRY/USD/EUR/plain.
- Entry editing: positive-amount convention, refund flag, notes; empty is empty.
- Computed income subtotal and net TOTAL per month row; year summary row.
- Per-column filter and sort (view-only reordering).

**Acceptance**
- [ ] Recreate the source workbook's July 2026 row shape (6 income + 10 expense columns) manually and match its arithmetic to the kuruş.
- [ ] A category retired in year N+1 leaves year N untouched.
- [ ] Refund renders distinctly and sums correctly.
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
- [ ] Reproduce the source's inspected state (6 banks, counter columns Sayaç A/Sayaç B/Sayaç C) and match: grand total debt **₺48,271.63**, total remaining limit **₺1,240,596.08** — with the engine, not formulas.
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

**Acceptance**
- [ ] Enter the three known 2026 purchases + a disposal; holdings, cost **₺188,000**, market **₺195,150** @ ₺6,505/g, unrealised **+₺7,150**, Kişi A **₺130,100** / Kişi B **₺65,050** all reproduced.
- [ ] Ledger numbering cannot duplicate; dates validate.
- [ ] Direction maths correct: disposals reduce holdings, never cost-basis history.
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

## Realisation VII — Live Prices · v0.7

**Goal:** haremaltin beside the owner's numbers — never over them.

**Scope**
- Provider interface + haremaltin implementation (site or derived endpoint); polite rate limiting; response validation.
- Manual refresh button (primary); optional auto-refresh interval setting; timestamped snapshots into `s3_prices_live`.
- Side-by-side rendering in 3c and holdings; drift indicator when live and manual diverge notably.
- Egress allowlist enforced at session level: provider host **only**; a test proves other hosts are blocked.
- Graceful offline/broken-provider behaviour: quiet, non-blocking, manual authority intact.

**Acceptance**
- [ ] Refresh populates live values with timestamps; airplane-mode run degrades silently.
- [ ] Egress test: any non-allowlisted request is blocked and logged in dev.
- [ ] Provider swap demonstrated with a mock second provider behind the same interface.
- [ ] Tag `v0.7`.

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
- [ ] Tag `v0.8`.

---

## Realisation IX — Backup, Transfer & Hardening · v0.9

**Goal:** the data can survive disks, moves, and audits.

**Scope**
- `.jbk` container: envelope header + database + checksums; create/restore ceremonies with credential verification; backup log.
- Post-credential-change backup prompt (mandated, XJADEITE §4.4); periodic reminder setting.
- **Import-database** (machine transfer): full replacement after explicit confirmation.
- In-app "Credentials & Backup Truth Table" page — the §4.4 contract, readable in thirty seconds by future-owner.
- Hardening pass: dependency audit, IPC surface review, fuzz the importers, WAL/crash-recovery torture, cold-start re-verify on both machines.

**Acceptance**
- [ ] Backup → wipe → restore = byte-equivalent data; old-credential backup opens per the truth table (live-vault path and dead-vault path both demonstrated).
- [ ] Restore with wrong credentials fails cleanly and informatively.
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

## Realisation XI — Windows Port · v1.1

**Goal:** parity on Windows, pixel-identical by construction.

**Scope**
- NSIS installer; `%APPDATA%\jadeite\` storage; native-module builds (SQLCipher, argon2) for Windows; code-path audit for path/locale assumptions.
- Full acceptance re-run on Windows; rendering parity spot-check against Linux screenshots.

**Acceptance**
- [ ] All prior acceptance lists pass on Windows 10/11.
- [ ] A vault created on Linux, moved as `.jbk`, opens on Windows (and back).
- [ ] Tag `v1.1`.

---

## Realisation XII — Migration · v1.2

**Goal:** the old life imported, corrected, and verified — last of all, per the owner's ruling.

**Scope**
- Import wizard: `JADEITorigin.xlsx` (Sections 1–3) + `Altın_Eğrisi.pptx` (deep gold history; Excel date-serial decoding built in).
- The **correction table of XJADEITE §18.2 applied**, every correction surfaced for one-click confirm: F-column recompute report; June-2025 elektrik sign; `'-'` → empty; phantom column dropped; **0.300→300 g, 0.400→400 g**; the serial-45612 row at ≈ Oct 2023 `date_provisional` (pending open item Q1); chart/ledger merge + dedupe; pptx persons → Ortak; the car authored as dated Elden Çıkarma so holdings land at 30 g.
- Post-import verification screen: the acceptance fixtures of XJADEITE §18.3, green/red.

**Acceptance**
- [ ] All §18.3 fixtures reproduced from imported data on both OSes.
- [ ] Every applied correction is listed, confirmable, and reversible before commit.
- [ ] The owner retires LibreOffice and PowerPoint for this job, permanently.
- [ ] Tag `v1.2`.

---

*Ladder ends. Anything after v1.2 — new palettes, new valuable types if the closed list is ever reopened, SAAT-family integrations — begins with a spec amendment to `XJADEITE.md`, then a new Realisation.*
