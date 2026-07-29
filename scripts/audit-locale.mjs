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

if (findings.length > 0) {
  console.error(`\nlocale audit FAILED — ${findings.length} way(s) the OS locale could leak in:\n`)
  for (const f of findings) {
    console.error(`  ${f.file}${f.line ? ':' + f.line : ''}  ${f.why}`)
    if (f.source) console.error(`    ${f.source}`)
  }
  console.error('\nPass an explicit locale from the app language (see i18n/format.ts).\n')
  process.exit(1)
}

console.log('locale audit passed — the OS locale is never consulted')
