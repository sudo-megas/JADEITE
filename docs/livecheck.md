# The fresh-machine check, run from a live session

**What this closes.** Realisation X shipped with one box outstanding that is not about
speed: *"Fresh-machine install from the pacman package to working vault in under two
minutes"*, and with it the **"a machine that never built it"** half of the packaged-
application box. `REALISATION.md` line 444 records why — the laptop built `v1.0`, so
installing the package on the laptop cannot prove the package stands on its own.

**Why a live session is a valid answer, and not a shortcut.** That box is about
*provenance*, not hardware. A live session has never built this application: no
`node_modules/`, no toolchain, no library that is present only because a build once
needed it. It satisfies the box in substance. It is also **stricter than the CachyOS
rig would have been** — the rig is a daily driver carrying years of installed packages,
any one of which could satisfy an undeclared dependency by accident and hand back a
false pass.

**Two numbers must not be taken from here.**

- **Cold start.** A live session runs from USB and squashfs; any timing measured in it is
  a number about the USB stick. That box belongs to the rig or to nobody, and it is the
  owner's ruling which.
- **Appearance.** `vulkan-icd-loader` is *not* among the packages the declared
  dependencies pull in (see below), so a live session may quietly fall back to the
  bundled `libvk_swiftshader.so` and render in software. The application will look
  correct and behave correctly; it will not be the same rendering path that produces
  Realisation XI's parity screenshots. Judge nothing visual from this session.

---

## What is already proven, so you know what you are *not* testing

The link-time dependency question was settled on the laptop before this document was
written, and it does not need the live session:

- Every shared library the shipped binaries name was resolved and mapped to its owning
  Arch package — the main binary, `chrome_crashpad_handler`, the three bundled `.so`
  files, and both unpacked native modules. That is **67 packages**.
- The transitive closure of the three declared dependencies — `gtk3`, `nss`, `alsa-lib`
  — is **222 packages**, and it **covers all 67 with nothing left over**. The comment in
  `electron-builder.yml` claiming the list was "measured from the shipped binaries rather
  than accepted from a default" is true.
- No unresolved soname anywhere, with one expected exception: `libc.musl-x86_64.so.1`,
  named by `argon2/prebuilds/linux-x64/argon2.musl.node`. That file is a musl prebuild
  that a glibc system never loads. See *Two things found on the way* at the end.

**So `pacman -U` is not expected to fail, and if the app fails it will not be for a
missing linked library.**

### The `dlopen` question, also measured

Libraries opened by name at runtime never appear in a link closure, so they were counted
separately: sonames named as strings inside the binary, minus the ones actually linked.
That is **47 candidates**, and all but seven are already covered by the declared
dependencies' closure — `libGL`/`libEGL` via `mesa` and `libglvnd`, `libnssckbi.so` (the
CA certificate store, which the two allowlisted price hosts of §14.1 need for TLS) via
`nss` itself.

The seven **outside** the closure, and what each would cost if the live ISO lacks it:

| Not in the closure | What it is | If absent |
|---|---|---|
| `vulkan-icd-loader` | GPU compositing | Falls back to GL, then to the bundled SwiftShader. Software rendering — see the appearance caveat above. |
| `libsecret` | Chromium's "safe storage" backend | The provider session cookie in Electron's profile (§4.1) is stored unencrypted instead, with a warning. No crash. |
| `libnotify` | Desktop notifications | Nothing — the application does not notify. |
| `libpulse` | PulseAudio | Nothing — the application is silent. |
| `libva` | Video decode acceleration | Nothing — there is no video. |
| `gtk4` | Chromium's alternative toolkit | Nothing — it links GTK 3, which is declared. |
| `libdbusmenu-glib`, `libunity` | Ubuntu global-menu and launcher integration | Nothing, and they are absent on Arch by design. |

**None of the seven is a crash risk.** So the honest expectation is that the application
launches. What the live session is still uniquely able to catch:

1. **A `dlopen` failure that is none of the above** — the list is what this binary names,
   not a promise that loading each one succeeds.
2. **GSettings schemas, MIME and icon caches, the desktop entry** — installed by the
   scriptlet, exercised only by a real desktop.
3. **The `.INSTALL` scriptlet itself**, including the `chrome-sandbox` branch, which takes
   one of two paths depending on whether user namespaces work on that kernel.
4. **The native modules doing real work** — Argon2id derivation and an encrypted SQLite
   file created from scratch on a system with no build tree. This is the heart of it.
5. **The two-minute clock**, which is an owner experience and not a machine measurement.

---

## Before you boot

- [ ] The package is `release/jadeite-1.0.0.pacman` — **92,509,208 bytes**, sha256
      `70e45bac46fff83951b85d374d4b51d780464872dd8136caafb5d7c16896828b`.
      This is the artefact `v1.0` shipped; proving *this* file is what closes X's box.
- [ ] Put it on a **second USB stick**, or on the same stick outside the ISO partition.
      Do not plan to copy it into the live filesystem from the internal disk — see below.
- [ ] **RAM.** The package is 92 MB; installed size is **333 MB**. A live session's
      overlay lives in RAM, so budget ~450 MB of tmpfs on top of the desktop. Fine on
      8 GB, tight on 4 GB.
- [ ] **Network is optional but bring it if easy.** Nothing should need downloading. If
      pacman *does* ask for a dependency, that is itself the finding — record which one,
      then `sudo pacman -Sy` to continue.
- [ ] **Do not mount the internal Linux partition at all.** The live session's `$HOME` is
      a tmpfs and cannot inherit anything from the installed system, so the risk is not a
      stale vault — it is the **build tree**. `node_modules/`, `release/linux-unpacked/`
      and the toolchain sitting one mount away are exactly the residue this exercise is
      supposed to be free of, and a reachable `node_modules/` is enough to make the run
      unquotable.

---

## In the live session

Run these in order. Record the answers in the table at the end.

### 1. Prove the environment is clean

This step licenses every claim the rest of the run makes, so it has to test the right
thing. A live session's `$HOME` is a fresh tmpfs — checking that `~/.local/share/jadeite/`
is absent proves nothing, because it could never have been there. The real contamination
risks are the **internal disk** and the **stick you are carrying the package on**.

```bash
ls /opt/JADEITE 2>&1                 # expect: No such file or directory
which jadeite 2>&1                   # expect: not found
mount | grep -iE 'ext4|btrfs|xfs'    # expect: nothing — the internal disk stays unmounted
ls -la /run/media/*/                 # expect: the .pacman, and nothing from the build tree
```

If the internal partition is mounted, unmount it before continuing. If the stick carries
a copy of `node_modules/`, `release/linux-unpacked/` or anything else from the build,
this is no longer a fresh-machine test.

### 2. Verify the package survived the trip

```bash
cd /run/media/*/          # or wherever the stick mounted
sha256sum jadeite-1.0.0.pacman
```

Must read `70e45bac46fff83951b85d374d4b51d780464872dd8136caafb5d7c16896828b`.

### 3. Start the clock, and install

```bash
date +%s                                    # note this number
sudo pacman -U ./jadeite-1.0.0.pacman
```

**Watch what pacman says about dependencies.** Three outcomes, and they mean different
things:

| What pacman does | What it means |
|---|---|
| Installs with no dependency talk | `gtk3`, `nss`, `alsa-lib` were already on the ISO. Expected. Proves nothing about the depends list on its own — that was proven separately. |
| Asks to pull one of the three from the sync db | Also fine, and slightly better evidence. Needs network + `sudo pacman -Sy`. |
| Complains about a package **not** in those three | **A finding.** The declared list is short. Write down the exact package name — this is the failure the whole exercise exists to catch. |

### 4. Check what the scriptlet did

```bash
ls -l /usr/bin/jadeite                 # symlink to /opt/JADEITE/jadeite
ls -l /opt/JADEITE/chrome-sandbox      # 0755 or 4755 — see below, record which
unshare --user true; echo $?           # record this number too
ls /usr/share/applications/jadeite.desktop
ls /usr/share/icons/hicolor/256x256/apps/jadeite.png
```

**Record the `unshare` exit code beside the mode.** The scriptlet chooses between them:
user namespaces working gives `0755`, and failing gives a SUID `4755` sandbox. Both are
correct outcomes of a correct package. But it means a live session can install into a
*different* sandbox configuration than a real install on the same machine would — so a
`chrome-sandbox` failure here is not automatically a package defect, and a clean launch
here does not prove the other branch works. Without the exit code beside it, the mode is
uninterpretable later.

### 5. Launch it the way an owner would

Open the application from the desktop menu, **not** from a terminal. The menu entry is
what a real install gives a real user, and it exercises the desktop database the
scriptlet updated. If it does not appear in the menu, that is a finding; note it, then
fall back to launching from a terminal so the rest of the run can continue.

If it fails to start, run it from a terminal to get the reason:

```bash
jadeite 2>&1 | tee ~/jadeite-launch.log
```

A line naming a `.so` that could not be opened is a **`dlopen` finding**. Check it against
the table of seven above before treating it as a defect: a complaint about `libva`,
`libpulse`, `libnotify`, `gtk4` or `libdbusmenu` is expected and harmless, and a fallback
to SwiftShader is expected too. A missing library that is *not* in that table, or one that
stops the application reaching its lock screen, is the real thing. Keep the log either way.

### 6. Reach a working vault

- [ ] The lock screen appears.
- [ ] Create a vault with a password you will not need again.
- [ ] It unlocks.
- [ ] Enter one value in any section and confirm it is there.
- [ ] `date +%s` again — subtract. **Under two minutes** from step 3 closes the box.

The Argon2id wait during create and unlock is deliberate and is not part of any
performance budget (`XJADEITE.md` §3.4 excludes it by name). It is a good sign: it means
`argon2.node` loaded and is doing 256 MiB of real work on a machine that never built it.

### 7. Confirm the vault landed where the specification says

```bash
ls -la ~/.local/share/jadeite/
ls -la ~/.config/jadeite/
```

`src/main/vault/paths.ts` puts the vault under `$XDG_DATA_HOME`, falling back to
`~/.local/share/jadeite/`; `src/main/config/app-config.ts` puts `config.json` under
`~/.config/jadeite/`. Realisation X amended §4.1 to say that Electron's own profile
lands beside `config.json` — so a directory with roughly twenty Chromium files in it is
**expected and correct**, not a defect.

### 8. Optional, and free while you are here — uninstall

Not outstanding (it passed on the laptop), but it costs thirty seconds:

```bash
sudo pacman -R jadeite
ls /opt/JADEITE /usr/bin/jadeite /usr/share/applications/jadeite.desktop 2>&1  # all gone
ls ~/.local/share/jadeite/                                                     # vault SURVIVES
```

The vault surviving removal is the rule that matters: *a package manager must never take
the owner's data with it*.

---

## Record this

Copy into `REALISATION.md` under Realisation X when you are back on the installed system.

| Check | Result |
|---|---|
| Internal disk unmounted, stick carries only the package | |
| `/opt/JADEITE` and `jadeite` absent before install | |
| Checksum matched | |
| pacman dependency behaviour (which of the three outcomes) | |
| Symlink, desktop entry, icons present | |
| `chrome-sandbox` mode (0755 / 4755) | |
| `unshare --user true` exit code | |
| Launched from the **menu** | |
| Any `.so` complaint in the log, and whether it is one of the seven | |
| Vault created and unlocked | |
| Value entered and visible | |
| **Elapsed, install → working vault** | |
| Vault at `~/.local/share/jadeite/` | |
| Uninstall left the vault (optional) | |

If everything passes, X's carried-in box is closed on evidence, and the only thing
Realisation XI inherits from X is whatever ruling gets made about the rig's cold start.

---

## Two things found on the way

Neither belongs to this session — both are **Realisation XI scope**, recorded here so
they are not rediscovered later.

**1. `argon2` already ships a Windows x64 prebuild.** The package contains
`resources/app.asar.unpacked/node_modules/argon2/prebuilds/win32-x64/argon2.glibc.node`,
alongside prebuilds for darwin-arm64, freebsd, and three Linux ARM variants. If those are
N-API builds — which the `prebuilds/` layout implies — then argon2 may need **no Visual
Studio toolchain on Windows at all**. That halves the native-module risk in XI's scope
line, and it should be verified before assuming an MSVC install is required.
`better-sqlite3-multiple-ciphers` ships no such directory and was compiled locally into
`build/Release/`, so that one is still expected to need a real Windows toolchain.

**2. The Linux package carries dead weight.** Those same prebuilds — FreeBSD, macOS ARM,
Linux ARM, musl — are shipped inside an x86-64 Arch package that can never load them, as
is `better-sqlite3-multiple-ciphers/build/Release/test_extension.node`, a test fixture.
The musl prebuild is the sole source of the `libc.musl-x86_64.so.1 => not found` line
noted above. Installed size is 333 MB. An `asarUnpack` pattern narrowed to the two
`build/Release/*.node` files that are actually loaded would cut it without touching
behaviour.
