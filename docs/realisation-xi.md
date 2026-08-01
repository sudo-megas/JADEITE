# Realisation XI — the Windows port, audited before it was attempted

**Status: finished. Everything below has now been run on Windows.** The audit was read out of
the source on Linux and its fixes were verified there first — 4 audits, 509 unit tests, 252
vault tests, plus a typecheck — which proved only that nothing had been broken. On 1 August
2026 the port was built, run and tested on **Windows 10 Pro 19045, x64**, and the rest of the
rung was done against the platform rather than against a reading of it.

Two of this document's conclusions were wrong, and wrong in opposite directions: it was
**pessimistic about the toolchain** — no MSVC is required, see §2 — and **optimistic about
what the audit could see**, since the two failures that actually stopped a packaged
application from starting were both invisible from Linux. Both are recorded where they
belong, and the closing section says what the run found.

The audit swept four classes of assumption — filesystem and path, locale and encoding,
process and Electron API, and build/test tooling. It returned **56 findings: 21 that break,
11 that degrade, 5 cosmetic, and 19 that looked like problems and are not.**

---

## The finding that mattered most

**`fsyncDirectory()` throws on Windows, and it is the last statement of every atomic write.**

There is no directory-sync primitive on Windows. libuv opens the handle happily —
`fs__open` sets `FILE_FLAG_BACKUP_SEMANTICS`, so `openSync(dir, 'r')` succeeds — but the
handle carries `GENERIC_READ` alone, and `fs__fsync` is a bare `FlushFileBuffers`, which
wants `GENERIC_WRITE` and answers a directory with `ERROR_ACCESS_DENIED`. Node raises
`EACCES: permission denied, fsync`.

Because the call sits at the end of `writeFileAtomic` — *after* the rename has already
succeeded — every atomic write on Windows would do its work correctly and then throw. And
every caller reads a throw as failure:

- **A vault could never be created.** `vault.create()` writes the envelope, throws, is
  caught by its own handler, and returns `INTERNAL`. `jadeite.keys` is left on disk with no
  database beside it, so `vaultExists()` stays false and every retry fails identically,
  forever.
- **Backup export would report failure over a complete `.jbk`**, and never record it, so
  the overdue reminder would never clear.
- **Restore could never reach verification.**

This is the difference between *"the port needs a toolchain"* and *"the port does not run"*.
Fixed with a `win32` guard, not a `try`/`catch` — on Linux the flush is load-bearing and
swallowing an `EIO` there would quietly discard the property the module exists to provide.
The durability argument still holds on Windows by another route: the file's bytes are
flushed before the rename, and NTFS journals the `MoveFileEx` the rename compiles to.
SQLite reaches the same conclusion in its own `os_win.c`.

---

## Fixed, and verified only on Linux

| What | Where | Why it mattered |
|---|---|---|
| `fsyncDirectory` no-ops on Windows | `src/main/vault/atomic.ts` | Above. Nothing else in the port matters until this is right. |
| `completeInterruptedInstall()` is guarded | `src/main/index.ts` | It runs unguarded at the top of `app.whenReady()`, before the window is created. A throw left the process alive with no window, no IPC and no way to say what happened — which reads as a hang. A failed replay is recoverable and the journal survives; a window that never appears is not. |
| Backup cleanup can no longer fail a good backup | `src/main/vault/backup/service.ts` | `rmSync` in a `finally` replaces the value the `try` was returning and escapes the function's own `catch`. On Windows, deleting a file another process holds open is `EBUSY` — and `snapshot.db` was closed moments earlier, exactly when Defender opens a new file to scan it. Now retried, and wrapped so cleanup can never be the thing that fails the operation. This is the argument the file already makes about `recordBackup`, one line lower down. |
| `app.setAppUserModelId` is set | `src/main/index.ts` | Windows pairs a pinned shortcut to a running window by AppUserModelID alone. NSIS stamps the shortcut from `appId`; without the matching call, pinning yields a second dead icon. |
| A fourth rule in the string audit | `scripts/audit-strings.mjs` | The above is a coupling between a YAML key and a call site with nothing between them. Rule 3 already guards the Linux equivalent (`StartupWMClass`); this is its Windows counterpart. Verified to fail on both a mismatch and a missing call. |
| The Windows build target exists | `electron-builder.yml`, `build/*.ico` | Below. |
| `npm run package:win` | `package.json` | `package` and `package:dir` hard-code `--linux`. |

### The installer

NSIS, assisted rather than one-click, per-user rather than per-machine. The reasoning is in
the config's own comments; the short version is that this application holds the owner's
financial record and the install is a thing they should be able to see the shape of, and
that a per-user install needs no administrator and matches a vault that is per-user by
construction. `deleteAppDataOnUninstall: false`, because removing the application must not
remove the vault — the rule Realisation X called the one that matters.

**The icon split promised at `electron-builder.yml:19` is now expressible and taken.**
`docs/conficon.md` asks for two marks with different jobs; Linux could not honour it because
`linuxOptions` exposes a single `icon`. NSIS takes four, so `innerAPP` (the shield) goes on
`setup.exe` and its uninstaller, and `outerAPP` (the tile) goes on the application, the Start
menu and the taskbar. Both `.ico` files carry seven sizes, are cut with the same trim-and-pad
recipe as the hicolor set so no mark is ever stretched, and are committed rather than
generated at pack time — packaging must not need ImageMagick on the machine cutting the
release.

Unsigned, deliberately. SmartScreen will interpose a panel on first run until the download
earns reputation. The alternative is an EV certificate rented annually, for an application
whose whole premise is that it phones nobody.

---

## Open — and the shape of it is not what the scope line assumed

XI's scope names *"native-module builds (SQLCipher, argon2)"* as the risk. It is half that,
and the other half is somewhere else entirely.

### 1. The test suite is the blocker, not the application

Eleven of the fifteen distinct breaking findings are in `tests/` and `scripts/`, not `src/`.
XI's first acceptance box is *"All prior acceptance lists pass on Windows 10/11"*, so these
are on the critical path even though the application itself would behave correctly.

- **Test isolation is inert on Windows.** Every suite sets `XDG_DATA_HOME` /
  `XDG_CONFIG_HOME` to a temp directory to keep itself away from the real vault. On Windows,
  `vaultDirectory()` takes the `win32` branch and reads `%APPDATA%` instead, so the variables
  are ignored — **the suites would run against the developer's real vault.** This is the
  most dangerous item in the whole audit: it does not fail loudly, it destroys data. Nothing
  should be run on Windows until it is fixed. The fix is a test-only override the `win32`
  branch also honours.
- `tests/unit/app-config.test.ts` asserts the XDG path shape directly.
- Two suites shell out to `strings(1)`, which Windows does not have.
- The crash suite asserts `signal === 'SIGKILL'`; Windows reports no signal.
- POSIX mode assertions (`0o600`) cannot hold — including the two added yesterday.
- `hardening.spec.ts` forces a write to fail by `chmod`-ing a directory read-only.
- The packaged-app path is hard-coded to `release/linux-unpacked/jadeite`.
- `tests/package/metadata.spec.ts` reads `.pacman` and `.deb` members with `bsdtar` and
  `pacman`, under `sh -c`. There is no Windows analogue; it needs to be skipped by platform.

### 2. The native-module story is better *and* worse than assumed

**Better:** `argon2` ships a genuine `PE32+ DLL` `win32-x64` prebuild and it is **N-API**,
so it is ABI-stable and needs no MSVC *to load*. This closes the question `docs/livecheck.md`
filed for XI.

**Worse, and a real trap:** `node-gyp-build` resolves `build/Release` **before** `prebuilds`
— the prebuild is a fallback, not a preference. Nothing under `argon2/` is pruned by the
`files:` block, so whatever is in `build/Release` at pack time ships. On a Linux checkout
that file is an ELF. **Cross-pack a Windows installer from Linux and the application loads
the ELF, and dies at first unlock** — after the UI has painted, because `argon2` is only
required inside the KDF. A green build, a shipped installer, and a failure the packaging
never sees. Recorded in `electron-builder.yml` beside `asarUnpack`; the rule is that `--win`
is built on Windows and `--linux` on Linux.

Separately, `postinstall` runs `electron-builder install-app-deps`, which reaches for
`node-gyp` rather than for the prebuild — the proof is in this tree, where
`build/Release/.forge-meta` sits beside an unconsulted `prebuilds/linux-x64/`.

**Corrected on Windows, 1 August 2026 — no MSVC toolchain is needed, and the claim that one
was is the largest error in this audit.** `better-sqlite3-multiple-ciphers` does publish
prebuilds, for Electron's ABI as well as Node's: `prebuild-install --runtime=electron
--target=42.8.0` fetches `better-sqlite3-multiple-ciphers-v12.11.1-electron-v146-win32-x64`
from the project's own releases, and it loads. `argon2` needs nothing, being N-API. Both were
confirmed inside Electron 42.8.0 by opening a keyed database, checking that the sentinel does
not appear in the file on disk, and reading it back.

What does fail is `install-app-deps` itself. `@electron/rebuild` does not recognise
prebuildify's layout, falls through to `node-gyp` for `argon2`, and demands Visual Studio in
order to rebuild a module that was already ABI-correct — so the toolchain is required by the
rebuild step and by nothing else. Turning `npmRebuild` off **for the Windows target and only
there** packages the binaries that are already in place. Linux keeps the rebuild and still
needs it, because `better-sqlite3-multiple-ciphers` is not N-API there and `npm` installs its
Node-ABI prebuild.

One consequence worth stating plainly, because it inverts the trap this section opens with:
on Windows `argon2/build/` is left **empty**, so `node-gyp-build` resolves
`prebuilds/win32-x64/` — and the binary that ships is a genuine `PE32+`. The cross-pack
hazard is real in the direction described and absent in this one.

### 3. One decision that is the owner's, because it is a specification conflict

**On Windows, the config directory and the vault directory are the same directory.**
`XJADEITE.md` specifies both as `%APPDATA%\jadeite` (§5.1 lines 147 and 152). On Linux they
are two different trees and the separation is load-bearing: §4.1 requires the data directory
to hold *exactly two* app-managed files.

On Windows, `config.json` becomes a third file beside `jadeite.db` and `jadeite.keys` — and
Electron's own profile lands there too, since `app.setName('jadeite')` resolves `userData` to
the same place. `app-config.ts`'s own header, which says the config file "lives in a
different directory from the vault, so the data directory still holds exactly the two files
§4.1 names", becomes false. Four acceptance assertions fail.

This is the spec's, not a slip — but nothing downstream was told. Three ways out, and the
choice is not a technical one:

1. **Move the vault to `%LOCALAPPDATA%\jadeite`** and leave config in `%APPDATA%`. Restores
   the two-directory split exactly. Costs a spec amendment to §5.1, and `%LOCALAPPDATA%` is
   excluded from roaming profiles — which is arguably *correct* for an encrypted database
   nobody should be syncing across machines.
2. **Keep one directory and amend §4.1** to state the invariant per-platform.
3. **Keep one directory and put the vault in a subdirectory** of it.

Option 1 is the one that keeps every existing invariant true, and the roaming argument is a
real point in its favour rather than a rationalisation. But it changes where a Windows vault
lives, and that is a specification decision.

### 4. Smaller, but real

- The monospace stack names no font that exists on Windows, so the recovery key and the
  money columns fall back to Courier New. Add `Consolas` / `Cascadia Mono`.
- `config.json` written by PowerShell (or any BOM-adding editor) silently resets palette and
  language to defaults — `JSON.parse` rejects a BOM, and the catch returns defaults.
- The §13 locale test proves nothing on Windows: `LANG`/`LC_ALL` are not how Windows carries
  a locale.
- `commitInstall`'s "from here nothing may refuse" section has no retry, and on Windows
  `rename`/`unlink` are exactly the two calls most likely to refuse.
- `asarUnpack '**/node_modules/argon2/**'` unpacks nine prebuilds that can never load on the
  target, plus the whole gyp build tree — the slimming `docs/livecheck.md` already filed.
- The backup save dialog builds `defaultPath` with a hard-coded forward slash.

---

## Checked and cleared — 19 things that were not problems

Worth recording, because knowing what was examined is worth as much as knowing what failed.

- **The Turkish dotless-I is a non-issue, and for a good reason.** In a Turkish locale
  `'I'.toLowerCase()` is `'ı'`, not `'i'` — a classic source of silent corruption in
  identifiers and filenames. The codebase is clean **because it never calls the
  locale-sensitive case functions at all**. Checked exhaustively.
- **CRLF cannot reach the `.jbk` container or any checksum**, so cross-platform vault
  portability — XI's second acceptance box — is safe from line endings.
- **The database handle is closed before `install.ts` renames over it.** This was the single
  most likely Windows failure in the restore path (POSIX allows renaming over an open file;
  Windows does not), and the code already gets it right.
- **There is no `child_process` anywhere in `src/`** — nothing to port.
- **No `BrowserWindow` option in `createWindow()` is Linux-specific**, and `powerMonitor` in
  `idle.ts` is better supported on Windows than on Linux.
- **npm script syntax is already `cmd.exe`-safe** — no quoting, env-prefix or coreutils
  problems anywhere. The two spawns in `scripts/` resolve real `.exe` files and need no
  `shell: true`.
- **Number, currency and date formatting are pinned to the app language**, not the OS
  locale, so they are identical on Windows. Sort order is byte-identical — there is no
  `localeCompare` or `Intl.Collator` anywhere.
- `app.enableSandbox()` needs no `chrome-sandbox` equivalent on Windows.
- All four audit scripts handle paths correctly, including `audit-strings`' `git ls-files`
  output.

---

## What the Windows run found — 1 August 2026

Windows 10 Pro 19045 x64, Electron 42.8.0 (module ABI 146), no Visual Studio installed and
none needed. The four items this section used to list as "what to do first" are all closed,
and the run added four findings the audit could not have seen from Linux.

**The test isolation was worse than described, and it was proved rather than argued.** The
audit said the suites *would* address the real vault. They did: a first run of
`npm run test:vault` wrote `jadeite.db`, `jadeite.keys` and `config.json` into the real
`%APPDATA%\jadeite`, and 46 of 252 tests failed as a consequence — the first vault creation
succeeding, every later one refusing because a vault it could not see was already there, and
`afterEach` deleting an empty temporary directory each time. Fixed with `JADEITE_DATA_HOME`
and `JADEITE_CONFIG_HOME`, honoured on every platform and read before anything else. They are
deliberately *not* `XDG_*`: Git Bash and MSYS2 both set those on Windows, and a stray
`XDG_DATA_HOME` must never be able to move a real vault.

**`--no-sandbox` kills the application on Windows, and this is the one that would have reached
the owner.** Every fixture passed it unconditionally, because on Linux it is what lets a
development Electron start without a SUID `chrome-sandbox`. `src/main/index.ts` calls
`app.enableSandbox()`, and Chromium asked to both enforce and disable the sandbox dies with an
access violation — `0xC0000005`, faulting inside `jadeite.exe`, before any window exists.
Under Playwright it presents as a `beforeAll` timeout, which reads as an application that
hangs. Given the flags it should have had, the packaged application reaches its lock screen in
**444 ms** against a 1500 ms budget.

**A packaged-suite assertion could not fail on Windows.** `@electron/asar`'s `listPackage`
answers in the platform's own separator, so every entry came back as `\build\icon.png`. The
required-file check compared against `/`-rooted strings and reported everything missing; the
*exclusion* check, which asks whether anything named in `EXCLUDED` survived, reported an empty
survivor list for the same reason — and would have done so with the whole of echarts sitting
in the archive. A green that could not have been red.

**Electron 42 no longer downloads its own binary.** The package ships no `scripts` block at
all, so `npm ci` leaves `node_modules/electron/dist` empty and every launch fails until
`node node_modules/electron/install.js` is run. Nothing in the project was wrong; the
instruction simply did not exist yet, and it is now in the README.

### Closed, with what closed them

| Was open | Now |
|---|---|
| Test isolation inert on Windows | `JADEITE_DATA_HOME` / `JADEITE_CONFIG_HOME`, honoured on all platforms |
| `%APPDATA%` collision (owner's call) | Vault moved to `%LOCALAPPDATA%\jadeite`; §5.1 amended, no migration needed |
| MSVC Build Tools + Python required | Not required. `npmRebuild: false` on the `--win` target only |
| `strings(1)` shelled out to | Implemented in the suite; one fewer Unix dependency, and it now runs on both |
| POSIX `0o600` assertions | Skipped on Windows, counted and printed, with the ACL argument recorded in §5.1 |
| `SIGKILL` assertion | `TerminateProcess` is the same abruptness; normalised, with the reasoning at the call site |
| `release/linux-unpacked` hard-coded | Resolves `win-unpacked` on Windows |
| `metadata.spec.ts` reads `.pacman`/`.deb` | Skips on Windows — a `--win` build produces neither |
| Monospace stack had no Windows face | `Cascadia Mono`, `Consolas` added ahead of the generic fallbacks |
| `config.json` BOM silently reset settings | Leading `U+FEFF` stripped before `JSON.parse`, with a test |
| Backup dialog built a path with `/` | `join()` |

### Still open, and deliberately

- **`asarUnpack` still unpacks nine foreign `argon2` prebuilds** — darwin, freebsd, musl and
  the arm variants — about 0.5 MiB that can never load on the target. Cosmetic, and the
  slimming `docs/livecheck.md` filed remains unfiled.
- **The installer is unsigned**, so SmartScreen interposes on first run until the download
  earns reputation. A decision, not an omission; the README says so plainly rather than
  letting the panel surprise anyone.
- **`commitInstall`'s "from here nothing may refuse" section still has no retry**, and on
  Windows `rename` and `unlink` are the two calls most likely to refuse. Not observed in this
  run; recorded because the reasoning that it *could* has not been answered.
- **The §13 locale test proves nothing on Windows**, `LANG`/`LC_ALL` not being how the
  platform carries a locale. The property it guards — that the OS locale is never consulted —
  is held by the code and asserted by the locale audit, which does run.
