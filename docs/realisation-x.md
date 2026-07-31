# Realisation X — Linux Finalisation

Companion notes to `REALISATION.md` and `XJADEITE.md`. The rung with no feature in it.
Every one before this added something the owner could point at; this one is the first
whose whole subject is the *artefact* — what gets installed, what it says about itself
to a package manager, and whether the thing that runs on a machine that never built it
is the thing the tests were run against.

That turns out to be a different discipline, and the difference is worth stating at the
top. Nine rungs of tests all shared one assumption: that the application under test is
`out/` on disk, with `node_modules/` complete beside it, started by a development
Electron. Every acceptance box above this one is true of *that*. None of them is a
statement about a `.pacman` file, and five of the defects below were invisible from
inside that assumption. One stopped the build outright the first time anybody tried to
package from somewhere other than the original clone. And one — section 7 — was found
by the owner, after everything here was green, when `pacman -U` refused to install the
package at all: the target this rung calls *primary, installer-grade* had never once
been installable, and no instrument in the repository was pointed at the question.

---

## 1. The package was three times the size it needed to be, and reading the config could not prove otherwise

The measurement recorded at v0.9c was that `app.asar` held 98.2 MB across 1510 files
and that the largest entries were not runtime code. Re-measured here it is 68 MB of
asar plus 31 MB of unpacked sidecar across 1769 entries, and the composition is exact:

| In the asar | Size | Why it is there | Why it is never read |
|---|---:|---|---|
| `echarts` | 58 MB | named in `dependencies` | bundled into the renderer chunk |
| `zrender` | 4.7 MB | echarts draws through it | same chunk |
| `@tanstack/react-table` | 4.1 MB | named in `dependencies` | same chunk |
| `better-sqlite3-multiple-ciphers/deps/` | 14 MB | the SQLite C amalgamation | the app loads the `.node` |
| `…/build/Release/obj/` | 14 MB | what the compiler left behind | as above |
| `…/src/` | 172 KB | the C++ binding source | as above |

The first three are one finding wearing three names. `electron.vite.config.ts` applies
`externalizeDepsPlugin()` to `main` and to `preload`, and to nothing else — so the
renderer's Rollup build inlines what it imports, while electron-builder goes on copying
the packages because they are listed in `dependencies` and that is the only question it
asks. Both halves are true at once and neither is wrong on its own terms.

**The premise was checked before the exclusion was written**, because it is exactly the
kind of claim that is obviously true and occasionally false. If Vite had *not* inlined
echarts, excluding it would have produced an application that packages cleanly and
white-screens on the Altın Eğrisi. The packaged renderer chunk carries `ECharts` (48
occurrences), `getZr` (24), `getCoreRowModel` (17) and `flexRender` (7) as compiled
code, and no `require('echarts')` or `from 'echarts'` survives anywhere in it.

### What was deliberately not excluded

`prebuild-install`, `detect-libc`, `semver`, `readable-stream`, `node-addon-api`,
`node-gyp-build` and the rest come to under 1 MB together and look every bit as dead as
the 66.8 MB above them. They stay. argon2 resolves its binary through `node-gyp-build`
and better-sqlite3 through `bindings`, and both of those walk a list of candidate paths
at *require* time rather than importing a fixed one — so "is this package reachable?"
is not a question static reading answers. The remaining megabyte is the price of not
finding out at unlock time on the owner's laptop.

### The verification is a suite, because reading the list back proves nothing

Two failure modes needed covering and neither is visible to any test that existed.

The first is an exclusion one directory too wide: builds, packages, installs, throws at
unlock. The second is quieter — **a negation pattern that matches nothing is not an
error in electron-builder, it is silence.** A typo in `!**/node_modules/echarts/**/*`
produces a successful build, a fat package, and a config file that reads as though the
slimming happened.

So `tests/package/packaged.spec.ts` starts the built binary, runs the first-run
ceremony — which is the native-module question, since it derives an Argon2id hash and
creates a SQLCipher database, one from each of the two modules — opens all six
destinations, and then reads the asar back with `@electron/asar` to assert that the six
excluded paths are gone and that `out/main/index.js`, `out/renderer/index.html`,
`package.json` and `build/icon.png` remain. It sits under its own Playwright config and
outside `tests/e2e/`, because it needs a packaging run that takes minutes and a suite
that slow stops being run if the ordinary loop pays for it. It **refuses rather than
skips** when there is no packaged application: a packaging suite that quietly passes on
a machine that never packaged anything reports the one thing it exists to check as
checked.

### Result

| | before | after |
|---|---:|---:|
| `app.asar` | 68 MB | **4.4 MB** |
| `app.asar.unpacked` | 31 MB | **3.9 MB** |
| entries in the asar | 1769 | **456** |
| installed size (`pacman -Qip`) | 408.78 MiB | **318.10 MiB** |
| `.pacman` on disk | 99.63 MiB | **88.22 MiB** |
| `.deb` on disk | 112.0 MB | **97.3 MB** |

The honest reading of the last three rows is that JADEITE's own contribution fell from
99 MB to 8.3 MB — a factor of twelve — and the install fell by 22%, because the
remaining 310 MB is Electron and no `files:` list argues with a framework. The scope
line said "about three times the size it needs to be" and was measuring the asar; of
the *install*, it was never going to be.

---

## 2. A fact that lived in `.git/config`

`npm run package` failed on its first run in this rung, and the error was neither
subtle nor about anything that had changed:

```
⨯ Please specify project homepage
```

`package.json` has never carried a `homepage`. The v0.9.2 packages carry
`url = https://github.com/sudo-megas/JADEITE` regardless, because electron-builder falls
back to `getRepositoryInfo`, which reads `<projectDir>/.git/config` and parses the
`[remote "origin"]` stanza. That had worked every time anyone had ever packaged, and it
works only because of where they were standing.

It reads `.git` **as a directory**. In a git worktree `.git` is a *file* holding a
`gitdir:` pointer, so there is no `.git/config` beneath the project directory and
resolution returns null. The same is true of a source tarball, which has no `.git` at
all — and a source tarball is precisely how an AUR build works, which the owner has
already asked about for after the ladder. The field the outside world reads was a
property of the clone rather than of the project, and the build aborted anywhere the
clone was not the original one.

The second half of the finding is the one worth more. `AboutPanel.tsx` held
`const REPOSITORY_URL = 'https://github.com/sudo-megas/JADEITE'` as a literal. So the
address on the Hakkında page and the address in the package listing were **two
independent statements of one fact**, and one of them was not in the repository. This
is the shape v0.9d fixed for the application's *name*, where the About page said
*Ekonomi Defteri* and every launcher said something else; and it is the shape
`electron.vite.config.ts` already argues against in its own comment about reading
`LICENSE` rather than copying it, "because two copies of a licence is exactly how they
drift apart".

The fix is the mechanism already there: `homepage` in the manifest, compiled into
`__REPOSITORY_URL__` beside `__APP_VERSION__` and `__RELEASE_DATE__`, read by the About
page and handed to fpm by the packager. One string, in the repository, in the file that
already holds the version it must move with.

---

## 3. Three sentences the code had stopped honouring

The conformance sweep against `XJADEITE.md` produced five findings. Two were resolved
by amending the specification and three by changing the code, and the split was decided
one way in every case: **when a spec sentence describes a decision, the code is what
moves.**

### `will-navigate` admitted more than "this application's own files"

§3.3 states the navigation rule three times, and states it categorically. The predicate
behind it accepted any URL whose scheme was in
`{file:, devtools:, blob:, data:, chrome-extension:}` — three of which are not this
application's files. That set is correct for the *request* gate, which genuinely needs
`data:` and `blob:` for images, and the two gates had been sharing it since
Realisation VII split `isPermittedRequest` off for exactly this class of reason.

Nothing was exploitable. A `blob:` document is same-origin with the `file:` renderer and
confers no privilege it lacks; Chromium refuses top-level `data:` navigation on its own
account; a packaged build loads no extension. That is *why* it wanted narrowing rather
than a note: every one of those is a fact about today's Chromium, and §3.3 is a
decision this application made. Weakening a thrice-stated security sentence to match
code that had drifted from it is the wrong repair at v1.0.

Navigation now has `NAVIGABLE_SCHEMES = {file:, devtools:}`; the request path keeps the
wider set unchanged. `devtools:` stays because it is Chromium's own inspector rather
than a document the renderer could be persuaded into, and refusing it would break the
developer tools in a build that has them. Three tests in `egress-suite.ts` assert the
two gates answer *differently* — each pairing a "still fetchable" with a "not
navigable", since either assertion alone is satisfied by a gate that is simply broken.

### Two IPC handlers were exempt from a rule that says no handler is

§3.3's hardening amendment: "**No handler is exempt from the guard**, including the two
that answer while locked." Forty-four of the forty-six `ipcMain.handle` registrations
are wrapped. `vault:status` and `vault:lock` were not.

Neither leaks anything today — the throw paths were traced rather than assumed — and
that would ordinarily make this a note. What made it worth two lines is that
`vault.lock()` runs every registered `onLock` listener **synchronously inside the
handler**, so the unguarded path is inherited by every listener anyone writes from now
on, and an exception escaping one is serialised into the renderer's rejected `invoke()`
with its message attached, which is the precise failure the clause was written after.

Neither could use `guarded()`, which answers `{ok: false, error}` to channels that carry
no `Result`. `vault:status` falls back to `{exists: true, locked: true}`: `locked` never
grants anything, and `exists` sends a renderer that cannot be told the truth to the
unlock screen rather than to the first-run ceremony — the wrong one to guess at, being
the screen that offers to make a vault. `vault:lock` swallows, because the renderer
asked for the vault to be shut and the one thing it must not learn is why that went
wrong on a machine it cannot see; `lock()` closes the database, drops the handle and
zeroises the key *before* it calls a single listener, so a throw reaching the handler
means a listener misbehaved afterwards, not that the vault is still open.

### A comment stating a number that had been wrong for four rungs

`drift.ts` said `MAX_UNIT_PRICE` "caps a typed price at ₺100.000". §19 raised it to
₺500.000 during Realisation VII. The constant is right; the sentence around it was
arguing that the scaled comparison stays inside safe-integer range, and that argument
holds *a fortiori* at the larger bound — the headroom is 10⁴·³ at ₺500.000 and was
10⁴·⁹ at ₺100.000. So the sentence went on being true while its number was false, which
is how a stale comment survives a test suite.

### The two amended instead

§4.1 said the config directory "contains exactly one app-managed file". Counted on a
machine that has run the application it holds **22 — `config.json`, and the 21 Chromium
wrote**: `app.setName('jadeite')` makes Electron resolve `userData` to the same path, so
the whole profile — `Cookies`, `Local State`, `Preferences`, `Cache/`, `Crashpad/`,
`DawnWebGPUCache/` and the rest — lands beside it, with the singleton lock files
joining them while the app is running. Moving `userData` at
v1.0 to make a sentence true would relocate the provider session cookie of §14.2 for no
gain to the owner. The sentence is corrected instead, to *one JADEITE-managed file*,
which is the distinction the three rules under it were always about.

§13 still said language "is a setting inside the vault" after the configuration split of
2026-07-29 moved it to `config.json` — where §4.1 and §16.6 have both said it lives
since, for the reason the split exists at all: a setting the lock screen needs cannot
live behind the lock. The code has followed §4.1 since Realisation II. §13 was simply
the straggler, and its other half (Turkish by default) was always honoured.

---

## 4. The freeze, and why the count had to be measured last

§13's two catalogues have been held in step by `locale-parity` since Realisation IX,
whose count assertion was a **floor** — `>= 443` — for a stated and correct reason: keys
arrive with every rung, and an equality would turn each new string into a failing test.

Realisation X is where they stop arriving, so the floor becomes an equality. An
equality is the assertion a floor could never make: **it fails when the catalogues
grow.** That is what a freeze is.

The order matters more than the change. The tree held 444 keys against a floor of 443,
which is the exact hazard the floor's own comment documents — one key could be deleted
from *both* files with every parity check still green, because parity holds when both
sides lose the same key. Pinning 444 would have frozen in two dead keys instead:

- `overview.yearNet` — a label for a figure the Overview year card renders bare.
- `section3.liveSkipped` — superseded by `section3.refreshTooSoon`, which ships the same
  sentence with the same `{{seconds}}`, and left behind.

Four translation defects went with them, all invisible to a parity test that compares
keys and placeholders rather than meaning:

- `section2.newParty` offered *annem* as its example in the **English** catalogue — the
  mirror of the defect parity exists to catch, a Turkish word in an English window.
- `backup.candidateApp` read "Written by JADEITE" over a version number it never named,
  while the Turkish correctly said *Yazan JADEITE sürümü*.
- `section3.drift.unpriced` said in Turkish what `section3.unpriced` had already said
  differently, on the same screen, where English had one phrasing for both.

**442**, measured after the fixing. Fix, then measure, then pin — pinning what happened
to be there is how a freeze preserves the thing it was supposed to catch.

### What was left alone, deliberately

Five English strings spell plurals as `row(s)`; moving them to i18next `_one`/`_other`
would add five keys to both catalogues and Turkish needs no plural agreement after a
numeral, so the Turkish side is already correct and only English reads as a draft. The
recovery-key mask is a literal `XXXX-XXXX-…` while the date mask is a catalogue key.
Section 2's delete confirmation says "Delete column", the same words as the menu item
that opened it, where Section 1 says "Delete permanently". None of these is wrong; each
is a matter of taste, and a freeze is a bad moment to spend the owner's taste for them.
They are written down here so that leaving them is a decision rather than an oversight.

---

## 5. A task that was invented by a paraphrase

X's scope carried: *"what remains here is the truth table's placement, since §15 scoped a
page and what was built is a component inside Yedekleme."*

§15 does not mention the truth table. §4.4 holds it, as a *verbatim contract*; §19's
register maps it to §4.4; §17.1 scopes the Hakkında page and does not put it there. The
word *page* is Realisation IX's own, in `REALISATION.md` — its scope line reads "In-app
'Credentials & Backup Truth Table' page" and its acceptance "Truth-table page ships in
Turkish and English" — and v0.9d then attributed that word to `XJADEITE.md`, where it
has never appeared.

What shipped is `TruthTable.tsx` inside Yedekleme, carrying §4.4's three rows, the
mandated post-change backup prompt, the honest limitation about stolen old backups, and
the live recovery-key generation — which the contract cannot carry, being a fact about
this vault rather than about the design. `tests/e2e/backup.spec.ts` proves it in both
languages. There is nothing to move.

The general lesson is the one this rung kept meeting: **a paraphrase of a specification
is not the specification**, and the cost of the drift is not usually a wrong build. It
is a task that stays on a list, gets scheduled, and would have been *done* — some
component moved to a destination nothing asked for — had one grep not been run first.

---

## 6. Everything about the packages was true by hand

The regression pass classified the 108 acceptance boxes above this rung: 81 behavioural,
24 one-time release gates, 2 owner-observed, 1 struck. Of the 81, the largest uncovered
cluster turned out to be the one this rung is *about*.

Grepping `tests/` and `scripts/` for
`hicolor|GenericName|StartupWMClass|pacman|synopsis|desktop` returned **nothing at all**.
The hicolor set (v0.9d), `GenericName` in two languages (v0.9d), `StartupWMClass`
(v0.9b), `Categories` (v0.9b), the one-description-not-two finding (v0.9d) and the
retired description string (v0.9d) were every one of them true, and every one of them
true because nobody had edited the files since.

That is the weakest position an assertion can occupy, and this project already has the
proof: `Categories` was **lost once**. The shipped v0.9b packages read `Categories=Office;`
while `electron-builder.yml` appeared to ask for Finance as well, because
`LinuxTargetHelper` assigns that key *after* merging `desktop.entry` and silently
discards the entry-level value. Nothing failed. It was found by reading a built package,
by hand, later.

They are checked on both sides of fpm now, because the two sides fail differently.

**The source side** is `scripts/audit-strings.mjs`, which joins the three audits already
gating `npm run build`. Three rules: a retired sentence stays retired; the name pair
`Economy Journal` / `Ekonomi Defteri` is the same pair in every file that carries it; and
`desktopName` minus its suffix equals `app.setName(...)`, which is the invariant
`package.json`'s comment has explained at length and nothing has ever enforced. Only the
third guards a behaviour — a mismatch means the desktop entry claims a window class no
window reports, and a taskbar cannot pair the running application with its own icon.

Writing it turned up a small, characteristic thing. v0.9d's box reads *"No tracked file
says «Secure personal wealth and possessions tracker»"* — and quotes the sentence in
order to forbid it, in a tracked file. Read literally the box was unsatisfiable, in the
same way X's regression line had been before v0.9d rewrote it, and the only edit that
would satisfy it is deleting the box. So the audit exempts the two governing documents,
on the ground that a ledger of retired sentences has to be able to name them, and the box
now says *states as the application's description*.

**The far side** is `tests/package/metadata.spec.ts`, which reads the built `.pacman` and
`.deb`: one `pkgdesc`, naming *Economy Journal*; the manifest's `homepage` as pacman's
`url` and the deb's `Homepage:`; every hicolor size **byte-identical** to `build/icons/`,
because a set that is present but regenerated would satisfy a weaker check and lose
exactly what v0.9d bought; the four desktop keys; and the deb's synopsis with an extended
line that repeats neither it nor itself.

It also takes the static half of the most consequential box in the document — *uninstall
leaves the vault where it is*. That one finally needs a human, because only
install-then-remove answers it. But two thirds can be decided from the package: no
install or removal scriptlet names `.local/share/jadeite`, `.config/jadeite`, `$HOME` or
either vault file, and nothing in the payload installs outside `/opt` and `/usr`. Those
scriptlets are generated from electron-builder's templates, which this project does not
write and does not review at every upgrade — so an `rm -rf` arriving near `$HOME` is not
a thing anybody here would decide, which is precisely why it wants an assertion.

---

## 7. The package did not install, and nothing in the repository could have said so

Everything above this section was green — 509 unit, 250 vault, 111 e2e, 24 package tests,
four build audits — when the owner ran the first `pacman -U` and got:

```
warning: cannot resolve "http-parser", a dependency of "jadeite"
error: failed to prepare transaction (could not satisfy dependencies)
```

electron-builder's pacman target hardcodes its depends list, and two of the fourteen names
in it **no longer exist in the Arch repositories**: `http-parser`, which Chromium replaced
with llhttp, and `libappindicator-gtk3`, superseded by the Ayatana fork. pacman does not
warn about an unresolvable dependency and does not install a degraded package. It refuses
the transaction. So the target this rung calls *primary, installer-grade* was uninstallable
on the primary platform — and had been through every release the ladder has made.

**Why no suite saw it.** Each of the obvious instruments answers a question next to this
one. The package *builds*. `pacman -Qip` prints the dependency list without evaluating it.
The application runs perfectly from `release/linux-unpacked`, because that is a directory
and not a package. `tests/package/` reads the built `.pacman` — and read it for a
description, an icon set and four desktop keys, none of which is a dependency. The only
instrument that reaches it is the package manager being asked to actually do the thing,
and the only person who could ask was the owner.

That is the argument for the install boxes being owner-observed, made much better than
this document made it in section 8. The distance between *the artefact is correct* and
*the artefact installs* is not a formality.

**The replacement was measured, not chosen.** Every ELF object under `opt/JADEITE` walked
with `ldd`, the bundled libraries subtracted, each remaining `.so` mapped to its owning
package with `pacman -Qo`: 94 libraries, 68 packages. Reduced to the members that nothing
else in the set pulls in transitively, it is three — `gtk3`, which carries the entire GTK,
X11, Wayland, cairo, pango and libcups tree beneath it; `nss`, which carries nspr; and
`alsa-lib`.

**What `ldd` cannot see was checked separately**, because a `dlopen` leaves nothing in the
dynamic table. The binary carries `libnotify.so.4`, `libsecret-1.so.0`, `libcups.so.2` and
`libpulse.so.0` as strings — Chromium's notification, keyring, printing and audio paths.
None is declared, and that is a statement rather than an omission: this application shows
no notification, has no tray, plays no sound, and §16.1 forbids a printing pipeline
outright. Declaring them would make the package demand libraries for features the
specification prohibits. `libxss` is dropped for the opposite reason to the two dead
names — it is a perfectly real package that the binary never asks for, because Chromium
stopped reading the X11 screensaver extension for idle time, which `src/main/idle.ts`
takes from `powerMonitor` instead.

The deb keeps electron-builder's defaults. They name real Debian packages, so that target
is not broken, and they are over-generous in exactly the way described above — but
correcting them means guessing Debian names with no Debian machine to test on, and an
untested dependency list is the thing this section is about.

It is asserted now: `tests/package/metadata.spec.ts` probes every declared dependency with
`pacman -Si`. Run against the v0.9.2 package it reports both dead names; against 1.0.0 it
passes.

---

## 8. The census that governed the regression line, recounted

X's regression line reads "every *behavioural* acceptance box above still passes,
release gates excepted", and v0.9d justified its satisfiability with a census: twenty
release gates, six already false, three subjective boxes marked owner-observed. All
three numbers are wrong against the document that contains them.

| claim | actual | why |
|---|---|---|
| twenty release gates | **24** | 15 `Tag`, 9 `package.json reads` |
| six already false | **nine**, at 1.0.0 | eight at v0.9d's own 0.9.3 |
| three owner-observed | **two** | lines 83 and 215 |

The cause is ordinary and worth naming: v0.9d computed the census, then *added four
gates of its own* — v0.8c's retrospective pair and its own pair — and described the
document as it had been before it edited it. The counts are mechanical
(`grep -c '^- \[ \] Tag '` and its sibling), and they are recorded in X's scope with the
commands beside them, so the next rung checks rather than inherits.

---

## 9. What this rung could not do, and why it is not pretending to

Five acceptance boxes are owner-observed, and they are the five that need a human and
two named machines:

- **Fresh install to working vault in under two minutes**, and the "on a machine that
  never built it" half of the slimming box. A suite running beside the build tree proves
  the artefact; it cannot prove the absence of the tree. Since the laptop is where this
  was built, the machine that has never built it is now the **main rig** — the two halves
  of that clause have swapped places from what everyone assumed.
- **Uninstall leaves the vault where it is.** This one is the most consequential in the
  document and the least testable here — it asserts that a package manager does not take
  the owner's data with it, and the only honest way to know is to install, create a
  vault, uninstall, and look. It was not attempted on the owner's live system.
- **Upgrade-in-place** over an earlier version.
- **Cold start on the main rig**: ≤ 1.5 s on CachyOS. The *laptop* half is done, and
  which machine that is deserves stating: this rung was built and tested on the
  **Arch/Niri laptop**, not on the rig. Every measurement above comes from there. The
  packaged application reaches the lock screen in **721 ms** on it — §3.4 allows that
  machine 3 s, and `tests/package/packaged.spec.ts` asserts the *rig's* 1.5 s and passes.
  So the ceiling that "has never been asserted anywhere" has now been asserted, on the
  slower of the two machines, and it is CachyOS that is unmeasured against an installed
  1.0.0 package.
- **The visual sweep**: ten palettes at 1440p and at 1080p. Screenshots are generated
  from the packaged binary as *evidence*, not as a verdict — "renders beautifully" was
  correctly refused a mechanical criterion at Realisation VIII and is refused one here.

`v1.0` is therefore **not tagged by this work**. Every machine-checked box is verified
and every artefact is built; the rung ends when the owner has run the five above on the
two rigs. Tagging on their behalf would put the ladder's most consequential claim — that
the application is realised on Linux — on evidence nobody gathered.

One consequence to carry forward: `package.json` reads `releaseDate: 2026-07-31`,
because a release date must not be in the future and `about.test.ts` asserts it. **If
`v1.0` is tagged on a different day, that field moves with it** — §17.1 puts the two
values beside each other precisely so they are edited together.
