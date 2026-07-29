/**
 * Realisation III acceptance, against the real workbook — run locally, by hand.
 *
 * REALISATION.md asks Section 1 to "recreate the source workbook's July 2026 row
 * shape (6 income + 10 expense columns) manually and match its arithmetic to the
 * kuruş". The committed test suite cannot do that: JADEITorigin.xlsx is
 * gitignored because it holds real financial data in legible form, and the
 * fixtures deliberately carry amounts that are nobody's.
 *
 * So the repository holds the *method* and the owner's machine holds the *data*.
 * This script reads the workbook where it actually lives, feeds its row through
 * the very engine the application uses, and checks JADEITE's two computed
 * figures against the two the sheet computed for itself with a formula copied
 * into every row. Nothing it reads is ever written down: it prints a verdict.
 *
 *   node scripts/verify-workbook.mjs              # July 2026, the acceptance row
 *   node scripts/verify-workbook.mjs --all        # every month, for forensics
 *   node scripts/verify-workbook.mjs --row 2026-07
 *
 * Exits non-zero if JADEITE and the sheet disagree anywhere they should agree.
 *
 * Where they are *expected* to disagree, that is reported rather than failed:
 * XJADEITE §18.2 records defects in the sheet itself — notably finding 2, the
 * June-2025 ELEKTRİK entered as +500.0 with the minus forgotten — and JADEITE
 * reproducing those faithfully would be the bug, not the fix.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKBOOK = join(root, 'JADEITorigin.xlsx')

/** The sheet's own columns, by letter. Column A is the month, T is the phantom. */
const INCOME_COLUMNS = ['B', 'C', 'D', 'E', 'F', 'G']
const INCOME_TOTAL_COLUMN = 'H'
const EXPENSE_COLUMNS = ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R']
const NET_TOTAL_COLUMN = 'S'

/** Excel's day zero, with the 1900 leap-year bug already baked in. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 86_400_000

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(2)
}

function unzipEntry(entry) {
  try {
    return execFileSync('unzip', ['-p', WORKBOOK, entry], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
  } catch {
    fail(
      `Could not read "${entry}" from the workbook.\n` +
        'This script shells out to unzip(1); install it, or run this on the machine that has it.'
    )
  }
}

function decodeXmlText(value) {
  return value
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function readSharedStrings() {
  const xml = unzipEntry('xl/sharedStrings.xml')
  const strings = []
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const text = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')
    strings.push(decodeXmlText(text))
  }
  return strings
}

/**
 * Read the Section 1 sheet into `{ [cellRef]: value }`.
 *
 * A cell typed `s` is a shared string — that is how the sheet's `'-'`
 * placeholders arrive, and they must become absent cells rather than zeroes
 * (§6.3, and §18.2 finding 3).
 */
function readSheet(strings) {
  const xml = unzipEntry('xl/worksheets/sheet1.xml')
  const cells = new Map()

  // Two alternatives, self-closing first and both lazy. A single pattern with a
  // greedy attribute class silently eats the following cell: given
  // `<c r="T47" s="23"/><c r="A48" ...>…</c>` the class consumes the `/`, the
  // self-closing branch fails, and the body branch then runs on to A48's
  // `</c>` — losing A48 entirely. That cost an afternoon; it is written down.
  for (const cell of xml.matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g)) {
    const attributes = cell[1] ?? cell[2] ?? ''
    const body = cell[3] ?? ''
    const ref = /r="([A-Z]+\d+)"/.exec(attributes)?.[1]
    if (!ref) continue

    const type = /t="([^"]*)"/.exec(attributes)?.[1] ?? 'n'
    const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
    if (raw === undefined) continue

    if (type === 's') {
      // A shared string in a money column is the '-' placeholder: no value.
      continue
    }
    cells.set(ref, Number(raw))
  }

  return cells
}

/** The ISO month a row's date serial denotes. */
function monthOf(cells, rowNumber) {
  const serial = cells.get(`A${rowNumber}`)
  if (serial === undefined) return null
  const date = new Date(EXCEL_EPOCH_UTC + serial * MS_PER_DAY)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return { key: `${year}-${month}`, year, month: date.getUTCMonth() + 1 }
}

/**
 * Money in the sheet is a float; JADEITE's is integer kuruş.
 *
 * Rounding here is the conversion, not a fudge: the sheet's own values are
 * two-decimal currency that floating point merely stores imperfectly.
 */
function toMinorUnits(value) {
  return Math.round(value * 100)
}

async function loadEngine() {
  const dir = mkdtempSync(join(tmpdir(), 'jadeite-verify-'))
  const outfile = join(dir, 'engine.mjs')
  await build({
    entryPoints: [join(root, 'src/shared/section1/engine.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24'
  })
  const engine = await import(`file://${outfile}`)
  return { engine, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function buildWorkspace(cells, rowNumber, month) {
  const categories = []
  const entries = []
  let id = 1

  const place = (letters, kind) => {
    for (const letter of letters) {
      const category = { id: id++, year: month.year, name: letter, kind, valueType: 'TRY', position: categories.length }
      categories.push(category)

      const value = cells.get(`${letter}${rowNumber}`)
      if (value === undefined) continue

      // The sheet writes expenses negative; JADEITE stores every amount
      // positive and lets the column's group carry the sign (§5.2). The
      // magnitude is what crosses over.
      entries.push({
        categoryId: category.id,
        month: month.month,
        amount: Math.abs(toMinorUnits(value)),
        isRefund: false,
        note: null
      })
    }
  }

  place(INCOME_COLUMNS, 'income')
  place(EXPENSE_COLUMNS, 'expense')

  return { year: month.year, accentOverride: null, categories, entries }
}

/**
 * A watch list, not a list of expected failures.
 *
 * XJADEITE §18.2 records defects in the sheet itself. Where one of them would
 * make JADEITE and the sheet disagree, that is reported rather than failed —
 * agreeing there would mean JADEITE had faithfully reproduced a defect.
 *
 * As of the workbook this was last run against, none of these trigger: §18.2
 * finding 2 describes June 2025 ELEKTRİK as `+500.0` with the minus forgotten,
 * but the cell now holds `-500.0`, so the row reconciles. The entry stays as a
 * guard in case an older copy of the workbook is ever checked, and because
 * Realisation XII's importer will need exactly this reasoning.
 */
const KNOWN_SHEET_DEFECTS = new Map([
  [
    '2025-06',
    'XJADEITE §18.2 finding 2 — ELEKTRİK recorded as +500.0 with the minus forgotten. ' +
      'If this copy of the workbook still holds the positive value, the sheet added an ' +
      'expense where it should have subtracted one, and JADEITE differs by twice it.'
  ]
])

function formatMinor(minorUnits) {
  const sign = minorUnits < 0 ? '-' : ''
  const absolute = Math.abs(minorUnits)
  const whole = String(Math.trunc(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${whole},${String(absolute % 100).padStart(2, '0')}`
}

async function main() {
  if (!existsSync(WORKBOOK)) {
    fail(
      `The workbook is not here: ${WORKBOOK}\n` +
        'It is gitignored on purpose — it holds real financial data in legible form.\n' +
        'Run this on the machine that has it.'
    )
  }

  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const requested = args.includes('--row') ? args[args.indexOf('--row') + 1] : '2026-07'

  const strings = readSharedStrings()
  const cells = readSheet(strings)
  const { engine, cleanup } = await loadEngine()

  const results = []
  try {
    for (let rowNumber = 2; rowNumber <= 200; rowNumber += 1) {
      const month = monthOf(cells, rowNumber)
      if (!month) continue
      if (!all && month.key !== requested) continue

      const sheetIncome = cells.get(`${INCOME_TOTAL_COLUMN}${rowNumber}`)
      const sheetNet = cells.get(`${NET_TOTAL_COLUMN}${rowNumber}`)
      if (sheetIncome === undefined && sheetNet === undefined) continue

      const computed = engine.computeWorkspace(buildWorkspace(cells, rowNumber, month))
      const row = computed.months.find((m) => m.month === month.month)
      const bucket = engine.bucketOf(row.buckets, 'TRY')

      results.push({
        key: month.key,
        rowNumber,
        jadeiteIncome: bucket.income,
        jadeiteNet: bucket.net,
        sheetIncome: toMinorUnits(sheetIncome ?? 0),
        sheetNet: toMinorUnits(sheetNet ?? 0)
      })
    }
  } finally {
    cleanup()
  }

  if (results.length === 0) {
    fail(`No row found for ${all ? 'any month' : requested}.`)
  }

  console.log(
    `\nJADEITE vs ${WORKBOOK.replace(root + '/', '')} — GELİR TOPLAM and GENEL TOPLAM, in kuruş\n`
  )

  let mismatches = 0
  let expected = 0

  for (const r of results) {
    const incomeOk = r.jadeiteIncome === r.sheetIncome
    const netOk = r.jadeiteNet === r.sheetNet
    const defect = KNOWN_SHEET_DEFECTS.get(r.key)

    if (incomeOk && netOk) {
      console.log(`  ok    ${r.key}  ${formatMinor(r.jadeiteIncome)}  /  ${formatMinor(r.jadeiteNet)}`)
      continue
    }

    if (defect) {
      expected += 1
      console.log(`  note  ${r.key}  differs as documented`)
      console.log(`          JADEITE ${formatMinor(r.jadeiteIncome)} / ${formatMinor(r.jadeiteNet)}`)
      console.log(`          sheet   ${formatMinor(r.sheetIncome)} / ${formatMinor(r.sheetNet)}`)
      console.log(`          ${defect}`)
      continue
    }

    mismatches += 1
    console.log(`  FAIL  ${r.key}  (sheet row ${r.rowNumber})`)
    if (!incomeOk) {
      console.log(
        `          GELİR TOPLAM: JADEITE ${formatMinor(r.jadeiteIncome)} vs sheet ${formatMinor(r.sheetIncome)}`
      )
    }
    if (!netOk) {
      console.log(
        `          GENEL TOPLAM: JADEITE ${formatMinor(r.jadeiteNet)} vs sheet ${formatMinor(r.sheetNet)}`
      )
    }
  }

  const agreed = results.length - mismatches - expected
  console.log(
    `\n  ${agreed} row(s) matched to the kuruş, ${expected} differed as §18.2 documents, ` +
      `${mismatches} unexplained.\n`
  )

  process.exit(mismatches === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
