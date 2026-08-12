/**
 * The four build-gate scripts (`scripts/audit-*.mjs`), proven against fixtures
 * that deliberately violate what each one guards — freeze audit I19.
 *
 * Every one of these scripts has passed on this repository's own tree since
 * the day it was written, which proves the tree is clean and proves nothing
 * about the gate itself: a script that always exited 0 would pass that same
 * history. What was missing is a fixture built to fail, run through the real
 * script, and checked for a non-zero exit that actually names the violation.
 *
 * Each script resolves its own scan root from `import.meta.url`
 * (`resolve(dirname(fileURLToPath(import.meta.url)), '..')`), so copying the
 * unmodified script into `<fixture>/scripts/<name>.mjs` and running it from
 * there is enough to make it audit the fixture tree rather than this
 * repository — no root-override flag, no fork of the script's logic. A flag
 * that let a security gate be pointed somewhere else would itself be most of
 * a bypass.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

interface FixtureFile {
  path: string
  content: string
}

/** Builds a throwaway tree, runs the named audit script inside it, tears it down. */
function runAudit(
  scriptName: string,
  files: readonly FixtureFile[],
  opts: { git?: boolean; unreadableDirs?: readonly string[] } = {}
): { status: number | null; stdout: string; stderr: string } {
  const fixtureRoot = mkdtempSync(join(tmpdir(), `jadeite-audit-${scriptName}-`))
  const lockedDirs = (opts.unreadableDirs ?? []).map((dir) => join(fixtureRoot, dir))
  try {
    // Both audit-egress.mjs's `walk` and audit-locale.mjs's tolerate a missing
    // directory (a try/catch around `readdirSync` that returns on ENOENT), and
    // both scan `tests/` unconditionally — an absent one would otherwise crash
    // the process instead of finding nothing. Not a fixture bug to work around
    // quietly: both are created up front so every script sees the two
    // directories the real tree always has.
    mkdirSync(join(fixtureRoot, 'src'), { recursive: true })
    mkdirSync(join(fixtureRoot, 'tests'), { recursive: true })

    for (const file of files) {
      const full = join(fixtureRoot, file.path)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, file.content)
    }

    // Created and locked last: nothing above needs to read back through a
    // directory this call is about to make unreadable to its own owner.
    for (const dir of lockedDirs) {
      mkdirSync(dir, { recursive: true })
      chmodSync(dir, 0o000)
    }

    const scriptPath = join(fixtureRoot, 'scripts', scriptName)
    mkdirSync(dirname(scriptPath), { recursive: true })
    writeFileSync(scriptPath, readFileSync(join(projectRoot, 'scripts', scriptName)))

    if (opts.git) {
      // No commit needed: `git ls-files --others --exclude-standard` lists
      // untracked-but-not-ignored files on its own, and audit-strings.mjs's
      // rule 1 only needs the file list, not a history.
      execFileSync('git', ['init', '--quiet'], { cwd: fixtureRoot })
    }

    const result = spawnSync(process.execPath, [scriptPath], { cwd: fixtureRoot, encoding: 'utf8' })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
  } finally {
    // rmSync needs to list a directory's own contents to remove them; a 000
    // mode refuses that to its own owner just as it refused the script.
    for (const dir of lockedDirs) chmodSync(dir, 0o755)
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

describe('audit-egress.mjs against a fixture (M8, L1-adjacent)', () => {
  it('passes a tree with no network capability outside the transports', () => {
    const result = runAudit('audit-egress.mjs', [
      { path: 'src/main/fine.ts', content: "export const answer = 42\n" }
    ])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('egress audit passed')
  })

  it('fails a network call sitting outside the transport modules', () => {
    const result = runAudit('audit-egress.mjs', [
      // Split so this file's own source never spells the violation contiguously
      // — `audit-egress.mjs` scans `tests/` too, and this is that script's own
      // fixture-building test, not a file it should be tripping over itself.
      { path: 'src/main/rogue.ts', content: 'fe' + "tch('https://evil.example.com/')\n" }
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('rogue.ts')
    expect(result.stderr).toContain('network call outside a transport module')
  })

  it('fails the exact M8 bypass this rung closed: a computed global reach', () => {
    const result = runAudit('audit-egress.mjs', [
      {
        path: 'src/main/sneaky.ts',
        // Same split as above, across the bracketed property name this time.
        content: "const f = globalThis['fe" + "tch']\nf('https://evil.example.com/')\n"
      }
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('reaches a network global through a computed/reflected property')
  })

  it('fails loud rather than passing quietly when a subtree of src/ cannot be read', () => {
    // `walk` recurses with its own try/catch, so an EACCES on a subdirectory
    // hits the exact same handler a genuinely-missing directory does. Only
    // ENOENT may return an empty result from there — anything else, and a
    // network call sitting in the unreadable subtree would never be seen,
    // yet the script would still print "egress audit passed" and exit 0.
    const result = runAudit(
      'audit-egress.mjs',
      [{ path: 'src/main/fine.ts', content: 'export const answer = 42\n' }],
      { unreadableDirs: ['src/main/locked'] }
    )
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toContain('egress audit passed')
  })
})

describe('audit-colours.mjs against a fixture (M11)', () => {
  it('passes a tree with no literal colour outside the palette directory', () => {
    const result = runAudit('audit-colours.mjs', [
      { path: 'src/renderer/fine.tsx', content: 'export const Fine = () => null\n' }
    ])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('colour audit passed')
  })

  it('fails a hardcoded hex colour outside the palettes', () => {
    const result = runAudit('audit-colours.mjs', [
      { path: 'src/renderer/Bad.tsx', content: "const style = { color: '#ff00aa' }\n" }
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Bad.tsx')
  })

  it('fails the exact M11 bypass this rung closed: a named CSS colour', () => {
    const result = runAudit('audit-colours.mjs', [
      { path: 'src/renderer/Named.tsx', content: "const style = { fill: 'crimson' }\n" }
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('named colour')
  })
})

const MATCHED_LOCALES = [
  {
    path: 'src/renderer/src/i18n/locales/en.ts',
    content: "export const en = {\n  about: {\n    tagline: 'Keeps the books'\n  }\n}\n"
  },
  {
    path: 'src/renderer/src/i18n/locales/tr.ts',
    content: "export const tr = {\n  about: {\n    tagline: 'Defteri tutar'\n  }\n}\n"
  }
]

describe('audit-locale.mjs against a fixture (M9, L19)', () => {
  it('passes a tree with no OS-locale read and matched catalogues', () => {
    const result = runAudit('audit-locale.mjs', [
      { path: 'package.json', content: '{"name":"fixture"}\n' },
      ...MATCHED_LOCALES,
      { path: 'src/main/fine.ts', content: "export const answer = 42\n" }
    ])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('locale audit passed')
  })

  it('fails the exact M9 bypass this rung closed: toLocale-family call with no explicit locale', () => {
    const result = runAudit('audit-locale.mjs', [
      { path: 'package.json', content: '{"name":"fixture"}\n' },
      ...MATCHED_LOCALES,
      {
        path: 'src/main/rogue.ts',
        // Split across `.toLocale`/`String(` so this line does not itself trip
        // the real audit-locale.mjs when it scans this very file under tests/.
        content: 'const s = value' + '.toLocale' + "String(undefined, { minimumFractionDigits: 2 })\n"
      }
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('no explicit locale')
  })

  it('fails a key present in one catalogue and not the other', () => {
    const result = runAudit('audit-locale.mjs', [
      { path: 'package.json', content: '{"name":"fixture"}\n' },
      {
        path: 'src/renderer/src/i18n/locales/en.ts',
        content: "export const en = {\n  about: {\n    tagline: 'x',\n    extra: 'y'\n  }\n}\n"
      },
      {
        path: 'src/renderer/src/i18n/locales/tr.ts',
        content: "export const tr = {\n  about: {\n    tagline: 'x'\n  }\n}\n"
      }
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('extra')
  })

  it('fails the L19 case: matched keys, mismatched interpolation placeholder names', () => {
    const result = runAudit('audit-locale.mjs', [
      { path: 'package.json', content: '{"name":"fixture"}\n' },
      {
        path: 'src/renderer/src/i18n/locales/en.ts',
        content: "export const en = {\n  greeting: 'hi {{count}}'\n}\n"
      },
      {
        path: 'src/renderer/src/i18n/locales/tr.ts',
        // Same key, same string shape, typo'd placeholder — the exact defect
        // L19 named as uncaught by a key-count-only comparison.
        content: "export const tr = {\n  greeting: 'merhaba {{kount}}'\n}\n"
      }
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('interpolation placeholder')
  })

  it('fails loud rather than passing quietly when a subtree of src/ cannot be read', () => {
    // Same concern as audit-egress.mjs's matching case: `walk` recurses with
    // its own try/catch, so only a genuinely-missing directory (ENOENT) may
    // return an empty result from there. An EACCES on a subdirectory must not
    // take the same silent path, or a real §13 violation sitting inside it
    // would never be seen while the script still prints "locale audit passed".
    const result = runAudit(
      'audit-locale.mjs',
      [
        { path: 'package.json', content: '{"name":"fixture"}\n' },
        ...MATCHED_LOCALES,
        { path: 'src/main/fine.ts', content: 'export const answer = 42\n' }
      ],
      { unreadableDirs: ['src/main/locked'] }
    )
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toContain('locale audit passed')
  })
})

const PASSING_STRINGS_FIXTURE: readonly FixtureFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify(
      {
        name: 'fixture',
        desktopName: 'fixture.desktop',
        homepage: 'https://example.invalid/fixture'
      },
      null,
      2
    ) + '\n'
  },
  {
    path: 'electron-builder.yml',
    content:
      'appId: com.example.fixture\n' +
      'GenericName: Fixture App\n' +
      'GenericName[tr]: Örnek Uygulama\n' +
      'synopsis: A Fixture App for testing\n'
  },
  {
    path: 'src/main/index.ts',
    content:
      "app.setName('fixture')\n" +
      "app.setAppUserModelId('com.example.fixture')\n"
  },
  {
    path: 'src/renderer/src/i18n/locales/en.ts',
    content: "export const en = {\n  about: {\n    tagline: 'Fixture App'\n  }\n}\n"
  },
  {
    path: 'src/renderer/src/i18n/locales/tr.ts',
    content: "export const tr = {\n  about: {\n    tagline: 'Örnek Uygulama'\n  }\n}\n"
  }
]

describe('audit-strings.mjs against a fixture (M10, L18)', () => {
  it('passes a tree whose launcher, package and window-class strings all agree', () => {
    const result = runAudit('audit-strings.mjs', PASSING_STRINGS_FIXTURE, { git: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('string audit passed')
  })

  it('fails the exact M10 bypass this rung closed: GenericName drifting from the real tagline', () => {
    const drifted = PASSING_STRINGS_FIXTURE.map((f) =>
      f.path === 'electron-builder.yml'
        ? { ...f, content: f.content.replace('Fixture App', 'Something Else Entirely') }
        : f
    )
    const result = runAudit('audit-strings.mjs', drifted, { git: true })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('GenericName')
  })

  it('fails a desktopName that does not match app.setName — the window-class rule', () => {
    const mismatched = PASSING_STRINGS_FIXTURE.map((f) =>
      f.path === 'package.json'
        ? { ...f, content: f.content.replace('"fixture.desktop"', '"different.desktop"') }
        : f
    )
    const result = runAudit('audit-strings.mjs', mismatched, { git: true })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('StartupWMClass')
  })

  it('fails a tracked file carrying the retired v0.9d sentence', () => {
    const withRetired = [
      ...PASSING_STRINGS_FIXTURE,
      {
        path: 'docs/stray-note.md',
        // Split so this file does not itself carry the retired sentence
        // contiguously — audit-strings.mjs's rule 1 would refuse this file too.
        content: 'Secure personal wealth and ' + 'possessions tracker\n'
      }
    ]
    const result = runAudit('audit-strings.mjs', withRetired, { git: true })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('retired at v0.9d')
  })
})
