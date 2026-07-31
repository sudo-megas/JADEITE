/**
 * What the About page states about the build, checked where it can be.
 *
 * Deliberately narrow. `__APP_VERSION__` and `__RELEASE_DATE__` are substituted
 * by `electron.vite.config.ts`, and `vitest.config.ts` is a separate config with
 * no `define`, so both are undefined here — asserting on them would fail for a
 * reason that has nothing to do with what is being tested. Mirroring the
 * `define` into the vitest config would fix that and prove nothing: both configs
 * would be reading the same `package.json`, so the assertion would compare a
 * value to itself. The rendered version is asserted in `tests/e2e/about.spec.ts`
 * instead, where the real bundle is running.
 *
 * What is worth checking here is the part a release can actually get wrong: the
 * hand-maintained date beside the version, and that it survives §13's format.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { formatDate } from '../../src/renderer/src/i18n/format.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string
  releaseDate: string
  license: string
  homepage: string
}

describe('the release date the About page prints', () => {
  it('is present in the manifest beside the version', () => {
    expect(manifest.releaseDate).toBeTypeOf('string')
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is stored as ISO-8601, per §5.2', () => {
    expect(manifest.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(manifest.releaseDate))).toBe(false)
  })

  it('reads GG/AA/YYYY in both languages, per §13', () => {
    for (const language of ['tr', 'en'] as const) {
      expect(formatDate(manifest.releaseDate, language)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    }
  })

  it('is not in the future', () => {
    // Parsed the way `formatDate` parses it — `new Date('YYYY-MM-DD')` is UTC
    // midnight while `Date.now()` is absolute, so a bare `Date.parse` fails for
    // three hours every morning at UTC+3 on a date that is perfectly correct.
    expect(new Date(`${manifest.releaseDate}T00:00:00`).getTime()).toBeLessThanOrEqual(Date.now())
  })
})

describe('the repository address the About page prints', () => {
  it('is in the manifest, so the packages and the page read one string', () => {
    // Realisation X. This is the field `electron.vite.config.ts` compiles into
    // `__REPOSITORY_URL__` and the field electron-builder hands fpm as pacman's
    // `url` and the deb's `Homepage:`, and it is asserted here because its
    // absence has two failure modes and neither of them is loud.
    //
    // Without it electron-builder falls back to reading `.git/config`'s origin
    // remote, which is not in the repository: a git worktree keeps `.git` as a
    // *file* and has no such path, and a source tarball — how an AUR build
    // works — has no `.git` at all. Both abort the build with `Please specify
    // project homepage`, at packaging time, which is the last moment anybody
    // looks. And when it does resolve, the address on the About page and the
    // address in the package listing are two independent statements of one
    // fact, free to drift the way the application's *name* did before v0.9d.
    expect(manifest.homepage).toBeTypeOf('string')
    expect(manifest.homepage).toMatch(/^https:\/\//)
  })

  it('is the address, without the .git suffix a clone URL carries', () => {
    // What shipped in the v0.9.2 packages, via hosted-git-info's normalisation
    // of the clone URL. Pinned so the manifest's value cannot quietly become
    // the clone form and change what `pacman -Qip` prints.
    expect(manifest.homepage).toBe('https://github.com/sudo-megas/JADEITE')
  })
})

describe('the licence the About page offers to show', () => {
  const licence = readFileSync(resolve(root, 'LICENSE'), 'utf8')

  it('is the GPL-3.0 the manifest declares, by name as well as by text', () => {
    // Both halves matter. The file proves the *text* is the GPL; `license`
    // proves the identifier the About page prints beside it still agrees. Check
    // only the file and a relicence passes silently once the file is swapped,
    // leaving `GPL-3.0-only` printed over the top of some other licence.
    expect(manifest.license).toBe('GPL-3.0-only')
    expect(licence).toContain('GNU GENERAL PUBLIC LICENSE')
    expect(licence).toContain('Version 3, 29 June 2007')
  })

  it('is whole, so the page cannot show a truncated notice', () => {
    expect(licence.length).toBeGreaterThan(30_000)
  })
})
