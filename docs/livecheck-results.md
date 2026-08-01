# The fresh-machine check — result

Run on a **CachyOS live ISO**, 31 July 2026, from `jadeite-1.0.0.pacman`. Raw terminal
output in `livecheck-terminal-results.md`; the procedure it follows is `livecheck.md`.

**Verdict. The provenance box is closed. The two-minute clock is not, and not because the
application was slow.** Every substantive question the live session was uniquely able to
answer came back clean — no missing dependency, no `dlopen` failure, no scriptlet defect,
a vault created and populated on a machine that has never held a build tree. What the run
did not produce is a *measurement*: the clock ran across a database sync, two extra
reinstalls and an aborted dependency query, and the `date +%s` that should have stopped it
was mistyped four times and only landed after the application had already been quit.

Two steps of the procedure were not performed: the menu launch (§5) and a clean clock (§6).

---

## Record

| Check | Result |
|---|---|
| Internal disk unmounted, stick carries only the package | **Pass.** `mount \| grep -iE 'ext4\|btrfs\|xfs'` returned nothing; `/run/media/*/` was empty. The package was run from `~/Documents` on the live tmpfs. |
| `/opt/JADEITE` and `jadeite` absent before install | **Pass.** Both absent; `which` searched seven directories and found nothing. |
| Checksum matched | **Pass.** `70e45bac…6828b`, exact. |
| pacman dependency behaviour | **Pass, and stronger than outcome 1.** See below. |
| Symlink, desktop entry, icons present | **Pass.** `/usr/bin/jadeite → /opt/JADEITE/jadeite`, `jadeite.desktop`, `256x256/apps/jadeite.png`. |
| `chrome-sandbox` mode | **0755** — but the mode is not what carries the proof. See below. |
| `unshare --user true` exit code | **0** — one of the scriptlet's three conditions. See below. |
| Launched from the **menu** | **Not done.** Every launch in the transcript is `jadeite` at a shell prompt. |
| Any `.so` complaint, and whether it is one of the seven | **None at all.** Not one of the seven, and nothing outside the seven either. |
| Vault created and unlocked | **Pass, on file evidence.** `jadeite.keys` 626 B at 21:25, `jadeite.db` 135,168 B at 21:26. Both sizes reconstruct exactly — see below. |
| Value entered and visible | **Pass, on file evidence.** The database's mtime is one minute after the envelope's; no screen confirmation was captured. |
| **Elapsed, install → working vault** | **Not measurable from this transcript.** Reconstruction below puts the owner path at roughly 1 min 30 s, bounded above by 2 min 06 s. |
| Vault at `~/.local/share/jadeite/` | **Pass.** `drwx------`, holding exactly the two files §4.1 requires. |
| Uninstall left the vault (optional) | **Pass.** Application, symlink and desktop entry gone; `jadeite.db` and `jadeite.keys` untouched. |

---

## What came back better than the procedure asked for

**The dependency evidence is threefold, not single.** `livecheck.md` treats "installs with
no dependency talk" as the weakest of its three outcomes, proving nothing on its own. This
run is stronger than that, twice over:

1. **The first install ran with no sync databases at all** — `database file for 'core' does
   not exist`, and the same for `extra`, `multilib` and `cachyos`. pacman therefore resolved
   `gtk3`, `nss` and `alsa-lib` against the *local* database only. Had any one of the three
   been absent, there was nowhere to fetch it from and the transaction would have failed
   outright rather than offering to download. It did not fail.
2. **`pacman -S gtk3 nss alsa-lib` confirmed each by name**: `gtk3-1:3.24.52-1 is up to date`,
   `alsa-lib-1.2.16.1-1 is up to date`, `nss 3.125-1` installed. All three were on the ISO
   before JADEITE arrived.
3. **The install was then repeated with the databases synced** and still asked for nothing.

**Nothing was `dlopen`-ed and missing.** The only stderr output is three Wayland
colour-management errors from Chromium's Ozone backend —
`wayland_wp_color_manager.cc:277`, `:195` and `wayland_wp_color_management_surface.cc:64`.
These are a compositor protocol negotiation failing, not a library failing to load: the
live ISO's compositor does not implement the `wp_color_management` interfaces Chromium asks
for. No SwiftShader fallback line appeared either. None of the seven candidate libraries
complained.

**Both vault files are the exact expected size, to the byte.** This is the strongest single
result in the run, and it is worth stating why:

- `jadeite.keys` at **626 bytes** is what `newEnvelope()` serialises to when every field is
  at its baseline — 16-byte salts, 12-byte IVs, a 32-byte DEK under AES-256-GCM, 16-byte
  tags, the frozen Argon2id parameters (262144 / 3 / 4), two ISO timestamps and
  `generation: 1`. Rendered through `JSON.stringify(env, null, 2)` plus a newline, that is
  626 bytes. It confirms format 1, baseline KDF, and a vault that has never been reset.
- `jadeite.db` at **135,168 bytes** is 33 pages × 4096. Applying migrations V1–V5 to an
  empty SQLite database with the app's own pragmas, then checkpointing, produces exactly 33
  pages — and inserting a settings row, a year, a category and one entry leaves it at 33,
  because the schema's ~30 b-tree root pages dominate. So the observed size confirms that
  **all five migrations ran** and that the WAL was checkpointed back into the file on quit.

Neither number could look like this if `argon2.node` or `better_sqlite3.node` had failed to
load. That is the heart of the exercise — native modules doing real work on a machine with
no build tree — and it passed.

---

## Three things the run did not prove, and one it could not

### 1. The `chrome-sandbox` mode does not carry the weight the procedure gives it

`livecheck.md` §4 asks for the mode beside the `unshare` exit code, on the reading that
`0755` means the user-namespace branch ran. That inference is under-warranted:
**`chrome-sandbox` is already `0755` inside the package** (entry 186 of 188 in the tar).
So `0755` is equally what "no scriptlet ran at all" and "`chmod 4755` failed silently"
would leave — the scriptlet's `|| true` erases the difference and prints nothing.

What actually proves the scriptlet ran is **the symlink**. `/usr/bin/jadeite` is not in the
payload — zero of 188 entries sit under `usr/bin` — so its existence is the only evidence
`post_install` executed. Its length is load-bearing too: 20 bytes is
`strlen("/opt/JADEITE/jadeite")`, against 25 for `/etc/alternatives/jadeite`, which proves
the direct-`ln` branch ran rather than the `update-alternatives` one. That is correct on
Arch, where `update-alternatives` belongs to `dpkg` and no live ISO carries it.

And the exit code covers only part of the test. The scriptlet's condition is

```sh
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
```

— a symlink check *and* the unshare, in a construct that additionally requires a
bash-capable scriptlet shell. `unshare --user true` = 0 is one of three conditions, not the
test itself. The conclusion still holds, but its warrant is the symlink.

### 2. The menu launch was skipped

Step 5 asks for the desktop menu specifically, because that is what exercises the desktop
database the scriptlet updated and what a real owner actually uses. Every launch recorded is
from a shell. The `.desktop` file is installed and
`update-desktop-database` fired as a post-transaction hook, so the machinery is in place —
but "launched from the menu" is not evidenced, and it is the one box a terminal cannot close.

### 3. The clock

Reconstructed from the epoch stamps, the Chromium log timestamps and the file mtimes,
anchored on `1785533381` ≈ 21:29:41:

| Moment | Wall clock |
|---|---|
| Step-3 clock starts, before the first `pacman -U` | 21:20:54 |
| Second clock, before the reinstall that follows `-Sy` | 21:21:36 |
| First launch reaches the lock screen | 21:25:17 |
| `jadeite.keys` written (vault created) | 21:25:xx |
| `jadeite.db` written (value stored) | 21:26:xx |
| Application quit | ≤ 21:26:52 |

**As step 3 and step 6 literally specify it, the elapsed time is 5 min 58 s** — which fails
the box. But the interval contains a full `pacman -Sy` database sync, two additional
reinstalls, an aborted `pacman -S gtk3 nss alsa-lib` that offered an 11 MiB download before
being interrupted, and all five of step 4's verification commands. None of that is on an
owner's path.

The clean sub-intervals that *are* in the transcript:

- **Install alone: under ~30 s.** Bounded by the 42 s between the two clocks, which also
  contained the `-Sy` sync (8 s of transfer on its own).
- **Third install → application on screen: 18 s.** Uncontaminated, though a reinstall over
  a warm cache.
- **Launch → vault created: ≤ 43 s.** Launch → value stored: **≤ 96 s.** Both include two
  Argon2id derivations at 256 MiB.

Summing the owner path — cold install, launch, create, unlock, enter — gives **≤ 2 min 06 s
at the worst-case bound and about 1 min 30 s realistically.** That is consistent with the
box and does not prove it. The honest record is that the run did not measure the thing the
box asks for, and that a re-run measures it in ninety seconds.

### 4. What the session was barred from answering

Cold start and appearance, by `livecheck.md`'s own ruling at lines 17–26. The instrumented
line read **770 ms**, then **704 ms** — inside §3.4's 1.5 s rig ceiling and well inside its
3 s laptop ceiling — but from USB and squashfs, and with `vulkan-icd-loader` absent so the
rendering path was not the one that produces parity screenshots. Recorded as an observation;
it must not be written against the cold-start box.

---

## Defects surfaced

Two of these the live run found; the third it structurally could not have found, and turned
up while verifying the transcript against the source.

**1. `jadeite.db` is created world-readable (`0644`).** Nothing in `src/` ever sets a mode on
the database path — there is no `chmod` call anywhere in the tree.
`better-sqlite3-multiple-ciphers` lets SQLite create the file, and SQLite's compiled-in
`SQLITE_DEFAULT_FILE_PERMISSIONS` is `0644`, masked by the inherited umask of 022, which
changes nothing. This is deterministic and will be `0644` on every machine, not a live-USB
artefact.

Every other file the application writes with its own hands is `0600` — the envelope,
`config.json`, the restore journal, the exported `.jbk`. The tell is the restore path:
`stageDatabase()` writes `jadeite.db.incoming` through `writeFileAtomic` at the default
`0600`, and `commitInstall()` renames it over `jadeite.db`. **So a restored vault's database
is `0600` and a freshly created one is `0644` — the same file, two modes, decided by
history.** No specification line requires either, so this is an internal inconsistency
rather than a spec violation, but the intent is legible.

Severity is low and not zero: the parent directory is `0700` so no other unprivileged user
can traverse to it, and the payload is SQLCipher ciphertext. What it still costs is that the
mode travels with any mode-preserving `cp`, `tar` or `rsync`, and SQLite gives the `-wal` and
`-shm` sidecars the database's permissions while a session is open.

Fix: one line — `chmodSync(databasePath(), 0o600)` after `openDatabase()` at
`src/main/vault/vault.ts:152`. No test asserts the mode of either vault file, which is why
this reached a release; the assertion belongs beside the existing `readdirSync` check at
`tests/electron/vault-suite.ts:57`.

**2. The package has no `post_upgrade()`, so upgrades run no scriptlet at all.** The generated
`.INSTALL` defines `post_install()` and `post_remove()` and nothing else, because
electron-builder passes fpm only `--after-install` and `--after-remove`. pacman calls
`post_upgrade` — not `post_install` — when a package replaces an installed version.
Therefore `pacman -U jadeite-1.0.1.pacman` over an existing 1.0.0 executes **no scriptlet
whatsoever**.

The consequence is confined to one path, but it is a real one: the payload re-lays
`chrome-sandbox` at its packaged `0755`, and on a machine where user namespaces do not work
— the only kind of machine where the SUID branch matters — nothing re-applies the `4755`
bit. The sandbox would break on upgrade, silently, with no output.

**A fresh-install test cannot surface this by construction**, and neither could the laptop's
0.9.2 → 1.0.0 upgrade at `REALISATION.md:436`, because that machine has working user
namespaces and so takes the branch that happens to match the packaged mode. It needs a
no-userns box, or an inspection like this one.

**3. `resources/apparmor-profile` (225 bytes) is packed unconditionally** by
`FpmTarget`, for the Ubuntu 24+ path. On Arch the `apparmor_status --enabled` guard never
passes, so it is never read and never installed. Inert, and noted only because it means the
package's file list is not fully accounted for by `electron-builder.yml`'s own comments.

## Bookkeeping corrections found on the way

- **`XJADEITE.md` §4.1 says the config directory "contains exactly one JADEITE-managed
  file".** On a defaults-only machine it contains **zero**: `config.json` is written lazily,
  only when the palette or language first departs from its default, and this session changed
  neither. The rule the Realisation X amendment says it cares about — JADEITE writes one
  configuration file and no other — is satisfied exactly. Suggested wording: *"at most one"*.
  No code change. Without this clause, a results row reading "no `config.json`" will be filed
  by a later reader as a regression against the amendment X had just made.
- **`REALISATION.md:414` labels a MiB figure as MB.** pacman prints `318.10 MiB`, which is
  333.6 MB; `livecheck.md` says 333 MB. Same quantity, three ways. The figure at :414 is
  right and its unit is wrong.
- **`docs/realisation-x.md:428–458` is stale** and should not be read as the current
  outstanding list. It records uninstall as "not attempted on the owner's live system" and
  states that `v1.0` is "not tagged by this work" — both overtaken by the 31 July laptop run
  at `REALISATION.md:434` and by the tag itself. Commit `cf4c9a6` did not update it.

---

## What this closes, and what it leaves

**Closed:** the *"machine that never built it"* half of the packaged-application box
(`REALISATION.md:430`), on the argument `livecheck.md` makes at lines 9–15 — the box is about
provenance, and a live session satisfies it in substance while being stricter than the rig
would have been. The uninstall box (`:446`) is closed a second time, on a second machine.

**Left open:** the two-minute clock (`:445`), for want of a measurement rather than for want
of speed. The rig's ≤ 1.5 s cold start (`:448`) and the visual sweep (`:453`) were barred
from this session by its own terms.

**A complication the run did not create.** `REALISATION.md:448` and `:450` name the second
reference machine as *the Arch/Niri laptop*, `PRETTY_NAME="Arch Linux"`. That machine has
since been wiped and reinstalled with CachyOS + Niri. The hardware is unchanged — the same
Ryzen 5 3450U §3.4 names — but the distribution is not, so the 721 ms at `:450` was measured
on a configuration that no longer exists. Any re-measurement is on "the CachyOS laptop",
which is neither of the two machines the specification names.
