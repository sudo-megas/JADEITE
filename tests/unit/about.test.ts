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
    expect(Date.parse(manifest.releaseDate)).toBeLessThanOrEqual(Date.now())
  })
})

describe('the licence the About page offers to show', () => {
  const licence = readFileSync(resolve(root, 'LICENSE'), 'utf8')

  it('is the GPL-3.0 text the manifest claims', () => {
    expect(manifest).toMatchObject({ version: expect.any(String) })
    expect(licence).toContain('GNU GENERAL PUBLIC LICENSE')
    expect(licence).toContain('Version 3, 29 June 2007')
  })

  it('is whole, so the page cannot show a truncated notice', () => {
    expect(licence.length).toBeGreaterThan(30_000)
  })
})
