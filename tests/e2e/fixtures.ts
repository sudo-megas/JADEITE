import { mkdtempSync, rmSync } from 'node:fs'
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
  extraEnv: NodeJS.ProcessEnv = {}
): Promise<Session> {
  const app = await electron.launch({
    args: ['--no-sandbox', projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      XDG_DATA_HOME: dataHome,
      XDG_CONFIG_HOME: join(dataHome, 'config'),
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
      return launchIn(dataHome, owned, env)
    }
  }
  return session
}

/** A fresh app with an empty data directory, so the first-run ceremony shows. */
export async function launchFresh(env: NodeJS.ProcessEnv = {}): Promise<Session> {
  return launchIn(mkdtempSync(join(tmpdir(), 'jadeite-e2e-')), true, env)
}

export const TEST_PASSWORD = 'kuyumcu-defteri-2026'

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
}
