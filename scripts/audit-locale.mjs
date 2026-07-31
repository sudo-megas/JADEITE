/**
 * "The app must never read the OS locale" (XJADEITE §13, the owner's explicit
 * prohibition), enforced.
 *
 * Three ways that promise could quietly break, all checked here:
 *
 *   1. a language-detector package creeping into the dependency tree;
 *   2. `toLocaleString()` and friends called with no locale, which silently
 *      falls back to the operating system's;
 *   3. an `Intl` constructor given `undefined` — the same trap, spelled out.
 *
 * And a fourth, from the other half of §13: Turkish is the primary language, so
 * a key added to `en.ts` and forgotten in `tr.ts` is not a missing string but a
 * silent English sentence in a Turkish window — i18next falls back without a
 * word. That belongs to this script and not only to the suite because
 * `npm run audit` gates `npm run build` and the suite does not: a half-
 * translated catalogue must not survive as far as a package.
 *
 * The check here is deliberately coarse — this script reads text and never
 * imports application code, which is what keeps it from needing a TypeScript
 * parser. The structural comparison, which can import both modules and name
 * every key on the wrong side, is tests/unit/locale-parity.test.ts.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const findings = []

// --- 1. forbidden dependencies -------------------------------------------

const FORBIDDEN_DEPS = [
  'i18next-browser-languagedetector',
  'i18next-electron-language-detector',
  'os-locale'
]

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const declared = { ...pkg.dependencies, ...pkg.devDependencies }
for (const name of FORBIDDEN_DEPS) {
  if (name in declared) {
    findings.push({ file: 'package.json', line: 0, why: `forbidden dependency "${name}"` })
  }
}

// --- 2 and 3. locale-less formatting -------------------------------------

const EXTENSIONS = new Set(['.ts', '.tsx'])

const PATTERNS = [
  {
    why: 'toLocaleString/toLocaleDateString/toLocaleTimeString with no explicit locale',
    re: /\.toLocale(?:String|DateString|TimeString)\s*\(\s*\)/
  },
  {
    why: 'Intl constructor with an undefined locale (uses the OS locale)',
    re: /new\s+Intl\.\w+\s*\(\s*undefined/
  },
  {
    why: 'Intl constructor with no locale argument (uses the OS locale)',
    re: /new\s+Intl\.\w+\s*\(\s*\)/
  },
  { why: 'navigator.language read', re: /navigator\s*\.\s*languages?\b/ },
  { why: 'app.getLocale() read', re: /\bapp\s*\.\s*getLocale(?:CountryCode)?\s*\(/ },
  {
    why: 'LANG / LC_ALL environment read',
    re: /env\s*\[\s*['"](?:LANG|LC_ALL|LC_TIME|LANGUAGE)['"]/,
    // Application code only. The tests set these variables on purpose, to
    // prove the app ignores them — that is the §13 acceptance check itself.
    appCodeOnly: true
  }
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'out') continue
      walk(full, out)
    } else if (EXTENSIONS.has(full.slice(full.lastIndexOf('.')))) {
      out.push(full)
    }
  }
  return out
}

for (const dir of [join(root, 'src'), join(root, 'tests')]) {
  const isAppCode = dir.endsWith('src')
  for (const file of walk(dir)) {
    const rel = relative(root, file)
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/^\s*(\*|\/\/)/.test(line)) return
        for (const { why, re, appCodeOnly } of PATTERNS) {
          if (appCodeOnly && !isAppCode) continue
          if (re.test(line)) findings.push({ file: rel, line: i + 1, why, source: line.trim() })
        }
      })
  }
}

// --- 4. the two catalogues carry the same keys ----------------------------

const LOCALES = join(root, 'src', 'renderer', 'src', 'i18n', 'locales')

/**
 * Every property name declared in a catalogue, duplicates kept.
 *
 * Names without their paths: without parsing TypeScript this script cannot know
 * that `errors` under `section1` is a different `errors` from the one at the
 * top level. Comparing the two multisets still catches the mistake that
 * actually happens — a key written on one side and forgotten on the other,
 * which changes a count — and deliberately does not catch a key moved between
 * namespaces, which leaves the counts equal. Anchored on `\s*` rather than a
 * fixed indent, so re-indenting the files cannot make this fail; it does assume
 * one property per line, which is how both catalogues are written throughout.
 */
function propertyNames(file) {
  const names = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*(\*|\/\/)/.test(line)) continue
    const match = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(line)
    if (match) names.push(match[1])
  }
  return names
}

function tally(file) {
  const counts = new Map()
  for (const name of propertyNames(file)) counts.set(name, (counts.get(name) ?? 0) + 1)
  return counts
}

const inEnglish = tally(join(LOCALES, 'en.ts'))
const inTurkish = tally(join(LOCALES, 'tr.ts'))

for (const name of [...new Set([...inEnglish.keys(), ...inTurkish.keys()])].sort()) {
  const en = inEnglish.get(name) ?? 0
  const tr = inTurkish.get(name) ?? 0
  if (en !== tr) {
    findings.push({
      file: relative(root, LOCALES),
      line: 0,
      why: `key "${name}" appears ${en} time(s) in en.ts and ${tr} time(s) in tr.ts`,
      parity: true
    })
  }
}

if (findings.length > 0) {
  console.error(`\nlocale audit FAILED — ${findings.length} finding(s):\n`)
  for (const f of findings) {
    console.error(`  ${f.file}${f.line ? ':' + f.line : ''}  ${f.why}`)
    if (f.source) console.error(`    ${f.source}`)
  }
  console.error('')
  if (findings.some((f) => !f.parity)) {
    console.error('Pass an explicit locale from the app language (see i18n/format.ts).')
  }
  if (findings.some((f) => f.parity)) {
    console.error('Every key belongs in both catalogues; run tests/unit/locale-parity.test.ts,')
    console.error('which names the missing keys in full rather than counting them.')
  }
  console.error('')
  process.exit(1)
}

console.log('locale audit passed — the OS locale is never consulted, and tr.ts and en.ts agree')
