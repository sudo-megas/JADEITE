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
- [ ] Language switches only by hand; OS locale demonstrably ignored (run under `LANG=en_US.UTF-8`, app stays Turkish). *(Machine-checked: `tests/e2e/shell.spec.ts` launches under a foreign `LANG` and asserts the app stays Turkish; `scripts/audit-locale.mjs` bans the reads statically.)*
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
- [ ] Workspace switch is smooth on the 280 Hz main display and acceptable on the laptop. **Owner-observed**, on both machines — `frame-stats.ts` derives the budget from the display's own median interval and the suite asserts only that the switch does not jank outright, which is the most a headless runner can honestly claim.
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
- [ ] ~~Rollover archives are read-only and lossless.~~ **Struck at v0.9d.** Point revision v0.8b deleted the year, the rollover and the frozen archive from Section 2 (§7.3 as amended), so this box tests a capability the application no longer has. It is not a check that fails; it is a check with no subject, and it was the one box that made Realisation X's "every list above still passes" literally unsatisfiable.
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
- [ ] Renders beautifully in all ten palettes, both densities (1440p rig, 1080p laptop). **Owner-observed** — "beautifully" has no mechanical criterion and is not given a false one.
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
- [ ] ~~The glyph renders in all ten palettes and on the lock screen;~~ the window and taskbar carry the app icon. **First clause struck at v0.9d**: the palette-tinted glyph it names was retired at v0.9b and the mark is fixed artwork now (§12.2 as amended). The second clause is untouched and still holds. Superseded by v0.9c's own box, which asserts the mark renders in all ten palettes without claiming it changes colour in them.
- [ ] All previous Realisations' acceptance checks still pass, and a run with no network is still silent.
- [ ] `package.json` reads `0.8.1` (§17).
- [ ] Tag `v0.8b`, and `gh release create`.

---

## Realisation IX — Backup, Transfer & Hardening · v0.9

**Goal:** the data can survive disks, moves, and audits.

**Settled first, per §20.** Q2 — what *merge* means for `.jbk` import — was closed by the owner on 31 July 2026 as **per-section choice**, before the container was designed rather than during it. Merge is not built here; §15 puts only full replacement in this rung. What the ruling bought is the container's shape, and that is the whole reason it had to come first: a `.jbk` written this year must still be answerable when the chooser arrives, and a format cannot grow a field retroactively.

**Scope**
- `.jbk` container: envelope header + database + checksums; create/restore ceremonies with credential verification; backup log.
- **Schema v5** — no new table. `backup_log` has waited since v1 and is finally written to. A `vault_id` names the lineage so a restore can tell this vault's backup from another machine's *before* it touches anything, and per-section edit stamps are kept by triggers rather than by forty write paths (§5.3, §15).
- Post-credential-change backup prompt (mandated, XJADEITE §4.4); periodic reminder setting.
- **Import-database** (machine transfer): full replacement after explicit confirmation. This is JADEITE reading its own sealed container and is **the only import in the application** (XJADEITE §15, §16.2) — no foreign format is parsed here or anywhere.
- **The restore door sits outside the lock** — on the lock screen and on first-run. §4.4's second row is a dead disk, and a restore reachable only from a vault you can open is a restore for the one situation that never needed it.
- In-app "Credentials & Backup Truth Table" page — the §4.4 contract, readable in thirty seconds by future-owner.
- Hardening pass: dependency audit, IPC surface review, **fuzz the `.jbk` container parser** (malformed header, truncated body, bad checksum, wrong format version — the only untrusted input the app has), WAL/crash-recovery torture, cold-start re-verify on both machines.

**Acceptance**
- [ ] Backup → wipe → restore = equivalent data; old-credential backup opens per the truth table (live-vault path and dead-vault path both demonstrated).
- [ ] §4.4 row 1 proved against a backup taken *before* a password reset: no credential asked for, and the vault still opens with the **new** password afterwards.
- [ ] §4.4 row 2 proved with the password **and** with the recovery key, and the recovery key still works for a reset afterwards — restoring does not consume it.
- [ ] Restore with wrong credentials fails cleanly and informatively, and leaves the vault on disk untouched.
- [ ] A corrupted or hand-edited `.jbk` is rejected without a crash and without partial application.
- [ ] A container claiming a newer schema than this build knows is refused rather than silently misread.
- [ ] An install interrupted between its two renames is completed at the next start.
- [ ] Truth-table page ships in Turkish and English.
- [ ] No filesystem path crosses the bridge — the enumerated preload surface proves it, and a config write made to fail for real proves the failure path too.
- [ ] The renderer can write the three settings it owns and none of the others; the vault's lineage and its section stamps are refused.
- [ ] Three concurrent unlock attempts are each answered on their own credential.
- [ ] `package.json` reads `0.9.0` (§17).
- [ ] Tag `v0.9`, and `gh release create`.

---

## Point revision v0.8c — two grid rules that had never applied

*Recorded retrospectively at v0.9d.* It was tagged and released on 31 July 2026 with no entry here, and three tags — `v0.2b`, `v0.6b`, `v0.8c` — reached `origin` the same way. The other two are covered by tests that arrived with them; this one is not, and a released change with neither a checklist nor a test is outside the reach of the sentence Realisation X opens with. Written down now so that it is not.

**Goal:** make two CSS rules do what they had always said they did.

`.s2-cell-input` and `.s3-cell-input` declared 13px type and tight padding, and none of it had ever reached the screen: the global `input[type='text']` rule near the top of `app.css` is an attribute selector and outranks a plain class, so both lost every declaration to a rule written for a standalone form field. Found while fixing the Section 4 box in v0.8b, which needed `input.s4-box` for the same reason.

**Acceptance**
- [ ] The Section 2 and Section 3 cells compute to the 13px type and the padding their authors wrote, measured rather than eyeballed.
- [ ] Both grids read as grids — a table's own borders delimit its cells, rather than every cell drawing a second border inside the first.
- [ ] The Payments grid shows its three bottom-bar rows without scrolling, and the ledger fits one more column at the same width.
- [ ] `package.json` reads `0.8.2` (§17).
- [ ] Tag `v0.8c`, and `gh release create`.

---

## Point revision v0.9b — the mark, and the page that names it

**Goal:** the application wears the artwork it was drawn for, and can say what it is.

Not a ladder rung. It amends Realisation II, which built the shell, and the v0.8b revision that drew the mark — both released — so it takes a letter per §17, and Realisation X still claims `v1.0`.

**It advances no section and touches no figure, which is what qualifies it.** Nothing here reads or writes the vault, no channel crosses the bridge, and the schema does not move. The whole of it is chrome: an image where a drawing was, and a page in the rail's foot that reads out four facts a build already knows about itself. The brief is `docs/conficon.md`, filed by the owner between Realisations IX and X, and it comes into the repository with the work that answers it.

The one thing that would make this a rung rather than a letter is the Hakkında page, and it is not one for a reason worth writing down: Realisation X already scopes *"Documentation inside the app: … licence notice"*, so the page is that item arriving early rather than a new one appearing. What X keeps is the first-run tour and the truth-table placement. *(The tour was struck at v0.9d; the placement is still X's.)*

**Scope**
- **The mark is artwork, not a token** (§12.2, amended). `JadeGlyph` and `build/icon.svg` are retired. `build/innerAPP.png` stands beside the wordmark in the rail and on all six ceremony screens at 22px, and `build/outerAPP.png` becomes the icon electron-builder derives the pacman and deb sets from — so the launcher, the waybar, the desktop entry and the window all carry the tile. Both masters carry a real alpha channel; every square asset is trimmed and *padded* from them, never cropped or stretched.
- **Hakkında** (§17.1, new). Third in the rail's foot, after Yedekleme and Ayarlar and above Kilitle, on `Ctrl+H` — a letter and the Turkish initial, by the rule `destinations.ts` already states. It shows the tile, the maker, the version, the release date, the two addresses, the licence and the motto.
- **The version, the release date and the licence are compiled in**, by `electron.vite.config.ts`, from `package.json` and the repository's own `LICENSE`. The preload surface does not grow, and `hardening.spec.ts` passes unedited — which is the proof.
- **The two addresses are text.** §3.3 is untouched: nothing in this application opens an external link, and the page says so rather than offering a control that would be refused.
- **One defect found by looking.** On the lock screen, *Parolamı unuttum* and *Yedekten geri yükle* rendered as one run-together phrase — two inline-block links with the JSX whitespace between them dropped. Shipped in v0.9; fixed here.

**Acceptance**
- [ ] The mark renders in all ten palettes, in the rail and on the lock screen, with no grey fringe on light themes or dark ones.
- [ ] Hakkında opens from the rail and on `Ctrl+H`, and states a version matching `package.json`.
- [ ] The release date reads `GG/AA/YYYY` in both languages (§13).
- [ ] The full GPL-3.0 text opens in place and returns; it is the repository's `LICENSE` and not a summary.
- [ ] The page carries no anchor: the addresses are selectable text.
- [ ] The page ships in Turkish and English, and `locale-parity` passes.
- [ ] The installed package's launcher icon is the tile.
- [ ] Both lock-screen links read as two links.
- [ ] All previous Realisations' acceptance checks still pass, and the §3.4 cold-start budget is still met with the licence text in the bundle.
- [ ] `package.json` reads `0.9.1` (§17).
- [ ] Tag `v0.9b`, and `gh release create`.

---

## Point revision v0.9c — the mark at the size it was drawn for

**Goal:** answer what the owner found when they looked at v0.9b on their own screen.

Not a rung. It amends v0.9b, released the same day, so it takes the next letter per §17 and Realisation X still claims `v1.0`. No schema, no channel, no figure — and the one thing it adds to a section is a sentence naming something the vault already recorded.

**It is a letter because everything in it was already built and is merely wrong.** The mark shipped at 22px and read as an afterthought. The motto shipped with its two nouns the wrong way round. Section 3 has been able to name its price source since Realisation VII and simply never printed it. Nothing here is a capability the application did not have yesterday.

**The mark is three times larger, and the rail head stacks to allow it.** Four times was asked for first and does not exist: the rail is a fixed 232px track and the brand block has 187px inside it, against the 382–486px an 88px mark and a matching wordmark need. Nor would it have failed loudly — there is no `flex-wrap` there, the mark is `flex: none`, and JADEITE is one unbreakable word, so it would have painted across the content pane with no scrollbar to admit it. Stacking buys the height back; the wordmark is capped at 28px because 187px is the ceiling for seven tracked letters whatever the layout. The ceremony panels keep `docs/conficon.md`'s side-by-side row, because 394px is room for it.

**Scope**
- **The mark at 66px**, in the rail and on all six ceremony screens, passed explicitly at every call site. `mark.png` re-exported at 256px, since 128 is sharp only to 64 CSS px on a 2× display and the recovery sheet is printable. `--brand-gap` splits in two: the placements stopped being the same problem.
- **The rail head stacks**; the ceremony wordmark goes to 39px beside its mark. The ceremony brand's bottom margin drops 24px → 10px, which is not tidying: the recovery-key screen had ~14px above the fold at the 640px minimum window, and it is the one screen the owner cannot return to. Measured after: 550px needed against ~605px available.
- **The application calls itself *Ekonomi Defteri* / *Economy Journal*** on the About page. The outward strings — the launcher tooltip, the package listing, the specification's `Project:` line — are deliberately left for Realisation X, which is when the public reads them.
- **The motto reads *Built with Reason and Passion***.
- **Section 3 says which source answered.** 3c printed the attempt time, the last good time and any error, and never the provider — so an unpackaged build, which uses the mock by design, refreshed to ten invented figures under a fresh timestamp with nothing anywhere to say so. It cost the owner a false defect report. The value was on every fetch record already.
- **A refused refresh says it was refused.** The limiter backs off to a thirty-minute ceiling and returned `skipped` before recording the attempt, so for half an hour the button was indistinguishable from a dead one. `retryAfterSeconds` was computed all along and read by nothing.
- **The snapshot deadline was too thin to survive a slow resolver**, and that is why the owner's first look at the real provider returned nothing at all. Measured rather than guessed: the socket reaches its first price frame **298ms** after construction once the name is resolved, and the frame that arrives is complete and correct — every instrument, the shape §14.1 recorded, no fault anywhere in the parser, the mapping or the units. But `getaddrinfo` is inside that window, and on the machine this was found on it returned a flat **5.2 seconds for every host in the world** while the router itself answered in 26ms. Six seconds left eight hundred milliseconds for the connection. The frame deadline goes to 15s and the service abort to 30s — and they move together, because an 8s abort over a 6s per-attempt deadline meant the retry at the other engine.io version could never run.
- **Six things a review found that no test would have.** The locale floor sat at exactly the pre-v0.9b count, so the whole About namespace could have been deleted from both catalogues and every parity check would have passed. The version was asserted by shape and never against the manifest, so a stale `out/` shipped green. The licence *identifier* on screen was bound to nothing, so a relicence would keep printing `GPL-3.0-only`. The no-anchor check was scoped to the About view and missed the licence view entirely. `Date.parse` on an ISO date is UTC while `Date.now()` is absolute, which fails for three hours every morning at UTC+3. And the motto's "same in both catalogues" claim was only ever asserted in English.
- **`FOOT_DESTINATION_IDS` is removed.** Exported at Realisation IX, extended at v0.9b, read by nothing, and its comment claimed to govern an order that lives in the markup.
- **A guard for the thing that could not be seen.** Nothing in the suite measured the rail: the only overflow assertion is scoped to `.content`, the rail's *sibling*, so a brand block spilling on top of it changes no number the suite reads. `.rail-brand`'s `scrollWidth` now has to fit its `clientWidth`.

**Acceptance**
- [ ] The rail head fits the rail, asserted rather than eyeballed, and the six destinations are still reachable at the minimum window size.
- [ ] The recovery-key ceremony still shows its acknowledgement and its button above the fold at 640px.
- [ ] The mark is 66px in the rail and on all six ceremony screens, and sharp on a 2× display.
- [ ] Hakkında reads *Ekonomi Defteri* in Turkish and *Economy Journal* in English, and the motto reads *Built with Reason and Passion* in both.
- [ ] 3c names its provider, and a refused refresh says when it will ask again.
- [ ] A snapshot survives a five-second name resolution, and the two protocol attempts both fit inside the abort.
- [ ] Deleting the `about` namespace from both catalogues fails `locale-parity`; a stale build fails `about.spec.ts`.
- [ ] All previous Realisations' acceptance checks still pass, and §3.4's cold start is still met.
- [ ] `package.json` reads `0.9.2` (§17).
- [ ] Tag `v0.9c`, and `gh release create`.

---

## Point revision v0.9d — what the outside world reads, and a ladder that can be finished

**Goal:** stop the application contradicting itself, and give Realisation X an acceptance list that covers Realisation X.

Not a rung. It amends v0.9c and, in the ladder, Realisations II through IX — all released — so it takes the next letter per §17, and X still claims `v1.0`. It builds no feature.

**Two of its three parts were scheduled for X and are done here instead, for the same reason in both cases: they are defects, not tasks.** v0.9c taught the application to call itself *Ekonomi Defteri* on the About page while every launcher on the machine went on saying something else — that is a contradiction the moment it ships, not a scheduled improvement. And a hicolor set with one entry is not a decision anyone made; it is what happens when a single PNG is handed to a packager. What X keeps is confirming both on an installed system, which is the part only an installed system can answer.

**Scope**
- **The outward strings follow the on-screen name.** `package.json`'s `description` becomes the launcher's `Comment=`; `electron-builder.yml`'s `synopsis` becomes the whole of what an Arch user sees. They are deliberately *different* sentences, because the freedesktop specification asks that a `Comment` not restate `Name` or `GenericName` — JADEITE is the Mozilla to Economy Journal's Web Browser — and because fpm concatenates the two and each surface takes a different part. The name pair moves to `GenericName`, in both languages, which is the key a launcher shows and indexes. `Comment[tr]` gives a Turkish tooltip: it survives the `desktop.entry` merge where a bare `Comment` does not, because `LinuxTargetHelper` overwrites exactly one key and a locale suffix makes a different one.
- **A measurement that corrected the ladder.** X recorded that "the deb prints the same sentence twice". Measured against the built artefact, it is worse and elsewhere: `pacman.erb` writes `pkgdesc` on one line, so fpm's second line becomes an orphan with no `=` and pacman drops it silently. `pacman -Qip` on the shipped v0.9.2 package printed `synopsis` alone. On the primary target, `package.json`'s `description` had never been read by anything but the desktop entry.
- **Nine icon sizes instead of one.** `build/icons/` holds 16 through 512, each cut from `build/outerAPP.png` rather than from the 512. `linux.icon` points at the directory, because `computeDesktopIcons` reads `[linux.icon, config.icon]` and the top-level key was never what decided hicolor's contents. The gain is *not* resampling quality — that was measured and the difference is invisible — it is that a launcher asking for 32px gets 32px instead of rescaling 512 on its own terms.
- **The ladder can be finished now.** X's regression line was unsatisfiable: one box tested a feature v0.8b deleted, and twenty are one-time release gates that record a version rather than check a behaviour. *(Twenty-four, recounted at X — this entry added four gates of its own and then described the document as it stood before that. Two boxes carry the owner-observed marker, not three.)* The impossible box is struck, the stale half of another is struck, ~~three~~ two subjective boxes are marked owner-observed rather than given false criteria, and X's acceptance list is rebuilt to cover X's own scope — it had five boxes against eight scope items, so uninstall, upgrade-in-place, the laptop's cold-start ceiling, the palette sweep and the icon set could each have been done without ever being declarable.
- **The first-run tour is struck**, at the owner's ruling: unspecified anywhere in `XJADEITE.md`, refused in shape by Global rule 7, and answered better by the repository's README, which Realisation XI owns.
- **v0.8c is recorded**, three weeks late. It shipped tagged and released with no entry and no test — a CSS-only revision that the sentence opening Realisation X could not reach.

**Acceptance**
- [ ] `pacman -Qip` on the built package prints one description, and it names *Economy Journal*.
- [ ] The generated `.desktop` carries `GenericName` and `GenericName[tr]`, a `Comment` that restates neither, and `Comment[tr]` in Turkish.
- [ ] The installed hicolor set holds all nine sizes, each byte-identical to `build/icons/`.
- [ ] No tracked file ~~says~~ **states as the application's description** *"Secure personal wealth and possessions tracker"*. *(Amended at X, and enforced there by `scripts/audit-strings.mjs`. As written the box could never pass: it quotes the sentence in order to forbid it, in a tracked file, so the only thing that would satisfy it literally is deleting the box. The audit exempts this document and `XJADEITE.md` for that reason — a ledger of retired sentences has to be able to name them — and scans everything else the repository ships.)*
- [ ] Realisation X's acceptance list has a box for every item in Realisation X's scope.
- [ ] All previous Realisations' *behavioural* acceptance checks still pass.
- [ ] `package.json` reads `0.9.3` (§17).
- [ ] Tag `v0.9d`, and `gh release create`.

---

## Realisation X — Linux Finalisation · v1.0

**Goal:** "the app became realized" — on Linux.

**Scope**
- Full-pass QA of every acceptance list above on CachyOS (main rig) **and** Arch/Niri (laptop). **The regression line means the *behavioural* boxes.** **Twenty-four** of the boxes above this rung are one-time release gates — `` `package.json` reads `0.7.0` ``, `` Tag `v0.8` `` — fifteen tags and nine version-reads, and **every one of the nine** is false the moment this rung bumps the manifest to `1.0.0`. A gate records that a version shipped; it is not a check that can be re-run. Read literally the line was unsatisfiable, which is worth stating rather than resolving by everyone quietly knowing. *(Recounted at X. v0.9d wrote twenty and six, which were the figures at v0.9c: it added four gates of its own — v0.8c's two and its own two — and then described the document as it had been before it edited it. The counts are mechanical, `grep -c '^- \[ \] Tag '` and its sibling, and they are given here so the next rung can check them rather than inherit them.)*
  **What the regression pass found, and what X did about it.** Of the 81 behavioural boxes above this rung, the largest uncovered cluster was the one X is *about*: every box concerning the packaged and installed artefact — the hicolor set (v0.9d), `GenericName` in two languages (v0.9d), `StartupWMClass` (v0.9b), `Categories` (v0.9b), the one-description-not-two finding (v0.9d), and the retired description string (v0.9d). Grepping `tests/` and `scripts/` for `hicolor|GenericName|StartupWMClass|pacman|synopsis|desktop` returned **nothing at all**. Every one was true, and every one was true by hand — which is the weakest position an assertion can be in, and `Categories` had already been silently lost once between the config and the shipped package. They are machine-checked now, on both sides of fpm: `scripts/audit-strings.mjs` gates the build on the source, and `tests/package/metadata.spec.ts` reads the built `.pacman` and `.deb`.

  **Four behavioural boxes on earlier rungs remain uncovered, and are recorded rather than closed** — v0.9d's own precedent, which recorded v0.8c's gap instead of filling it. Realisation III's "a full 12-month year entered without touching the mouse" has no test, though Sections 3 and 4 both have the equivalent; v0.8c's three grid-metric boxes still have none, as its retrospective entry says; v0.9c's socket deadline and abort budget are asserted nowhere; and v0.9c's "recovery-key ceremony above the fold at 640px" is unasserted because nothing in the suite ever sizes a window. One *was* closed, because it was not a gap but a test that overclaimed: `shell.spec.ts`'s "the rail head fits the rail, **at every size the mark has ever been**" asserted only that the head did not overflow, which a mark silently reverted to v0.9b's 22px satisfies perfectly. It now measures 66px, in the rail and on a ceremony screen. A test whose name promises what its body does not check is worse than no test, because it is counted.
- Packaging: electron-builder **pacman** package (primary, installer-grade) + deb; install/uninstall/upgrade-in-place verified; desktop entry, icon set.

  **The package could not be installed, and only `pacman -U` could say so.** electron-builder's hardcoded pacman defaults declare `http-parser` and `libappindicator-gtk3`, and **neither exists in the Arch repositories any more** — Chromium replaced the first with llhttp, the second was superseded by the Ayatana fork. pacman does not warn and does not degrade; it refuses the transaction: *"cannot resolve «http-parser» … could not satisfy dependencies"*. So the primary, installer-grade target was uninstallable on the primary platform, through every release from Realisation I to v0.9d. Nothing in the repository could have caught it: the package built, `pacman -Qip` printed the list without complaint, and the application ran perfectly from `release/linux-unpacked`. **The owner found it on the first `pacman -U`** — which is the whole argument for the install boxes being owner-observed rather than declared done from a green suite. The replacement is three names, measured rather than chosen: every ELF under `opt/JADEITE` walked with `ldd`, the bundled libraries subtracted, each remaining `.so` mapped to its owner with `pacman -Qo` — 94 libraries, 68 packages — and reduced to the three nothing else pulls in transitively: **`gtk3`, `nss`, `alsa-lib`**. What `ldd` cannot see was checked apart: the binary names `libnotify`, `libsecret`, `libcups` and `libpulse` as dlopen strings, and none is declared, because this application shows no notification, has no tray, plays no sound, and §16.1 forbids a printing pipeline. `libxss` is dropped for the opposite reason to the two dead names — it is a real package that the binary never asks for.
- ~~The outward description follows the one on screen.~~ **Done early, at v0.9d** — the application was contradicting itself, saying *Ekonomi Defteri* on the About page and the old sentence in every launcher, and that is a defect rather than a scheduled task. What remains for this rung is only to confirm it on an installed system.
- **The installed package is about three times the size it needs to be**, measured at v0.9c: `app.asar` holds **98.2 MB across 1510 files**, and the four largest entries are not runtime code. `better-sqlite3-multiple-ciphers` ships the SQLite C amalgamation **twice** — `deps/sqlite3/sqlite3.c` and `build/Release/obj/gen/sqlite3/sqlite3.c`, 12.7 MB each — which is the source the native module was compiled *from*; the app runs the `.node` binary beside it. And the whole of `node_modules/echarts` is there, roughly 35 MB of source maps and alternate builds, despite `externalizeDepsPlugin` being applied to main and preload only — so Vite already bundles echarts into the renderer chunk and the copy in the asar is never loaded. The same holds for `@tanstack/react-table`. This is a `files:` exclusion list in `electron-builder.yml`, and it must be verified by *running* the packaged app rather than by reading the config, since an over-broad exclusion breaks a native module in a way no unit test sees.

  **Done, and the measurement at X is larger than the estimate.** Six patterns: echarts, the zrender it draws through, `@tanstack`, and three inside the native module — `deps/`, `build/Release/obj/` and the C++ `src/`. `app.asar` **68 MB → 4.4 MB**, its unpacked sidecar **31 MB → 3.9 MB**, **1769 entries → 456**. What JADEITE contributes to an installation falls from 99 MB to 8.3 MB; the install as a whole from **409 MiB to 318 MiB**, because the remaining 310 MiB is Electron and no `files:` list argues with that. *(Units corrected after the live session: these three are the figures pacman prints, and pacman prints MiB — the package's own `.PKGINFO` says `size = 333553664`, which is 318.10 MiB and 333.6 MB. The numbers were always right; the unit was not.)* The verification is `tests/package/packaged.spec.ts` under its own Playwright config — it starts the built binary, runs the first-run ceremony (which is the native-module question: Argon2id and SQLCipher both resolve their binaries out of `app.asar.unpacked`), opens all six destinations, and reads the asar back to prove the exclusions landed at all, since a negation pattern that matches nothing is silent in electron-builder. `npm run verify:package`.
- Performance polish to budgets; final visual sweep across all ten palettes; string freeze TR/EN. **The freeze is the event that turns the locale floor into an equality** — `locale-parity`'s count assertion is a floor precisely because keys keep arriving, and after the freeze they stop.

  **Done. The catalogues are frozen at 442 keys each**, and the number was measured after the fixing rather than before it, which is the only order that works: pinning 444 would have frozen in two dead keys, and pinning the old floor of 443 against a tree of 444 would have left the newest key deletable from both files with every parity check still green. `overview.yearNet` labelled a figure the Overview year card renders bare; `section3.liveSkipped` was superseded by `section3.refreshTooSoon` and left behind. Four translation defects went with them — `section2.newParty` offered *annem* as its example in the **English** catalogue, `backup.candidateApp` read "Written by JADEITE" over a version number it never named while the Turkish said *sürümü*, and `section3.drift.unpriced` said in Turkish what `section3.unpriced` had already said differently on the same screen. An equality is the assertion a floor could never make: it fails when the catalogues **grow**, which is what a freeze means.
- Documentation inside the app: ~~first-run tour (skippable),~~ the truth table, licence notice. **The tour is struck** *(v0.9d, owner's ruling)*. It was named twice in this document and specified nowhere in `XJADEITE.md` — no behaviour, no strings, no trigger, no skip semantics — and Global rule 7 refuses exactly its shape: shown once per install, carried forever. What it would have said belongs in the repository's `README.md`, which Realisation XI already owns. The licence notice shipped at v0.9b and the truth table at Realisation IX. ~~What remains here is the truth table's *placement*, since §15 scoped a page.~~ **The placement item is struck at X, because the premise is not in the specification.** §15 does not mention the truth table at all; §4.4 holds it as a *verbatim contract* and §19's register maps it to §4.4; §17.1 scopes the Hakkında page and does not put it there. The word *page* is Realisation IX's own, in this document — its scope line reads "In-app 'Credentials & Backup Truth Table' page" and its acceptance "Truth-table page ships in Turkish and English" — and v0.9d then attributed that word to `XJADEITE.md`, where it has never appeared. What shipped is `TruthTable.tsx` inside Yedekleme: §4.4's three rows, the mandated post-change backup, the honest limitation, and the live recovery-key generation the contract itself cannot carry. It is proved in both languages by `tests/e2e/backup.spec.ts`. There is nothing to move, and this rung was carrying a task invented by a paraphrase.

**Acceptance**

*Machine-checked.*
- [ ] The launcher entry, the package listing and the specification all say *Ekonomi Defteri* / *Economy Journal*; `pacman -Qip` shows one description and `apt show` shows a synopsis and a distinct extended line, neither repeating the other. *(The deb half is read from the package's own `control` member. Neither named machine carries `apt` or `dpkg` — they are Arch — and `control`'s `Description:` is the field `apt show` prints, so extracting it answers the same question on the hardware that exists.)*
- [ ] The address the packages carry and the address the Hakkında page prints are one string, and it is in the repository. *(Added at X. `package.json`'s `homepage` did not exist: electron-builder derived pacman's `url` and the deb's `Homepage:` from `.git/config`'s origin remote, which is not a tracked file, while `AboutPanel.tsx` held its own literal. Two statements of one fact, one of them a property of the clone — and the build aborts outright where there is no `.git/config` to read, which is any git worktree and any source tarball. An AUR build is a source tarball.)*
- [ ] The TR/EN catalogues are frozen: `locale-parity` asserts an **equality**, not a floor, and `npm run audit` agrees. *(Added at X — the scope named the freeze and no box declared it.)*
- [ ] Every dependency the pacman package declares resolves in the repositories. *(Added at X, after the owner's `pacman -U` refused the transaction over two names electron-builder had hardcoded and Arch had dropped. `tests/package/metadata.spec.ts` probes each with `pacman -Si`. A package that builds, lists and runs is not a package that installs.)*
- [ ] The installed hicolor set carries every size `build/icons/` holds, and each installed file is byte-identical to its source.
- [ ] The `.desktop` entry reads `StartupWMClass=jadeite` — the app_id the running window actually reports — with `GenericName` in both languages and `Categories=Office;Finance;`.
- [ ] `package.json` reads `1.0.0`, and `releaseDate` beside it is the day this ships (§17, §17.1).
- [ ] The packaged application starts, unlocks and opens every section after the `files:` slimming. *(`tests/package/packaged.spec.ts`. The clause **"on a machine that never built it"** is the owner's half and sits with the install boxes below — a suite running beside the build tree proves the artefact, not the absence of the tree.)*

*Owner-observed, on both named machines.*

**Run on the Arch/Niri laptop, 31 July 2026, from the built 1.0.0 package** — and the run is what found the dependency defect above, on its first command. Recorded here because the figures are worth keeping and because two of these were closed more precisely than the box asks:

- **Upgrade-in-place, 0.9.2 → 1.0.0.** pacman reported `upgrading jadeite`, and its own arithmetic — `Net Upgrade Size: -90.68 MiB` — is an independent confirmation of the slimming, measured by the package manager rather than by this rung. The vault opened with the same password. *(0.9.2 had to be forced past its own two dead dependency names with `--assume-installed` to be installed at all, which is the defect demonstrating itself.)*
- **Uninstall.** `pacman -R jadeite` left `jadeite.db` and `jadeite.keys` exactly where they were, and removed the `.desktop` entry and every icon.
- **Fresh install: 6.8 s**, against a budget of two minutes.
- **`StartupWMClass` is not assumed.** The owner's waybar shows window titles rather than icons, so the launcher pairing could not be seen — instead the installed application was started and asked, through niri's IPC, what it calls itself: `App ID: "jadeite"`, against `StartupWMClass=jadeite` in the installed entry. That is the assertion the box actually wants, and it is better evidence than a taskbar icon would have been.
- **Left behind:** installing 0.9.2 pulled in `re2`, which the corrected dependency list does not name; it is an orphan afterwards. A consequence of the old list rather than of the upgrade.

- **The visual sweep is passed at 1440p**, on the owner's own reading of the ten frames: *"nothing weird to my eye."* That is the whole of what this box was ever going to be, and Realisation VIII was right to refuse it a mechanical criterion.

**Run from a CachyOS live session, 31 July 2026 — the "machine that never built it" half, answered.** A live session has never built this application: no `node_modules/`, no toolchain, no library present only because a build once needed it. It is also stricter than the rig would have been, the rig being a daily driver whose accumulated packages could satisfy an undeclared dependency by accident and hand back a false pass. The procedure is `docs/livecheck.md`; the full result is `docs/livecheck-results.md`. What it settled:

- **The declared dependency list is right, on three independent readings.** The first install ran with **no sync databases at all** — `database file for 'core' does not exist`, and the same for the other three — so pacman resolved `gtk3`, `nss` and `alsa-lib` against the local database only, with nowhere to fetch a missing one from. Had any of the three been absent, the transaction would have failed outright rather than offering a download. `pacman -S gtk3 nss alsa-lib` then reported each as already installed, and a third install with the databases synced still asked for nothing.
- **Nothing was `dlopen`-ed and missing.** Not one of the seven libraries outside the declared closure complained, and nothing outside that seven did either. The only stderr is three Wayland colour-management errors from Chromium's Ozone backend — the live ISO's compositor not implementing `wp_color_management`, which is a protocol negotiation failing rather than a library.
- **Both vault files are the exact size the source says they must be.** `jadeite.keys` at **626 bytes** is what `newEnvelope()` serialises to at the frozen Argon2id baseline with `generation: 1`; `jadeite.db` at **135,168 bytes** is 33 pages of 4096, which is what migrations V1–V5 leave once the WAL is checkpointed, and one entered value does not add a page. Neither number could look like that if `argon2.node` or `better_sqlite3.node` had failed to load on a machine with no build tree. That was the point of the exercise.
- **Uninstall, a second time and on a second machine.** `pacman -R jadeite` removed `/opt/JADEITE`, the symlink and the desktop entry, and left `jadeite.db` and `jadeite.keys` where they were.
- **The scriptlet ran, and the symlink is what proves it** — not the `chrome-sandbox` mode. That mode is `0755` inside the package already, so it is equally what a scriptlet that never ran would leave, and the template's `|| true` erases the difference. `/usr/bin/jadeite` appears in none of the package's 188 payload entries, so its existence is the proof; its length of 20 rather than 25 further shows the direct `ln` branch ran rather than the `update-alternatives` one, which is correct on Arch, where that tool belongs to `dpkg`.

**Two of the procedure's steps were not carried out, and neither failed.** The application was launched from a shell rather than from the desktop menu, so the box the menu exercises is unevidenced. And the clock was started but never cleanly stopped: the recorded interval spans a `pacman -Sy`, two further reinstalls and an aborted dependency query before the vault was created at all. Its uncontaminated pieces — under **30 s** to install, **18 s** from a `pacman -U` to the application on screen, at most **96 s** from launch to a stored value with two Argon2id derivations inside it — sum to under two minutes. A sum of separately measured pieces is not the measurement the box asks for. **The two-minute box is therefore still open, for want of a clock rather than for want of speed.**

**Nothing visual and nothing timed may be taken from that session**, on its own terms: `vulkan-icd-loader` sits outside the declared closure, so the rendering path was not the one the parity screenshots use, and a squashfs-on-USB filesystem makes any duration a number about the stick. The instrumented line read **770 ms**, then **704 ms**; it is recorded as an observation with no box attached to it.

**The run also produced two defects, one of which a fresh install cannot reach.**

- **The vault database was created world-readable.** SQLite creates the file at its own compiled-in `0644` and nothing narrowed it, while every other file the application writes — the envelope, `config.json`, the restore journal, an exported `.jbk` — goes out at `0600`. The restore path made the inconsistency plain: it stages the database at `0600` and renames it into place, so the same file carried two different modes depending on whether it had been created or restored. Consequence is small, the directory being `0700` and the bytes ciphertext, but the mode travels with any mode-preserving copy, and SQLite hands the `-wal` and `-shm` sidecars whatever the database has. **Fixed in `openDatabase`** — on every open rather than at creation, so that a vault made by `v1.0` is repaired instead of left as it is, and before `journal_mode = WAL`, so the sidecars are covered too. Nothing had been watching: the suite asserted the data directory's *contents* and never its modes, which is the gap that let this reach a release.
- **The package has no `post_upgrade`, so an upgrade runs no scriptlet at all.** electron-builder passes fpm only `--after-install` and `--after-remove`, and pacman calls `post_upgrade` when a package replaces an installed version. On a machine where user namespaces do not work — the only kind where the SUID branch of the sandbox matters — an upgrade re-lays `chrome-sandbox` at its packaged `0755` and nothing restores the `4755` bit. A fresh-install test cannot reach this by construction, and neither could the 0.9.2 → 1.0.0 upgrade recorded above, that machine having working user namespaces. **Carried to Realisation XI**, where it needs a no-userns box to be observed rather than inferred.

**Outstanding at the tag, and shipped anyway — the owner's call, recorded rather than smoothed over.** Two boxes belong to the **CachyOS rig** and the rig was not reachable when `v1.0` was cut: its ≤ 1.5 s cold start against an installed package, and — since the laptop built this — the "machine that never built it" half of the packaged-application box. *(Amended after the live session recorded above. The second of the two is closed, and not by the rig: a live ISO has never built anything, and the package installed and produced a working vault on one. What belongs to the rig is now the cold start alone. In its place, the **two-minute clock at the box below is open on its own account** — it was never separately outstanding at the tag, because §444 read the fresh-install box as a question of provenance; the live session answered the provenance and left the timing unmeasured.)* Neither is a *behaviour* nobody has exercised: both were run on the laptop, from the installed 1.0.0 package, and the laptop is the slower of the two machines by some distance (Ryzen 5 3450U against a 9800X3D). The honest statement is that the rung's own scope says *"on CachyOS **and** Arch/Niri"* and only one of the two was done. **They carry forward to Realisation XI**, whose acceptance re-runs every prior list anyway and which cannot be started without the rig. This entry exists so that the gap is a decision somebody made rather than a thing that quietly happened — the same reason v0.8c was written down three weeks late.
- [ ] Fresh-machine install from the pacman package to working vault in under two minutes.
- [ ] Uninstall removes the application, its launcher entry and its icons, and leaves the vault where it is — a package manager must never take the owner's data with it.
- [ ] Upgrade-in-place over an earlier version keeps the vault openable with the same password.
- [ ] Cold start inside §3.4 on **both** rigs: ≤ 1.5 s on CachyOS, ≤ 3 s on the Arch/Niri laptop.

  **The laptop half is measured, and it is the rig that is now outstanding.** Realisation X was built and tested on the **Arch/Niri laptop** — `PRETTY_NAME="Arch Linux"`, `XDG_CURRENT_DESKTOP=niri` — not on the main rig, which is a fact worth stating plainly because every number in this rung comes from that machine. The packaged application reaches the lock screen in **721 ms** there, against 696 ms for the same code launched from source, so packaging costs about twenty-five milliseconds. §3.4 allows the laptop **3 s**; `tests/package/packaged.spec.ts` asserts **1.5 s** and passes, which is the rig's ceiling held on the slower machine.

  What remains is therefore the **CachyOS main rig**, whose ≤ 1.5 s has not been re-measured against an *installed* 1.0.0 package — and, with it, "on a machine that never built it", since the laptop built this.
- [ ] The visual sweep: all ten palettes at 1440p and at 1080p. *(`npm run sweep:palettes` drives the **packaged** application through twenty windows and writes `palette-sweep/<density>/<id>.png`, asserting only that each palette actually applied — a sweep reviewed from twenty files where two are the same palette twice is worse than no sweep. The looking is the owner's, and is not mechanised: Realisation VIII refused to give "renders beautifully" a false criterion and so does this. The same screenshots are what Realisation XI's parity spot-check compares Windows against.)*
- [ ] Every *behavioural* acceptance box above still passes, release gates excepted.

*Judged.*
- [ ] Zero known defects against XJADEITE; deviations either fixed or spec-amended consciously.

  **The sweep, and both exits taken.** *Fixed in code:* `will-navigate` consulted a predicate admitting `blob:`, `data:` and `chrome-extension:` while §3.3 says three times over that it "permits nothing but this application's own files" — navigation now has its own `NAVIGABLE_SCHEMES` and the request path keeps the wider set, because weakening a thrice-stated security sentence to match code that drifted from it is the wrong repair at v1.0. Two IPC handlers — `vault:status` and `vault:lock` — carried no guard against §3.3's categorical "no handler is exempt"; neither leaked anything today, and the reason to spend two lines rather than file a note is that `vault.lock()` runs every `onLock` listener synchronously inside the handler, so the unguarded path was being inherited by listeners nobody has written yet. And `drift.ts` still stated the price ceiling as ₺100.000, four rungs after §19 raised it to ₺500.000 — a false sentence in shipped code whose argument happened to survive the change, which is how a stale comment outlives a test suite.

  *Spec-amended consciously:* §4.1 claimed the config directory holds "exactly one app-managed file", and it holds 22 — `config.json` and the 21 Chromium wrote, because `app.setName('jadeite')` makes Electron's `userData` resolve to the same path and the profile lands beside it. The amendment states the truth rather than moving `userData`, which at v1.0 would relocate the provider session cookie for a sentence. §13 still said language "is a setting inside the vault" after the 2026-07-29 split moved it to `config.json`; §4.1 and §16.6 already said so, the code follows them, and §13 was the straggler.
- [ ] Tag `v1.0`, and `gh release create`.

---

## Realisation XI — Windows Port · v1.1 *(final rung)*

**Goal:** parity on Windows, pixel-identical by construction, Github page README.md — and the ladder's end.

**Carried in from Realisation X.** Two of X's boxes were owner-observed on the Arch/Niri laptop and not on the CachyOS rig, which was out of reach when `v1.0` was cut: cold start ≤ 1.5 s against an installed package, and a fresh install on a machine that never built the application. Both belong to the rig, both are re-run by this rung's first acceptance line, and neither can be answered from Windows — so they are named here rather than left to be remembered.

*(Amended after the live session of 31 July 2026 — see X's entry. The second of the two is closed and does not carry: a CachyOS live ISO had never built the application, and the package installed and reached a working vault there. Three things carry in its place. **The rig's ≤ 1.5 s cold start**, unchanged. **The two-minute install clock**, which that session did not measure cleanly — its pieces sum to under the budget, but a sum is not a measurement. **And the missing `post_upgrade` scriptlet**: electron-builder passes fpm no `--after-upgrade`, so `pacman -U` over an installed version runs nothing at all, and on a machine without working user namespaces an upgrade silently leaves `chrome-sandbox` non-SUID. That last one is not the rig's — it needs a box where `unshare --user` fails, which neither named machine is, and it bears directly on this rung's own packaging work.)*

**A reference machine has changed underneath the specification.** The laptop §3.4 names as *Arch/Niri* — the machine every number in X was measured on, including the 721 ms at X's cold-start box — was wiped and reinstalled with **CachyOS + Niri** on 1 August 2026. The hardware is the same Ryzen 5 3450U; the distribution is not. So §3.4's second reference machine no longer exists as described, and any re-measurement is on a third configuration that is neither of the two the specification names. This rung either re-measures and re-names it, or says plainly that the Arch figures stand as history and are not reproducible. It is not a defect, but it cannot be left unstated — the whole point of naming reference machines is that a number means something without them being present.

**Scope**
- NSIS installer; `%APPDATA%\jadeite\` storage; native-module builds (SQLCipher, argon2) for Windows; code-path audit for path/locale assumptions.
- Full acceptance re-run on Windows; rendering parity spot-check against Linux screenshots.

**Started 1 August 2026, from Linux, and the audit came first.** The code-path audit this rung's scope names was run before anything was built: four sweeps over path and filesystem assumptions, locale and encoding, process and Electron API, and the build and test tooling. **Fifty-six findings — twenty-one that break, eleven that degrade, five cosmetic, and nineteen that looked like problems and are not.** The full account is `docs/realisation-xi.md`. Nothing below has run on Windows; the fixes are verified against the Linux suite only, which proves they broke nothing and does not prove they fixed anything.

- **The port did not run at all, and one function was the reason.** `fsyncDirectory()` is the last statement of every atomic write, and Windows has no directory-sync primitive — libuv opens the handle but `FlushFileBuffers` refuses a read-only directory handle with `ERROR_ACCESS_DENIED`, which Node raises as `EACCES`. Every atomic write would have done its work correctly and then thrown, and every caller reads a throw as failure. **A vault could never have been created on Windows**: the envelope would land, the database would not, and every retry would fail identically for as long as the machine stood. Backup export would have reported failure over a complete `.jbk`; restore could never have reached verification. Guarded rather than caught, because on Linux that flush is load-bearing and swallowing an `EIO` there would discard the property the module exists for.
- **Two more that break, both fixed.** `completeInterruptedInstall()` ran unguarded at the top of `app.whenReady()`, ahead of the only window there is — a throw left the process alive with no window and no way to say why, which an owner reads as a hang. And `rmSync` in a `finally` in the backup service could replace a successful return value and escape the function's own `catch`, reporting `INTERNAL` for a backup that was written, verified and logged; that is the argument the file already makes about `recordBackup`, one line lower down and one platform over.
- **The installer exists, and it takes the icon split this file has owed since Realisation IX.** `docs/conficon.md` asked for the shield on installers and the tile in launchers; Linux could not honour it, because `linuxOptions` exposes one `icon` and both packages are built from it. NSIS takes four, so the split is finally expressible and is taken. Assisted rather than one-click and per-user rather than per-machine — an application holding the owner's financial record should let them see the shape of its own install, and a per-user install needs no administrator and matches a vault that is per-user by construction. Unsigned, deliberately: the alternative is a certificate rented annually, for an application whose premise is that it phones nobody.
- **The scope line named the wrong risk.** It expected native-module builds to be the hard part. `argon2` turns out to ship a genuine N-API `PE32+` prebuild and needs no MSVC to load — closing the question `docs/livecheck.md` filed. What is actually hard is that **eleven of the fifteen distinct breaking findings are in `tests/` and `scripts/`, not in `src/`** — and the first acceptance box is that every prior acceptance list passes on Windows, so they are on the critical path regardless.
- **One of them must be fixed before anything is run there at all.** Every suite isolates itself by setting `XDG_DATA_HOME`, which the `win32` branch of `paths.ts` ignores — so on Windows the suites would run against **the owner's real vault**. It does not fail loudly. It destroys data.
- **And one is a specification conflict rather than a defect.** §5.1 puts both the config directory and the vault directory at `%APPDATA%\jadeite`, so on Windows they are the same directory: `config.json` becomes a third file beside `jadeite.db` and `jadeite.keys`, §4.1's "exactly two files" stops being true, `app-config.ts`'s own header stops being true, and four acceptance assertions fail. Moving the vault to `%LOCALAPPDATA%\jadeite` keeps every existing invariant and has an independent argument in its favour — that directory is excluded from roaming profiles, and an encrypted database is not a thing to sync between machines. But it changes where a Windows vault lives, so it is the owner's call and not this rung's.

**Finished the same day, on Windows 10 Pro 19045 — and the audit above was wrong in both directions.** It was pessimistic about the toolchain and optimistic about its own reach. **No MSVC is required at all**: `better-sqlite3-multiple-ciphers` publishes an `electron-v146-win32-x64` prebuild, `argon2` is N-API and needs no rebuild, and what actually demands Visual Studio is `install-app-deps` itself — `@electron/rebuild` does not recognise prebuildify's layout, falls through to `node-gyp` for `argon2`, and insists on compiling a module that was already ABI-correct. `npmRebuild` is off for the `--win` target and only there; Linux keeps it and still needs it. And **the two failures that actually stopped a packaged application from starting were both invisible from Linux**, which is the argument for this rung existing at all.

- **`--no-sandbox` kills the application on Windows, and it would have reached the owner.** Every fixture passed it unconditionally — on Linux it is what lets a development Electron start without a SUID `chrome-sandbox`. But `index.ts` calls `app.enableSandbox()`, and Chromium asked to enforce and disable the sandbox in one launch dies with an access violation before any window exists. Under Playwright that arrives as a `beforeAll` timeout, which reads as an application that hangs rather than one that was mis-invoked. Given the flags it should have had, the packaged application reaches its lock screen in **586 ms** against the 1500 ms budget.
- **A packaged-suite assertion could not have failed.** `@electron/asar` answers `listPackage` in the platform's own separator, so on Windows every entry came back `\build\icon.png` while both assertions compared against `/`-rooted strings. The required-file check failed for everything; the *exclusion* check passed for everything, and would have gone on passing with the whole of echarts inside the archive.
- **The isolation hazard was not hypothetical.** The first `test:vault` run wrote a real vault into the real `%APPDATA%\jadeite` and failed 46 of 252 tests as a consequence. Closed with `JADEITE_DATA_HOME` / `JADEITE_CONFIG_HOME`, read before anything else on every platform — deliberately not `XDG_*`, which Git Bash and MSYS2 both set on Windows and which must never be able to move a real vault.
- **The `%APPDATA%` collision is settled, and it cost nothing to settle now.** The vault moves to `%LOCALAPPDATA%\jadeite`; configuration stays at `%APPDATA%\jadeite`, where Electron's profile already lives. Every invariant §4.1 states is true again, Roaming stops carrying an encrypted database to a domain share, and because XI is the first Windows build there is no vault anywhere to migrate. §5.1 is amended; `docs/realisation-xi.md` carries the full account.

**And back on Linux the same day, because a port is not finished until the platform it left still works.** The Windows tree was carried across and the whole suite re-run on the laptop — 4 audits, typecheck clean, **516 unit** (1 skipped, the `%APPDATA%` case, which is Windows-only and whose Linux twin runs beside it), **252 vault** (nothing skipped at all), **111 e2e**, **26 packaged**, and the packaged application reaching its lock screen in **1152 ms** against the 1500 ms budget. Every `win32` branch the port added was then read from the Linux side rather than trusted: each is a guard around Windows behaviour with the old Linux path left underneath it, `fsyncDirectory` still flushes and still throws here, and the two changes the Windows session flagged as unguarded both hold — a directory standing where `config.json` belongs refuses the rename with `EISDIR`, which is the same write failing at the same function `chmod` used to fail one statement earlier, and the harness's new skip support is skip-on-Windows only, so a Linux run skips nothing it used to run.

- **The `post_upgrade` scriptlet is written, and the box X carried into XI is closed.** The two package managers disagreed and only one of them was being answered: dpkg runs `postinst configure` on an upgrade, so the deb was always whole, while pacman runs `post_install` on a first install and `post_upgrade` on a replacement — and electron-builder passes fpm neither `--before-upgrade` nor `--after-upgrade`. `build/pacman-post-upgrade.sh` is passed through `pacman.fpm`, and it is deliberately not a copy of the upstream after-install template: an upgrade needs the sandbox bit, the launcher symlink and the two desktop caches, and does not need the AppArmor block a pacman package never meets. The built `.INSTALL` now carries three functions where every release up to v1.0 carried two, and `tests/package/metadata.spec.ts` reads the new one out of the artefact rather than trusting the three lines of YAML that asked for it. What is still unobserved is the machine: the failure only shows where `unshare --user` fails, and neither named rig is such a box.
- **One branch had quietly lost its cover, and the loss was a side effect of the fix that mattered most.** `JADEITE_DATA_HOME` exists because `XDG_DATA_HOME` is inert on the win32 branch and a Windows test run therefore addressed the owner's real vault. Every suite now sets the override — which is right — and the consequence is that the XDG branch under it stopped being reachable from any test in the tree, while remaining the branch every real Linux install takes. `tests/unit/vault-paths.test.ts` puts the assertions back: XDG when it is set, `~/.local/share` when it is not, and the override in front of both.
- **Two assertions in `hardening.spec.ts` were reading better than they were.** It named `EACCES`, the errno the old `chmod` mechanism produced at `openSync`, which the new one cannot raise — it fails at the rename. And nothing in it could distinguish a swallowed write failure from a write that succeeded: both branches of the handler return an `AppConfig` with the same three keys and no path in it. It now refuses any errno by shape rather than one by name, and asserts that the requested palette did *not* come back.
- **Packaging a Linux release needs `libxcrypt-compat`, and the machine that cuts v1.1 is not the machine that cut v1.0.** electron-builder downloads its own fpm, whose Ruby links against `libcrypt.so.1`; Arch stopped installing that by default, and the reinstall recorded above took it away with everything else. `npm run package` stops at `fpm process failed 127` without it. In the README, because it is the sort of thing that costs an hour exactly once and only to somebody who was not here.

**Still open on the Linux side, and neither of them is code.** The rig's ≤ 1.5 s cold start is unchanged — the 1152 ms above is the laptop, which is not the rig, and re-measuring on the wrong machine answers a different question. The two-minute install clock still has no instrument anywhere in the tree: it is a `date +%s` pair run by hand, and it wants a real `pacman -U` that nobody has run since. Both are owner activities, and both are named here rather than left to be remembered.

**Acceptance**
- [x] All prior acceptance lists pass on Windows 10/11. — 4 audits; **509 unit** (2 skipped, POSIX-mode only); **250 vault** (2 skipped, same); **15 packaged** (10 skipped: `.pacman`/`.deb` members a `--win` build does not produce); typecheck clean. Every skip is counted and printed rather than deleted.
- [ ] A vault created on Linux, moved as `.jbk`, opens on Windows (and back). — **Half-proved, and the honest half is recorded rather than the whole claimed.** The container round-trips on Windows, and the backup suite's foreign-lineage and machine-transfer cases pass there. The Linux→Windows direction needs a `.jbk` carried from the rig, which no Windows session can produce for itself.
- [x] The repository carries a `README.md`, written to the brief in `docs/usereadme.md`. — Debian omitted per the brief's own instruction, so Windows is 3.C; the AUR sub-section says plainly that there is no AUR package rather than printing a command that would fail.
- [x] `package.json` reads `1.1.0`, and `releaseDate` beside it is the day this ships (§17, §17.1).
- [ ] The three items carried in from Realisation X, which this list had named in its preamble and never given a box. — **The `post_upgrade` scriptlet is closed**: written, packaged, and read back out of the built `.pacman` by `tests/package/metadata.spec.ts`. The rig's **≤ 1.5 s cold start** and the **two-minute install clock** are not, and cannot be from the laptop: one names a machine that was not present, and the other wants an install nobody has run. Left open deliberately rather than answered on the wrong hardware.
- [ ] Tag `v1.1`, and `gh release create`. **The application is complete.** — The owner's to run: `gh` is installed on neither machine, and the tag should be cut where the release is published from. The Linux artefacts are built and verified at 1.1.0 — `jadeite-1.1.0.pacman` and `jadeite_1.1.0_amd64.deb` — so the draft needs them beside the `.exe` before it is published.

---

## After the ladder — Migration Day *(no version, no code, no tag)*

The old life enters by hand, per XJADEITE §18. This is an owner activity, not a Realisation: nothing is built, nothing is released, nothing is versioned.

- Checklist of the nine forensic corrections: **XJADEITE §18.3** — kept beside the keyboard.
- Verification fixtures the typed data must reproduce: **XJADEITE §18.4**.
- Suggested order (Section 3 → Section 2 → Section 1): **XJADEITE §18.5**.
- Any friction met while typing is filed as a defect against the owning section — the sessions are the app's real ergonomics test.
- When the fixtures go green: **LibreOffice and PowerPoint are retired for this job, permanently.**
- After everything settled, the creator wants to discuss and get your ideas about if the implementation of their app in "AUR repository" is possible. By this way the app can be installed via "yay -S jadeite" or "paru -S jadeite".

---

*Ladder ends at v1.1. Anything after — new palettes, new valuable types if the closed list is ever reopened, sudo-megas integrations — begins with a spec amendment to `XJADEITE.md`, then a new Realisation numbered XII.*
