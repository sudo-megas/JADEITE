/**
 * What the packages say about themselves — Realisation X.
 *
 * Five acceptance boxes across v0.8b, v0.9b, v0.9d and this rung are about the
 * installed artefact: the hicolor set, `GenericName` in two languages,
 * `StartupWMClass`, `Categories`, and the one-description-not-two problem that
 * v0.9d measured against a shipped `.pacman`. Grepping `tests/` and `scripts/`
 * for `hicolor|GenericName|StartupWMClass|pacman|synopsis|desktop` before this
 * file existed returned **nothing at all**. Every one of them was true, and every
 * one was true by hand.
 *
 * That is a worse position than it looks, because these are the assertions least
 * likely to survive an edit made for another reason. `Categories` was already
 * lost once — the shipped v0.9b packages read `Categories=Office;` while
 * `electron-builder.yml` appeared to ask for Finance as well, because
 * `LinuxTargetHelper` assigns that key *after* merging `desktop.entry` and
 * silently discarded the entry-level value. Nothing failed. It was found by
 * reading a built package.
 *
 * So this file reads built packages. `scripts/audit-strings.mjs` covers the
 * source side of the same invariants and runs on every build; this covers the
 * far side of fpm, where the interesting failures live, and runs when something
 * is packaged.
 *
 * **`bsdtar` is required, and that is deliberate rather than sloppy.** It is
 * what libarchive gives every Arch machine and what pacman itself reads packages
 * with, and both named rigs are Arch. A missing one fails loudly here instead of
 * being skipped past.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { projectRoot } from '../e2e/fixtures.js'

const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
  version: string
  description: string
  homepage: string
}

const releaseDir = resolve(projectRoot, 'release')
const pacmanPath = resolve(releaseDir, `jadeite-${manifest.version}.pacman`)
const debPath = resolve(releaseDir, `jadeite_${manifest.version}_amd64.deb`)

function mustExist(path: string, what: string): string {
  if (!existsSync(path)) {
    throw new Error(
      `No ${what} at ${path}. Run \`npm run package\` — this suite reads built packages ` +
        'and has nothing to say without them.'
    )
  }
  return path
}

/** One member of an archive, as text. */
function member(archive: string, entry: string): string {
  return execFileSync('bsdtar', ['-xOf', archive, entry], { maxBuffer: 64 * 1024 * 1024 }).toString(
    'utf8'
  )
}

/** One member of an archive, as bytes — for comparing images. */
function memberBytes(archive: string, entry: string): Buffer {
  return execFileSync('bsdtar', ['-xOf', archive, entry], { maxBuffer: 64 * 1024 * 1024 })
}

function entries(archive: string): string[] {
  return execFileSync('bsdtar', ['-tf', archive], { maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\n')
    .filter((line) => line !== '')
}

test.describe('the pacman package', () => {
  test('prints one description, and it names Economy Journal', () => {
    // The v0.9d finding, asserted. fpm hands `--description` the synopsis, a
    // newline and the manifest's description; `pacman.erb` writes
    // `pkgdesc = <%= description %>` on a single line, so the second line
    // becomes an orphan with no `=` and pacman drops it silently. `.PKGINFO`
    // therefore carries both and `pacman -Qip` shows the first — which is why
    // the synopsis, and not the manifest's description, is the string that has
    // to carry the name on Arch.
    const info = member(mustExist(pacmanPath, 'pacman package'), '.PKGINFO')
    const pkgdesc = info.split('\n').filter((line) => line.startsWith('pkgdesc'))

    expect(pkgdesc, '.PKGINFO should carry exactly one pkgdesc key').toHaveLength(1)
    expect(pkgdesc[0]).toContain('Economy Journal')
  })

  test('carries the repository address from the manifest', () => {
    const info = member(pacmanPath, '.PKGINFO')
    expect(info).toContain(`url = ${manifest.homepage}`)
  })

  test('declares only dependencies that exist in the repositories', () => {
    // The defect this suite was written one commit too late to catch.
    //
    // electron-builder's hardcoded pacman default names `http-parser` and
    // `libappindicator-gtk3`, and **neither is in the Arch repositories any
    // more** — Chromium replaced the first with llhttp, and the second was
    // superseded by the Ayatana fork. pacman does not warn and does not
    // degrade: it refuses the whole transaction with `could not satisfy
    // dependencies`, so the primary, installer-grade target could not be
    // installed on the primary platform.
    //
    // Nothing could see it. The package built, `pacman -Qip` printed the list
    // happily, every assertion in this file passed, and the app ran perfectly
    // from `release/linux-unpacked`. Only `pacman -U` reaches it, and the
    // owner ran that. This is the check that closes the gap, and it is cheap:
    // `pacman -Si` answers from the sync database without touching the system.
    const info = member(mustExist(pacmanPath, 'pacman package'), '.PKGINFO')
    const declared = info
      .split('\n')
      .filter((line) => line.startsWith('depend = '))
      .map((line) => line.slice('depend = '.length).trim())
      .filter((name) => name !== '')

    expect(declared.length, '.PKGINFO declares no dependencies at all').toBeGreaterThan(0)

    const missing = declared.filter((name) => {
      const probe = spawnSync('pacman', ['-Si', name], { stdio: 'ignore' })
      return probe.status !== 0
    })

    expect(missing, 'these dependencies do not exist in the repositories').toEqual([])
  })

  test('installs every icon size, byte-identical to its source', () => {
    // Byte-identity rather than "an icon exists". electron-builder resamples
    // when handed a single file, and the whole of v0.9d's icon work was to stop
    // it doing that — so a set that is present but regenerated would satisfy a
    // weaker check and lose exactly what was bought.
    const sources = readdirSync(resolve(projectRoot, 'build/icons')).filter((f) =>
      f.endsWith('.png')
    )
    expect(sources.length, 'build/icons is empty').toBeGreaterThan(0)

    const installed = entries(pacmanPath).filter((e) => /hicolor\/.*\/apps\/jadeite\.png$/.test(e))
    expect(installed, 'the package ships fewer sizes than build/icons holds').toHaveLength(
      sources.length
    )

    for (const entry of installed) {
      const size = entry.replace(/.*hicolor\//, '').replace(/\/apps.*/, '')
      const source = readFileSync(resolve(projectRoot, 'build/icons', `${size}.png`))
      expect(memberBytes(pacmanPath, entry).equals(source), `${size} is not byte-identical`).toBe(
        true
      )
    }
  })
})

test.describe('removal cannot reach the owner’s data', () => {
  /**
   * The static half of the most consequential box in `REALISATION.md`.
   *
   * "Uninstall … leaves the vault where it is — a package manager must never
   * take the owner's data with it." Whether that holds is finally an
   * owner-observed question, because only an install-then-remove answers it.
   * But two thirds of it can be decided from the package itself, and this is
   * the failure that would be unforgivable rather than inconvenient: the vault
   * is the thing the entire application exists to keep.
   *
   * A scriptlet is where it would happen. electron-builder generates
   * `post_install` / `post_remove` from templates that this project does not
   * write, and a future `linux.fpm` option, an added `afterRemove` hook, or an
   * upstream template change could put an `rm -rf` somewhere near `$HOME`
   * without anybody here deciding it. Both halves are checked: nothing in the
   * scriptlets names the owner's directories, and nothing in the payload is
   * installed outside the two system prefixes.
   */
  const DATA_PATHS = [
    '.local/share/jadeite',
    '.config/jadeite',
    'XDG_DATA_HOME',
    'XDG_CONFIG_HOME',
    'jadeite.db',
    'jadeite.keys',
    '$HOME',
    '~/'
  ]

  test('no install or removal scriptlet names the vault or the config directory', () => {
    const scriptlets = member(mustExist(pacmanPath, 'pacman package'), '.INSTALL')

    for (const path of DATA_PATHS) {
      expect(scriptlets, `a scriptlet names ${path}`).not.toContain(path)
    }
  })

  test('the payload installs only under /opt and /usr', () => {
    // A file laid down anywhere else is removed from anywhere else, and the
    // package has no business outside these two prefixes.
    const stray = entries(pacmanPath)
      .filter((entry) => !entry.startsWith('.'))
      .filter((entry) => !entry.startsWith('opt/') && !entry.startsWith('usr/'))

    expect(stray, 'the package installs outside /opt and /usr').toEqual([])
  })
})

test.describe('the desktop entry', () => {
  const keys = (): Map<string, string> => {
    const text = member(mustExist(pacmanPath, 'pacman package'), 'usr/share/applications/jadeite.desktop')
    const map = new Map<string, string>()
    for (const line of text.split('\n')) {
      const at = line.indexOf('=')
      if (at > 0) map.set(line.slice(0, at), line.slice(at + 1))
    }
    return map
  }

  test('claims the window class the running window reports', () => {
    // `app.setName('jadeite')` is the app_id; `desktopName` minus its suffix is
    // what electron-builder writes here. `audit-strings.mjs` proves those two
    // agree in the source. This proves the value survived the packager.
    expect(keys().get('StartupWMClass')).toBe('jadeite')
  })

  test('names the application in both languages, and says what it does in neither', () => {
    const entry = keys()
    expect(entry.get('Name')).toBe('JADEITE')
    expect(entry.get('GenericName')).toBe('Economy Journal')
    expect(entry.get('GenericName[tr]')).toBe('Ekonomi Defteri')

    // The freedesktop rule the whole naming split exists to honour: a Comment
    // must restate neither Name nor GenericName.
    const comment = entry.get('Comment') ?? ''
    expect(comment).toBe(manifest.description)
    expect(comment).not.toContain('JADEITE')
    expect(comment).not.toContain('Economy Journal')

    const turkish = entry.get('Comment[tr]') ?? ''
    expect(turkish, 'the Turkish tooltip is missing').not.toBe('')
    expect(turkish).not.toBe(comment)
  })

  test('is filed under both categories', () => {
    // Lost once already: `LinuxTargetHelper` assigns Categories *after* merging
    // `desktop.entry`, so an entry-level value is discarded and only
    // `linux.category` reaches the file. v0.9b shipped `Office;` alone.
    expect(keys().get('Categories')).toBe('Office;Finance;')
  })
})

test.describe('the deb package', () => {
  test('shows a synopsis and a distinct extended line, neither repeating the other', () => {
    // `apt show` prints `control`'s Description field: its first line is the
    // synopsis and the indented remainder is the extended description. Neither
    // named rig carries apt or dpkg — they are Arch — so the field is read from
    // the package rather than from a tool that cannot be run here. It is the
    // same field either way.
    const control = execFileSync(
      'sh',
      [
        '-c',
        `bsdtar -xOf '${mustExist(debPath, 'deb package')}' control.tar.xz | bsdtar -xOf - ./control`
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    ).toString('utf8')

    const lines = control.split('\n')
    const at = lines.findIndex((line) => line.startsWith('Description:'))
    expect(at, 'no Description field').toBeGreaterThanOrEqual(0)

    const synopsis = lines[at]!.replace('Description:', '').trim()
    const extended = (lines[at + 1] ?? '').trim()

    expect(synopsis).toContain('Economy Journal')
    expect(extended, 'the extended description is missing').not.toBe('')
    expect(extended, 'the two lines repeat each other').not.toBe(synopsis)
    expect(extended).toBe(manifest.description)
    expect(control).toContain(`Homepage: ${manifest.homepage}`)
  })
})
