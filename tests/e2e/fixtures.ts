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
  close(): Promise<void>
  /** Quit and relaunch against the same vault directory. */
  relaunch(): Promise<Session>
}

async function launchIn(dataHome: string, owned: boolean): Promise<Session> {
  const app = await electron.launch({
    args: ['--no-sandbox', projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      XDG_DATA_HOME: dataHome,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
    }
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const session: Session = {
    app,
    page,
    dataHome,
    vaultDir: join(dataHome, 'jadeite'),
    async close() {
      await app.close().catch(() => undefined)
      if (owned) rmSync(dataHome, { recursive: true, force: true })
    },
    async relaunch() {
      await app.close().catch(() => undefined)
      return launchIn(dataHome, owned)
    }
  }
  return session
}

/** A fresh app with an empty data directory, so the first-run ceremony shows. */
export async function launchFresh(): Promise<Session> {
  return launchIn(mkdtempSync(join(tmpdir(), 'jadeite-e2e-')), true)
}
