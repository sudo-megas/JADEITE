import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export interface Session {
  app: ElectronApplication
  page: Page
  /** The redirected XDG data home; the real vault is never touched. */
  dataHome: string
  vaultDir: string
  /** The unencrypted config.json, redirected away from the real one. */
  configPath: string
  /** Everything the main process has written to stdout so far. */
  stdout(): string
  /** Milliseconds from process start to the lock screen, as the app measured it. */
  coldStartMs(): number | null
  /** The Argon2id cost of the most recent unlock, which §3.4 excludes. */
  lastUnlockKdfMs(): number | null
  close(): Promise<void>
  /** Quit and relaunch against the same vault directory. */
  relaunch(env?: NodeJS.ProcessEnv): Promise<Session>
}

async function launchIn(
  dataHome: string,
  owned: boolean,
  extraEnv: NodeJS.ProcessEnv = {},
  executablePath?: string
): Promise<Session> {
  // Two ways in, and the difference is the whole of what the packaged suite
  // adds. Without `executablePath` this runs the development Electron against
  // the project directory, which is what the thirteen specs in this folder do.
  // With one, it runs a built application: its own Electron binary, its own
  // asar, and — the reason the packaged suite exists at all — whatever survived
  // the `files:` exclusions in electron-builder.yml.
  // `--no-sandbox` is a Linux flag and belongs only there, where it is what lets
  // a development Electron start without a SUID `chrome-sandbox` helper beside
  // it. On Windows it is not merely unnecessary: `src/main/index.ts` calls
  // `app.enableSandbox()`, and asking Chromium to enforce and disable the
  // sandbox in the same launch kills the process with an access violation
  // (0xC0000005) before any window is created — which arrives here as a
  // `beforeAll` timeout, and reads as an application that hangs rather than one
  // that was mis-invoked. Given the flag it needs, the packaged application
  // reaches its lock screen in under half a second.
  const sandboxArgs = process.platform === 'win32' ? [] : ['--no-sandbox']
  const app = await electron.launch({
    args: executablePath ? sandboxArgs : [...sandboxArgs, projectRoot],
    ...(executablePath ? { executablePath } : {}),
    cwd: executablePath ? dirname(executablePath) : projectRoot,
    env: {
      ...process.env,
      XDG_DATA_HOME: dataHome,
      XDG_CONFIG_HOME: join(dataHome, 'config'),
      JADEITE_DATA_HOME: dataHome,
      JADEITE_CONFIG_HOME: join(dataHome, 'config'),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      ...extraEnv
    }
  })

  let output = ''
  app.process().stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const session: Session = {
    app,
    page,
    dataHome,
    vaultDir: join(dataHome, 'jadeite'),
    configPath: join(dataHome, 'config', 'jadeite', 'config.json'),
    stdout: () => output,
    coldStartMs() {
      const match = /\[cold-start] launch to lock screen: (\d+) ms/.exec(output)
      return match ? Number.parseInt(match[1]!, 10) : null
    },
    lastUnlockKdfMs() {
      const matches = [...output.matchAll(/\[cold-start] unlock: kdf (\d+) ms/g)]
      const last = matches.at(-1)
      return last ? Number.parseInt(last[1]!, 10) : null
    },
    async close() {
      await app.close().catch(() => undefined)
      if (owned) rmSync(dataHome, { recursive: true, force: true })
    },
    async relaunch(env = {}) {
      await app.close().catch(() => undefined)
      return launchIn(dataHome, owned, env, executablePath)
    }
  }
  return session
}

/** A fresh app with an empty data directory, so the first-run ceremony shows. */
export async function launchFresh(env: NodeJS.ProcessEnv = {}): Promise<Session> {
  return launchIn(mkdtempSync(join(tmpdir(), 'jadeite-e2e-')), true, env)
}

/**
 * Where `electron-builder --dir` leaves the built application, per target.
 *
 * `executableName: jadeite` in electron-builder.yml gives the same lowercase
 * stem on both platforms; Windows adds the extension it needs to be launchable,
 * and puts it under `win-unpacked` rather than `linux-unpacked`.
 */
export const packagedBinary = resolve(
  projectRoot,
  process.platform === 'win32'
    ? 'release/win-unpacked/jadeite.exe'
    : 'release/linux-unpacked/jadeite'
)

/**
 * The same fresh-vault launch, against the *built* application.
 *
 * This is the only instrument that can answer Realisation X's `files:`
 * question. An over-broad exclusion removes a package that a native module
 * resolves at require time — argon2 through node-gyp-build, better-sqlite3
 * through `bindings`, both walking candidate paths rather than importing a
 * fixed one — and the failure lands at unlock, in a built artefact, with every
 * unit test still green because the unit tests never load an asar. Reading the
 * exclusion list back proves only that YAML parses.
 *
 * It refuses rather than skips when the binary is absent. A packaged suite that
 * quietly passes on a machine that never packaged anything is worse than no
 * suite: it reports the one thing it exists to check as checked.
 */
export async function launchPackagedFresh(env: NodeJS.ProcessEnv = {}): Promise<Session> {
  if (!existsSync(packagedBinary)) {
    throw new Error(
      `No packaged application at ${packagedBinary}. Run \`npm run verify:package\` — ` +
        'this suite verifies a built artefact and has nothing to say without one.'
    )
  }
  return launchIn(mkdtempSync(join(tmpdir(), 'jadeite-pkg-')), true, env, packagedBinary)
}

export const TEST_PASSWORD = 'kuyumcu-defteri-2026'

/**
 * Stop the idle watch from locking the vault in the middle of a long suite.
 *
 * Auto-lock measures the *operating system's* input clock (src/main/idle.ts),
 * deliberately, so a window left open behind other work still locks. Playwright
 * drives the app through the debugging protocol, which never touches that
 * clock, so a headless run looks idle no matter how much typing it does — and a
 * suite that runs past the ten-minute default gets locked out mid-test.
 *
 * The timeout is raised through the app's own settings API rather than by
 * disabling anything, so the behaviour under test is the shipped behaviour.
 *
 * That behaviour is not proved anywhere else in the suite. The Electron-hosted
 * vault tests call `vault.lock('idle')` directly to check what a lock with that
 * reason does — the `LockReason` plumbing, not idle detection — and nothing in
 * the repository mocks `powerMonitor` or drives `src/main/idle.ts`'s own timer.
 * A comment here once claimed otherwise; it did not survive being checked
 * against what actually calls `startIdleWatch`.
 */
async function holdTheVaultOpen(session: Session): Promise<void> {
  await session.page.evaluate(
    async () => await window.jadeite.settings.set('auto_lock_minutes', '600')
  )
}

/** Run the first-run ceremony and land in the shell. */
export async function createVaultAndEnter(
  session: Session,
  password = TEST_PASSWORD
): Promise<string> {
  await session.page.getByTestId('password').fill(password)
  await session.page.getByTestId('password-confirm').fill(password)
  await session.page.getByTestId('submit').click()

  const key = (await session.page.getByTestId('recovery-key').textContent())?.trim() ?? ''
  await session.page.getByTestId('recovery-ack').check()
  await session.page.getByTestId('recovery-continue').click()
  await session.page.getByTestId('shell').waitFor()
  await holdTheVaultOpen(session)
  return key
}

/** Unlock an existing vault and land in the shell. */
export async function unlockAndEnter(
  session: Session,
  password = TEST_PASSWORD
): Promise<void> {
  await session.page.getByTestId('password').fill(password)
  await session.page.getByTestId('submit').click()
  await session.page.getByTestId('shell').waitFor()
  await holdTheVaultOpen(session)
}
