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

/**
 * CSS's 147 named colours (`transparent` and `currentColor` excluded on
 * purpose: neither names a colour, both name an absence of one, and
 * `backgroundColor: 'transparent'` is already legitimate, existing code —
 * `sections/charts/options.ts` uses it to let the surface token show through).
 */
const NAMED_COLOURS = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
  'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
  'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
  'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
  'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
  'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
  'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
  'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
  'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
  'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
  'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue',
  'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver',
  'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue',
  'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke',
  'yellow', 'yellowgreen'
]

/**
 * Property and attribute names a colour keyword can legally follow — CSS
 * properties, their camelCase inline-style/JSX equivalents, and the SVG/HTML
 * attributes the codebase's chart and icon code uses (`fill`, `stroke`).
 *
 * Anchoring the named-colour search to these is what keeps this from lighting
 * up on every mention of the word "gold" in an application about gold prices —
 * §14's price data and its translations say "gold" constantly, in a context no
 * colour rule has any business reading.
 */
const COLOR_PROPS = [
  'color', 'background', 'background-color', 'backgroundColor',
  'border', 'border-color', 'borderColor',
  'border-top-color', 'borderTopColor', 'border-right-color', 'borderRightColor',
  'border-bottom-color', 'borderBottomColor', 'border-left-color', 'borderLeftColor',
  'outline', 'outline-color', 'outlineColor',
  'fill', 'stroke', 'stop-color', 'stopColor',
  'box-shadow', 'boxShadow', 'text-shadow', 'textShadow',
  'caret-color', 'caretColor', 'accent-color', 'accentColor'
].join('|')

const PATTERNS = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/g },
  { name: 'rgb()', re: /\brgba?\s*\(/gi },
  { name: 'hsl()', re: /\bhsla?\s*\(/gi },
  { name: 'oklch() literal', re: /\boklch\s*\(\s*[\d.]/gi },
  { name: 'lab() literal', re: /\blab\s*\(\s*[\d.]/gi },
  { name: 'lch() literal', re: /\blch\s*\(\s*[\d.]/gi },
  { name: 'oklab() literal', re: /\boklab\s*\(\s*[\d.]/gi },
  { name: 'hwb() literal', re: /\bhwb\s*\(\s*[\d.]/gi },
  {
    name: 'color() literal',
    re: /\bcolor\s*\(\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)\b/gi
  },
  {
    name: 'named colour',
    re: new RegExp(`\\b(?:${COLOR_PROPS})\\s*[:=]\\s*['"\`]?(?:${NAMED_COLOURS.join('|')})\\b`, 'gi')
  }
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
