/**
 * A very small test harness that runs inside Electron's main process.
 *
 * The SQLCipher binding is built for Electron's ABI, so anything that opens
 * the database cannot run under plain Node — and therefore cannot run under
 * Vitest. Rather than keep a second copy of the binary around for tests, these
 * suites run in the runtime that ships. Pure-crypto tests stay in Vitest.
 */

type TestFn = () => void | Promise<void>

interface TestCase {
  suite: string
  name: string
  fn: TestFn
  before: TestFn | null
  after: TestFn | null
}

const cases: TestCase[] = []
let currentSuite = ''

export function describe(name: string, body: () => void): void {
  const previous = currentSuite
  currentSuite = previous ? `${previous} > ${name}` : name
  body()
  currentSuite = previous
}

export function it(name: string, fn: TestFn): void {
  // Hooks are captured per test as it is registered, so two suite files loaded
  // into the same process keep their own setup instead of the last one winning.
  cases.push({ suite: currentSuite, name, fn, before: beforeEachFn, after: afterEachFn })
}

function render(value: unknown): string {
  if (typeof value === 'bigint') return `${value}n`
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) return a.equals(b)
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (typeof a !== 'object') return false

  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao)
  const bk = Object.keys(bo)
  if (ak.length !== bk.length) return false
  return ak.every((k) => Object.hasOwn(bo, k) && deepEqual(ao[k], bo[k]))
}

class AssertionError extends Error {}

function fail(message: string): never {
  throw new AssertionError(message)
}

interface Matchers {
  toBe(expected: unknown): void
  toEqual(expected: unknown): void
  toContain(needle: string): void
  toHaveLength(n: number): void
  toBeNull(): void
  toThrow(): void
  toMatch(re: RegExp): void
}

export function expect(actual: unknown, label = ''): Matchers & { not: Matchers } {
  const where = label ? ` (${label})` : ''

  const positive: Matchers = {
    toBe(expected) {
      if (!Object.is(actual, expected)) {
        fail(`expected ${render(expected)}, got ${render(actual)}${where}`)
      }
    },
    toEqual(expected) {
      if (!deepEqual(actual, expected)) {
        fail(`expected ${render(expected)}, got ${render(actual)}${where}`)
      }
    },
    toContain(needle) {
      if (typeof actual !== 'string' || !actual.includes(needle)) {
        fail(`expected value to contain ${render(needle)}${where}`)
      }
    },
    toHaveLength(n) {
      const len = (actual as { length?: number })?.length
      if (len !== n) fail(`expected length ${n}, got ${render(len)}${where}`)
    },
    toBeNull() {
      if (actual !== null) fail(`expected null, got ${render(actual)}${where}`)
    },
    toThrow() {
      if (typeof actual !== 'function') fail('toThrow expects a function')
      try {
        ;(actual as () => unknown)()
      } catch {
        return
      }
      fail(`expected the call to throw${where}`)
    },
    toMatch(re) {
      if (typeof actual !== 'string' || !re.test(actual)) {
        fail(`expected ${render(actual)} to match ${re}${where}`)
      }
    }
  }

  const negative: Matchers = {
    toBe(expected) {
      if (Object.is(actual, expected)) fail(`expected not to be ${render(expected)}${where}`)
    },
    toEqual(expected) {
      if (deepEqual(actual, expected)) fail(`expected not to equal ${render(expected)}${where}`)
    },
    toContain(needle) {
      if (typeof actual === 'string' && actual.includes(needle)) {
        fail(`expected value not to contain ${render(needle)}${where}`)
      }
    },
    toHaveLength(n) {
      if ((actual as { length?: number })?.length === n) fail(`expected length not to be ${n}${where}`)
    },
    toBeNull() {
      if (actual === null) fail(`expected not null${where}`)
    },
    toThrow() {
      if (typeof actual !== 'function') fail('toThrow expects a function')
      try {
        ;(actual as () => unknown)()
      } catch (e) {
        fail(`expected the call not to throw, but it threw ${render(e)}${where}`)
      }
    },
    toMatch(re) {
      if (typeof actual === 'string' && re.test(actual)) {
        fail(`expected ${render(actual)} not to match ${re}${where}`)
      }
    }
  }

  return { ...positive, not: negative }
}

let beforeEachFn: TestFn | null = null
let afterEachFn: TestFn | null = null

export function beforeEach(fn: TestFn): void {
  beforeEachFn = fn
}

export function afterEach(fn: TestFn): void {
  afterEachFn = fn
}

/** Called between suite files so hooks do not leak across them. */
export function resetHooks(): void {
  beforeEachFn = null
  afterEachFn = null
}

export async function run(title: string): Promise<number> {
  let passed = 0
  const failures: { name: string; error: unknown }[] = []
  const startedAt = Date.now()

  console.log(`\n${title}\n${'='.repeat(title.length)}`)

  let lastSuite = ''
  for (const test of cases) {
    if (test.suite !== lastSuite) {
      console.log(`\n  ${test.suite}`)
      lastSuite = test.suite
    }
    try {
      if (test.before) await test.before()
      await test.fn()
      passed++
      console.log(`    PASS  ${test.name}`)
    } catch (error) {
      failures.push({ name: `${test.suite} > ${test.name}`, error })
      console.log(`    FAIL  ${test.name}`)
      const message = error instanceof Error ? error.message : String(error)
      console.log(`          ${message}`)
      if (error instanceof Error && !(error instanceof AssertionError) && error.stack) {
        console.log(
          error.stack
            .split('\n')
            .slice(1, 4)
            .map((l) => `          ${l.trim()}`)
            .join('\n')
        )
      }
    } finally {
      try {
        if (test.after) await test.after()
      } catch {
        /* teardown noise must not mask a real failure */
      }
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `\n  ${passed} passed, ${failures.length} failed, ${cases.length} total  (${seconds}s)\n`
  )
  return failures.length
}
