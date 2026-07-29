/**
 * Realisation IV's first acceptance line, against the workbook itself.
 *
 * REALISATION.md asks Section 2 to "reproduce the source's inspected state
 * (6 banks, counter columns Sayaç A/Sayaç B/Sayaç C) and match: grand total debt
 * ₺48,271.63, total remaining limit ₺1,240,596.08 — with the engine, not
 * formulas". The committed test suite cannot do that: JADEITorigin.xlsx is
 * gitignored because it holds real financial data in legible form.
 *
 * So the repository holds the *method* and the owner's machine holds the
 * *data*, exactly as scripts/verify-workbook.mjs does for Realisation III.
 * Nothing this script reads is ever written down: it prints a verdict.
 *
 * The engine is not reimplemented here. src/shared/section2/engine.ts is
 * bundled and called, so what this proves is what the application computes.
 *
 *   node scripts/verify-payments.mjs             # the two acceptance figures
 *   node scripts/verify-payments.mjs --months    # every month line, for forensics
 *   node scripts/verify-payments.mjs --december  # what a value in F would do to the sheet
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKBOOK = join(root, 'JADEITorigin.xlsx')

/** Section 2 lives on the second worksheet; Section 1 is on the first. */
const SHEET = 'xl/worksheets/sheet2.xml'

/** The sheet's own columns, by letter. Column B is the month label. */
const BANK_COLUMNS = ['C', 'D', 'E', 'F', 'G', 'H']
const COUNTER_COLUMNS = ['J', 'K', 'L']
const TOTAL_DEBT_COLUMN = 'I'

const NAME_ROW = 2
/** Credit limits for the banks; the person's name for a counter column (§7.1). */
const LIMIT_ROW = 3
const MONTH_ROWS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const DEBT_ROW = 18
/** The sheet's second, independent list of bank names. */
const SECOND_NAME_ROW = 21
const REMAINING_ROW = 22
const TOTAL_REMAINING_CELL = 'C23'

/** Fixed: paid/pending state does not enter any figure compared here. */
const TODAY = { year: 2026, month: 7 }

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
    .replace(/&#10;/g, ' / ')
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
 * Read the Payments sheet into numbers and labels, keyed by cell reference.
 *
 * Two alternatives, self-closing first and both lazy. A single pattern with a
 * greedy attribute class silently eats the following cell — the same trap
 * scripts/verify-workbook.mjs records, and one this script fell into once more
 * while it was being written. It is worth the four extra characters.
 */
function readSheet(strings) {
  const xml = unzipEntry(SHEET)
  const numbers = new Map()
  const labels = new Map()

  for (const cell of xml.matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g)) {
    const attributes = cell[1] ?? cell[2] ?? ''
    const body = cell[3] ?? ''
    const ref = /r="([A-Z]+\d+)"/.exec(attributes)?.[1]
    if (!ref) continue

    const type = /t="([^"]*)"/.exec(attributes)?.[1] ?? 'n'
    const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
    if (raw === undefined) continue

    if (type === 's') {
      labels.set(ref, strings[Number(raw)] ?? '')
      continue
    }
    numbers.set(ref, Number(raw))
  }

  return { numbers, labels }
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
  const dir = mkdtempSync(join(tmpdir(), 'jadeite-verify-s2-'))
  const outfile = join(dir, 'engine.mjs')
  await build({
    entryPoints: [join(root, 'src/shared/section2/engine.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24'
  })
  const engine = await import(`file://${outfile}`)
  return { engine, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/**
 * Build the grid JADEITE would hold, from the cells the sheet holds.
 *
 * Columns are named by their letter rather than by the sheet's own headers.
 * That is not laziness: row 2 gives two pairs of columns the same name, which
 * `UNIQUE (year, name)` refuses outright — and naming them by letter keeps the
 * owner's institutions out of a script that prints to a terminal.
 *
 * The sheet stores counter values negative. JADEITE stores every amount
 * positive and lets `is_counter` carry the sign (§5.2, §7.1), so the magnitude
 * is what crosses over — the same transform verify-workbook.mjs applies to the
 * sheet's negative expenses.
 */
function buildGrid(numbers, extraCells = []) {
  const banks = []
  const cells = []
  let id = 1

  const place = (letters, isCounter) => {
    for (const letter of letters) {
      const bank = {
        id: id++,
        year: TODAY.year,
        name: letter,
        creditLimit: isCounter ? 0 : toMinorUnits(numbers.get(`${letter}${LIMIT_ROW}`) ?? 0),
        position: banks.filter((b) => b.isCounter === isCounter).length,
        isCounter,
        counterParty: isCounter ? letter : null
      }
      banks.push(bank)

      MONTH_ROWS.forEach((rowNumber, index) => {
        const value = numbers.get(`${letter}${rowNumber}`)
        if (value === undefined) return
        cells.push({ bankId: bank.id, month: index + 1, amount: Math.abs(toMinorUnits(value)) })
      })
    }
  }

  place(BANK_COLUMNS, false)
  place(COUNTER_COLUMNS, true)

  for (const extra of extraCells) {
    const bank = banks.find((b) => b.name === extra.column)
    if (bank) cells.push({ bankId: bank.id, month: extra.month, amount: extra.amount })
  }

  return { year: TODAY.year, archived: false, accentOverride: null, banks, cells }
}

/**
 * A watch list, not a list of expected failures.
 *
 * Where XJADEITE §18.2 records a defect *in the sheet*, disagreement is
 * reported rather than failed — agreeing there would mean JADEITE had
 * faithfully reproduced a defect.
 *
 * Both entries here currently agree numerically, because column F holds
 * nothing in this copy of the workbook. That agreement is luck, not design:
 * the formulas still omit F, and one value in it parts them. So both print a
 * note either way, and `--december` shows exactly what that value would cost.
 */
const KNOWN_SHEET_DEFECTS = new Map([
  [
    `${TOTAL_DEBT_COLUMN}16`,
    'XJADEITE §18.2 finding 1 — the December TOTAL DEBT formula omits column F.'
  ],
  [
    `${TOTAL_DEBT_COLUMN}${DEBT_ROW}`,
    'XJADEITE §18.2 finding 1 — the GRAND TOTAL DEBT formula omits column F for the same reason.'
  ]
])

function formatMinor(minorUnits) {
  const sign = minorUnits < 0 ? '-' : ''
  const absolute = Math.abs(minorUnits)
  const whole = String(Math.trunc(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${whole},${String(absolute % 100).padStart(2, '0')}`
}

function compare(results, ref, label, jadeite, sheet) {
  results.push({ ref, label, jadeite, sheet })
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
  const allMonths = args.includes('--months')
  const december = args.includes('--december')

  const strings = readSharedStrings()
  const { numbers, labels } = readSheet(strings)

  const missing = [TOTAL_DEBT_COLUMN + DEBT_ROW, TOTAL_REMAINING_CELL].filter(
    (ref) => !numbers.has(ref)
  )
  if (missing.length > 0) {
    fail(
      `The sheet has no cached value for ${missing.join(' and ')}.\n` +
        'A workbook re-saved by a tool that strips cached formula results leaves\n' +
        'formulas with no figures, and there is nothing here to compare against.'
    )
  }

  const { engine, cleanup } = await loadEngine()
  const results = []
  let computed

  try {
    computed = engine.computeGrid(buildGrid(numbers), TODAY)

    if (allMonths) {
      computed.months.forEach((line, index) => {
        const ref = `${TOTAL_DEBT_COLUMN}${MONTH_ROWS[index]}`
        compare(results, ref, `TOPLAM BORÇ ${index + 1}`, line.totalDebt, toMinorUnits(numbers.get(ref) ?? 0))
      })
    }

    computed.banks.forEach((column) => {
      const letter = column.bank.name
      compare(
        results,
        `${letter}${DEBT_ROW}`,
        `BORÇ ${letter}`,
        column.debt,
        toMinorUnits(numbers.get(`${letter}${DEBT_ROW}`) ?? 0)
      )
      compare(
        results,
        `${letter}${REMAINING_ROW}`,
        `KALAN LİMİT ${letter}`,
        column.remaining,
        toMinorUnits(numbers.get(`${letter}${REMAINING_ROW}`) ?? 0)
      )
    })

    compare(
      results,
      `${TOTAL_DEBT_COLUMN}${DEBT_ROW}`,
      'GRAND TOTAL DEBT',
      computed.grandTotalDebt,
      toMinorUnits(numbers.get(`${TOTAL_DEBT_COLUMN}${DEBT_ROW}`))
    )
    compare(
      results,
      TOTAL_REMAINING_CELL,
      'TOTAL REMAINING LIMIT',
      computed.totalRemainingLimit,
      toMinorUnits(numbers.get(TOTAL_REMAINING_CELL))
    )

    console.log(`\nJADEITE vs ${WORKBOOK.replace(root + '/', '')} sheet 2 — §7.1's figures, in kuruş\n`)

    let mismatches = 0
    let noted = 0

    for (const r of results) {
      const defect = KNOWN_SHEET_DEFECTS.get(r.ref)
      const agrees = r.jadeite === r.sheet

      if (agrees && !defect) {
        console.log(`  ok    ${r.label.padEnd(24)} ${formatMinor(r.jadeite)}`)
        continue
      }
      if (defect) {
        noted += 1
        console.log(`  note  ${r.label.padEnd(24)} ${formatMinor(r.jadeite)}`)
        console.log(`          sheet ${r.ref} = ${formatMinor(r.sheet)}${agrees ? ' — agrees today' : ''}`)
        console.log(`          ${defect}`)
        if (agrees) {
          console.log('          They agree only because column F is empty in this copy.')
        }
        continue
      }

      mismatches += 1
      console.log(`  FAIL  ${r.label.padEnd(24)} JADEITE ${formatMinor(r.jadeite)} vs sheet ${formatMinor(r.sheet)} (${r.ref})`)
    }

    // The bank list the sheet keeps twice, compared where it sits.
    const diverged = BANK_COLUMNS.filter(
      (letter) => labels.get(`${letter}${NAME_ROW}`) !== labels.get(`${letter}${SECOND_NAME_ROW}`)
    )
    if (diverged.length > 0) {
      console.log(
        `\n  note  the sheet names ${diverged.length} column(s) differently in row ${NAME_ROW} ` +
          `and row ${SECOND_NAME_ROW}: ${diverged.join(', ')}.`
      )
      console.log(
        '          One list of banks kept in two places, already disagreeing — the defect'
      )
      console.log('          §7.1 makes unrepresentable. Found in the file, not assumed.')
    }

    if (december) {
      const probe = 1_000_00
      const raised = engine.computeGrid(
        buildGrid(numbers, [{ column: 'F', month: 12, amount: probe }]),
        TODAY
      )
      const sheetWould = toMinorUnits(numbers.get(`${TOTAL_DEBT_COLUMN}${DEBT_ROW}`))
      console.log(`\n  --december: with ${formatMinor(probe)} placed in column F's December cell,`)
      console.log(`          JADEITE's grand total becomes ${formatMinor(raised.grandTotalDebt)},`)
      console.log(`          while the sheet's own I18 would still read ${formatMinor(sheetWould)}.`)
      console.log(`          The formula omits F, so the sheet would be short by exactly ${formatMinor(probe)}.`)
      console.log('          Nothing was written to the workbook; this was computed in memory.')
    }

    console.log(
      `\n  ${results.length - mismatches - noted} figure(s) matched to the kuruş, ` +
        `${noted} noted against §18.2, ${mismatches} unexplained.\n`
    )

    process.exit(mismatches === 0 ? 0 : 1)
  } finally {
    cleanup()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
