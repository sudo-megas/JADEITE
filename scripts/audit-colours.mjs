/**
 * "No component ever hard-codes a colour" (XJADEITE §12.2), enforced.
 *
 * The palette directory is the one place permitted to name a colour literally.
 * Everywhere else must go through a token. This fails the build rather than
 * reporting, because a single stray hex is invisible in nine palettes and
 * glaring in the tenth.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SCANNED = [join(root, 'src')]
const EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.html'])

/** The only place colours may be named. */
const ALLOWED = [join('src', 'shared', 'theme', 'palettes')]

const PATTERNS = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/g },
  { name: 'rgb()', re: /\brgba?\s*\(/g },
  { name: 'hsl()', re: /\bhsla?\s*\(/g },
  { name: 'oklch() literal', re: /\boklch\s*\(\s*[\d.]/g }
]

/** Placeholders and CSS keywords that are not colours. */
const EXEMPT_LINE = [
  /XXXX-XXXX/, // the recovery-key placeholder
  /^\s*\*/, // doc comment bodies
  /^\s*\/\// // line comments
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

const findings = []

for (const base of SCANNED) {
  for (const file of walk(base)) {
    const rel = relative(root, file)
    if (ALLOWED.some((a) => rel.startsWith(a + sep) || rel === a)) continue

    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (EXEMPT_LINE.some((re) => re.test(line))) return
      for (const { name, re } of PATTERNS) {
        re.lastIndex = 0
        const match = re.exec(line)
        if (match) {
          findings.push({ file: rel, line: i + 1, name, text: match[0], source: line.trim() })
        }
      }
    })
  }
}

if (findings.length > 0) {
  console.error(`\ncolour audit FAILED — ${findings.length} literal colour(s) outside the palettes:\n`)
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.name} ${f.text}`)
    console.error(`    ${f.source}`)
  }
  console.error('\nUse a token from src/shared/theme/types.ts instead.\n')
  process.exit(1)
}

console.log('colour audit passed — every colour resolves through a token')
