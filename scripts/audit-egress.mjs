/**
 * "This is the only permitted network egress in the entire application"
 * (XJADEITE §14), enforced.
 *
 * Realisation VII gave JADEITE a network stack for the first time. The danger is
 * not the provider — it is the second one, added later by someone who needed to
 * fetch just one thing and did not think of themselves as widening a security
 * posture. So the transport modules are named here, and any network capability
 * appearing anywhere else fails the build.
 *
 * Two rules, because a call-name denylist alone is porous: someone who imports
 * `node:net` or `node:tls` and writes their own client trips nothing. The
 * specifier rule catches the import; the call rule catches the globals, which
 * have no import to catch.
 *
 * `tests/` is scanned too. A test that reaches the network is the same defect as
 * app code that does — REALISATION.md rule 6 says every acceptance check is
 * reproducible with figures typed by hand, and a suite that phones a third party
 * is neither reproducible nor polite.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SCANNED = [join(root, 'src'), join(root, 'tests')]
const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs', '.mts', '.cts'])

/**
 * The only files permitted to speak to a network, and the one permitted to name
 * a provider URL. Everything else in the application asks these for data.
 */
const TRANSPORTS = [
  join('src', 'main', 'prices', 'haremaltin', 'socket.ts'),
  join('src', 'main', 'prices', 'haremaltin', 'history.ts')
]

/** Where a provider URL may be written down. */
const URL_HOMES = [...TRANSPORTS, join('src', 'main', 'prices', 'hosts.ts')]

/**
 * Files that must name a network capability in order to refuse or prove it:
 * the chokepoint, the session filter, and the suites that test them.
 */
const GUARDS = [
  join('src', 'main', 'prices', 'egress.ts'),
  join('src', 'main', 'security', 'session.ts'),
  join('tests', 'electron', 'egress-suite.ts'),
  join('tests', 'unit', 'egress.test.ts'),
  join('tests', 'e2e', 'hardening.spec.ts')
]

// A static specifier and a dynamic `import(...)` of the same module are the same
// capability — the loader does not care which syntax asked for `node:https`, and
// neither should this. Both forms are matched by the same alternation.
const IMPORT_RE =
  /(?:from|import)\s*\(?\s*['"](?:node:)?(net|tls|http|https|http2|dgram|dns)['"]|require\(\s*['"](?:node:)?(net|tls|http|https|http2|dgram|dns)['"]\s*\)/
const PACKAGE_RE =
  /(?:from|import)\s*\(?\s*['"](undici|ws|axios|node-fetch|got|socket\.io-client|superagent|request)['"]/
const CALL_RE =
  /\bnew\s+WebSocket\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b|\bEventSource\b|\bnet\.request\s*\(|\bnet\.fetch\s*\(|\bsession\.fetch\s*\(|\bnavigator\.sendBeacon\b/
// The exact evasion this was written against: `Reflect.get(globalThis, 'fetch')`
// and `globalThis['fetch']` both reach the same global the name-matcher above
// looks for, through a spelling that never writes the identifier `fetch(`.
const GLOBAL_ACCESS_RE =
  /\bglobalThis\s*\[\s*['"](fetch|WebSocket|XMLHttpRequest|EventSource)['"]\s*\]|Reflect\.get\s*\(\s*globalThis\s*,\s*['"](fetch|WebSocket|XMLHttpRequest|EventSource)['"]/
const GLOBAL_UA_RE = /\bapp\.userAgentFallback\b|\.setUserAgent\s*\(/
const PROVIDER_URL_RE = /\b(?:https?|wss?):\/\/[^\s'"`]*haremaltin[^\s'"`]*/

/** A single-line `//` comment. Nothing meaningful can follow `//` on its own line. */
const LINE_COMMENT_RE = /^\s*\/\//
/**
 * A JSDoc/block-comment continuation line: an asterisk, not immediately
 * followed by the slash that would close the comment.
 */
const BLOCK_COMMENT_CONTINUATION_RE = /^\s*\*(?!\/)/
// A line that closes a block comment. Only the closing marker itself is
// comment — code placed after it on the same line is live. The old rule
// exempted the whole line because it also starts with `*`, which is exactly
// the bypass this splits out: only the matched prefix is stripped before the
// rest of the line is scanned.
const BLOCK_COMMENT_CLOSE_RE = /^\s*\*\//

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (err) {
    // Only a missing directory is tolerated — `tests/`, most concretely,
    // need not exist for the audit to have an honest answer about the
    // directory that does. Anything else (EACCES, a name colliding with a
    // non-directory, ...) must not be swallowed the same way: this function
    // also recurses into every subdirectory it finds, so silently returning
    // here on a real error would drop that whole subtree from the scan —
    // and this script has no other filesystem check to catch the gap, so a
    // dropped subtree means a real network call could pass unseen.
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return out
    throw err
  }
  for (const entry of entries) {
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

const inList = (rel, list) => list.some((a) => rel === a || rel.startsWith(a + sep))

const findings = []

for (const base of SCANNED) {
  for (const file of walk(base)) {
    const rel = relative(root, file)
    const isTransport = inList(rel, TRANSPORTS)
    const isGuard = inList(rel, GUARDS)
    // A guard has to name the URLs it refuses, or it cannot prove it refuses
    // them. The allowlist's own table is twelve near-miss URLs by design.
    const mayNameUrl = inList(rel, URL_HOMES) || isGuard

    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (LINE_COMMENT_RE.test(line) || BLOCK_COMMENT_CONTINUATION_RE.test(line)) return
      const closing = BLOCK_COMMENT_CLOSE_RE.exec(line)
      const scanLine = closing ? line.slice(closing[0].length) : line
      const at = { file: rel, line: i + 1, source: line.trim() }

      if (!isTransport) {
        const m = IMPORT_RE.exec(scanLine)
        if (m) findings.push({ ...at, why: `imports node:${m[1] ?? m[2]}` })
        const p = PACKAGE_RE.exec(scanLine)
        if (p) findings.push({ ...at, why: `imports ${p[1]}` })
        if (!isGuard && CALL_RE.test(scanLine)) {
          findings.push({ ...at, why: 'network call outside a transport module' })
        }
        if (!isGuard && GLOBAL_ACCESS_RE.test(scanLine)) {
          findings.push({ ...at, why: 'reaches a network global through a computed/reflected property' })
        }
      }

      if (GLOBAL_UA_RE.test(scanLine)) {
        findings.push({ ...at, why: 'sets a global User-Agent — it must be a per-request header' })
      }

      if (!mayNameUrl && PROVIDER_URL_RE.test(scanLine)) {
        findings.push({ ...at, why: 'names a provider URL outside hosts.ts and the transports' })
      }
    })
  }
}

if (findings.length > 0) {
  console.error(`\negress audit FAILED — ${findings.length} finding(s):\n`)
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.why}`)
    console.error(`    ${f.source}`)
  }
  console.error('\nEvery outbound connection goes through src/main/prices/egress.ts (§14).\n')
  process.exit(1)
}

console.log('egress audit passed — the network is reachable from two files and no others')
