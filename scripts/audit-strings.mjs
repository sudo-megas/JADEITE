/**
 * The strings the outside world reads, held to each other — Realisation X.
 *
 * Three of `REALISATION.md`'s acceptance boxes are about text that never runs:
 * what a launcher prints, what `pacman -Qip` prints, and what the window
 * manager matches a window against. Nothing checked any of them. They were true
 * when they were written and stayed true by nobody editing the files, which is
 * not the same as being enforced — and the two point revisions before this one
 * exist precisely because a string in one file stopped agreeing with a string in
 * another and no test could see it.
 *
 * Four rules, each the mechanical half of a box that had none. *(A fourth was
 * added at Realisation XI, when the port gave rule 3 a Windows counterpart.)*
 *
 * **1. A retired sentence stays retired.** v0.9d's box reads "No tracked file
 * says *Secure personal wealth and possessions tracker*". A box phrased as an
 * absence is exactly the kind that quietly becomes false: the string comes back
 * in a copied config block or a restored paragraph and nothing anywhere objects.
 *
 * **2. The name pair is the same pair everywhere.** v0.9c let the application
 * call itself *Ekonomi Defteri* on screen while every launcher said something
 * else, and v0.9d fixed it by hand across three files. This is that fix,
 * asserted rather than remembered.
 *
 * **3. `StartupWMClass` matches the app id.** `package.json`'s comment already
 * explains this at length — `desktopName` minus its suffix must equal
 * `app.setName(...)`, or the desktop entry claims a window class no window has
 * and a taskbar cannot pair the running application with its own icon. The
 * comment is the only thing that has ever enforced it, and a comment is not an
 * enforcement. This is the one rule here that guards a *behaviour*: the other
 * two guard sentences.
 *
 * **4. `AppUserModelID` matches `appId`.** Rule 3 on the other platform, and the
 * same failure with a different symptom. Windows pairs a pinned shortcut with a
 * running window by AppUserModelID and nothing else; NSIS stamps the shortcut
 * from `electron-builder.yml`'s `appId`, and the window reports whatever
 * `app.setAppUserModelId(...)` was given. When they disagree, pinning the
 * application yields a second, dead icon beside the live one — a coupling
 * between a YAML key and a call site with nothing between them to notice.
 *
 * Scanning is over `git ls-files --cached --others --exclude-standard`, so the
 * subject is what the working tree is about to build rather than only what is
 * already committed — a drafted-but-not-yet-`git add`-ed file ships the moment
 * `npm run build` runs over it, commit or no commit. `node_modules/` and
 * `release/` are gitignored and so are never read; `LICENSE` is skipped because
 * the GPL is not ours to audit for phrasing.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const findings = []

function read(relative) {
  return readFileSync(resolve(root, relative), 'utf8')
}

// --- 1. Retired strings ------------------------------------------------------

/**
 * Sentences this project has stopped saying, and the rung that retired each.
 *
 * Kept as a list rather than a single constant because it is the shape the next
 * one will arrive in, and because naming the revision makes a failure
 * self-explaining: whoever trips this needs to know it was a decision.
 */
const RETIRED = [
  {
    text: 'Secure personal wealth and possessions tracker',
    retiredBy: 'v0.9d',
    insteadSee: "package.json's description and electron-builder.yml's synopsis"
  }
]

/**
 * The files a retired sentence is allowed to appear in.
 *
 * This script names every retired string by definition and would otherwise be
 * the one file that always fails. The two governing documents are the more
 * interesting exemption: they are where this project records what it has
 * stopped saying, and **a ledger of retired sentences has to be able to name
 * them.** v0.9d's box reads "No tracked file says *Secure personal wealth and
 * possessions tracker*" — and quotes the sentence in order to forbid it, in a
 * tracked file, so read literally the box is unsatisfiable in the same way
 * Realisation X's regression line was before v0.9d rewrote it. What it means,
 * and what is enforced here, is that no file *states this as the application's
 * description*. `LICENSE` is exempt because the GPL is not ours to edit.
 */
const EXEMPT = new Set([
  'scripts/audit-strings.mjs',
  'LICENSE',
  'REALISATION.md',
  'XJADEITE.md'
])

/**
 * The rung companions, `docs/realisation-*.md`, on the same ground as the two
 * governing documents: they are where a decision is written down, and a
 * retired sentence cannot be explained without being quoted. This rule found
 * `docs/realisation-x.md` quoting it while describing the trap, which is the
 * argument making itself.
 *
 * Deliberately narrow, and the exclusions matter more than the inclusion.
 * `docs/usereadme.md` is the brief for the repository's `README.md` and is
 * **not** exempt — a retired sentence surviving there would propagate straight
 * into the one file the outside world reads first, which Realisation XI writes.
 * Nor is any future `README.md`, for the same reason. Narration is exempt;
 * anything anybody is meant to read as a description of the application is not.
 */
const isRungCompanion = (path) => /^docs\/realisation-[a-z]+\.md$/.test(path)

/**
 * The tracked-or-about-to-be-tracked file list, or `null` where there is no
 * repository to ask.
 *
 * `--cached --others --exclude-standard` rather than a bare `git ls-files`:
 * the bare form lists only what is already committed, but `npm run build`
 * bundles whatever is sitting in the working tree, tracked or not. A file
 * drafted and not yet `git add`-ed still ships if the build runs before the
 * commit does, so a retired sentence typed into it would pass this rule right
 * up until the moment it stopped being new — `--others --exclude-standard`
 * adds exactly that gap back in, while still honouring `.gitignore` so
 * `node_modules/` and `release/` are not walked by hand a second time.
 *
 * `git ls-files` exits non-zero outside a checkout, and a source tarball is
 * exactly that — which is the case Realisation X spent a manifest field
 * fixing, after electron-builder's own `.git/config` read aborted the build
 * there. Reintroducing the same assumption in the same rung, in the script
 * that enforces the fix, would be a poor joke.
 *
 * Rule 1 is *about* what the repository ships, so outside a repository it has
 * no subject and is skipped. Rules 2 and 3 read named files and are unaffected,
 * so the audit still does most of its job. The skip is announced rather than
 * silent: an audit that quietly checks less than it says is worse than one that
 * fails.
 */
function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .split('\n')
      .filter((path) => path !== '' && !EXEMPT.has(path) && !isRungCompanion(path))
  } catch {
    return null
  }
}

const tracked = trackedFiles()

if (tracked === null) {
  console.warn(
    'string audit: no git checkout here, so the retired-sentence rule has nothing to ' +
      'enumerate and is skipped. The name pair and the window class are still checked.'
  )
}

for (const path of tracked ?? []) {
  let source
  try {
    source = readFileSync(resolve(root, path), 'utf8')
  } catch {
    // A binary file, or one deleted since `git ls-files` was asked. Neither is
    // this audit's business.
    continue
  }
  // A NUL byte means this is a PNG or similar, read as UTF-8. Skipped rather
  // than scanned: a match inside binary noise would be a false positive, and a
  // miss inside it is not a sentence anybody reads.
  if (source.includes('\u0000')) continue

  for (const { text, retiredBy, insteadSee } of RETIRED) {
    const line = source.split('\n').findIndex((l) => l.includes(text))
    if (line !== -1) {
      findings.push({
        where: `${path}:${line + 1}`,
        why: `says "${text}", retired at ${retiredBy} — see ${insteadSee}`
      })
    }
  }
}

// --- 2. The name pair --------------------------------------------------------

/**
 * The tagline as the app itself says it — `about.tagline` in each catalogue —
 * rather than a second, hardcoded copy of the same two strings living in this
 * script. A hardcoded copy is exactly the failure mode rule 2 exists to catch
 * everywhere else: a string that can drift from what actually ships, with
 * nothing to notice. `npm run build` never opens this file, so a copy here
 * would only ever be caught by an e2e run nobody wires into CI.
 *
 * Same deliberately-small-reader approach as `yamlValue` below: one regex for
 * one line, not a TypeScript parser. `about.tagline` appears exactly once in
 * each locale file today, so the line match is unambiguous.
 */
function taglineFrom(localeFile) {
  const match = /\btagline:\s*['"]([^'"]+)['"]/.exec(read(localeFile))
  return match ? match[1] : null
}

const NAME_EN = taglineFrom('src/renderer/src/i18n/locales/en.ts')
const NAME_TR = taglineFrom('src/renderer/src/i18n/locales/tr.ts')

if (NAME_EN === null || NAME_TR === null) {
  findings.push({
    where: 'src/renderer/src/i18n/locales/{en,tr}.ts',
    why: 'no about.tagline found in one or both locale files — the name-pair rule has nothing to compare the launcher strings against'
  })
}

const builderYml = read('electron-builder.yml')

/**
 * A deliberately small reader rather than a YAML dependency.
 *
 * The three keys wanted are top-level-ish scalars on their own line, and adding
 * a parser to the dependency tree to read three strings would cost more than it
 * explains — `js-yaml` is not currently a dependency of this project and §1's
 * argument against carrying what is used once applies to build tooling too.
 */
function yamlValue(key) {
  const match = new RegExp(`^\\s*${key.replace(/[[\]]/g, '\\$&')}:\\s*(.+)$`, 'm').exec(builderYml)
  return match ? match[1].trim() : null
}

// Skipped, rather than compared against a placeholder, when a tagline is
// missing above: that is already its own finding, and comparing every launcher
// string against the literal text "null" would only bury it under noise.
if (NAME_EN !== null && NAME_TR !== null) {
  for (const [key, expected] of [
    ['GenericName', NAME_EN],
    ['GenericName[tr]', NAME_TR]
  ]) {
    const actual = yamlValue(key)
    if (actual !== expected) {
      findings.push({
        where: 'electron-builder.yml',
        why: `${key} is ${actual === null ? 'absent' : `"${actual}"`}, expected "${expected}" — the launcher must name the application what the About page does (§17.1)`
      })
    }
  }

  const synopsis = yamlValue('synopsis')
  if (synopsis === null || !synopsis.includes(NAME_EN)) {
    findings.push({
      where: 'electron-builder.yml',
      why: `synopsis must carry "${NAME_EN}" — pacman prints it alone, because pacman.erb writes pkgdesc on one line and drops fpm's second (v0.9d)`
    })
  }
}

// --- 3. The window class -----------------------------------------------------

const manifest = JSON.parse(read('package.json'))
const mainSource = read('src/main/index.ts')

const appId = /app\.setName\(\s*['"]([^'"]+)['"]\s*\)/.exec(mainSource)?.[1] ?? null
const desktopName = (manifest.desktopName ?? '').replace(/\.desktop$/, '')

if (appId === null) {
  findings.push({
    where: 'src/main/index.ts',
    why: 'no app.setName(...) call found — StartupWMClass cannot be checked against the app id'
  })
} else if (appId !== desktopName) {
  findings.push({
    where: 'package.json',
    why: `desktopName is "${manifest.desktopName}" (→ "${desktopName}") but app.setName is "${appId}". electron-builder writes StartupWMClass from desktopName, and Electron derives the window's app_id from the same field, so a mismatch means the entry claims a class no window ever reports`
  })
}

// --- 4. The Windows taskbar identity -----------------------------------------

const builderAppId = /^appId:\s*(\S+)\s*$/m.exec(builderYml)?.[1] ?? null
const userModelId = /app\.setAppUserModelId\(\s*['"]([^'"]+)['"]\s*\)/.exec(mainSource)?.[1] ?? null

if (builderAppId === null) {
  findings.push({
    where: 'electron-builder.yml',
    why: 'no appId — NSIS has nothing to stamp a shortcut with, and the Windows half of rule 3 cannot be checked'
  })
} else if (userModelId === null) {
  findings.push({
    where: 'src/main/index.ts',
    why: `no app.setAppUserModelId(...) call found. Windows pairs a pinned shortcut with a running window by AppUserModelID alone, and NSIS stamps the shortcut with "${builderAppId}" — without the matching call the window reports something else and pinning produces a second, dead icon`
  })
} else if (userModelId !== builderAppId) {
  findings.push({
    where: 'src/main/index.ts',
    why: `app.setAppUserModelId is "${userModelId}" but electron-builder.yml's appId is "${builderAppId}". NSIS writes the shortcut from appId and Windows matches the window against the AppUserModelID, so a mismatch unpins the application from its own icon`
  })
}

if (manifest.homepage === undefined) {
  findings.push({
    where: 'package.json',
    why: "no homepage — electron-builder falls back to .git/config's origin remote, which is not a tracked file and is absent from every worktree and every source tarball (Realisation X)"
  })
}

// --- Verdict -----------------------------------------------------------------

if (findings.length > 0) {
  console.error(`\nstring audit FAILED — ${findings.length} finding(s):\n`)
  for (const f of findings) console.error(`  ${f.where}  ${f.why}`)
  console.error('\nWhat the outside world reads is decided in three files and must agree in all three.\n')
  process.exit(1)
}

console.log('string audit passed — the outward names agree and the retired sentence is gone')
