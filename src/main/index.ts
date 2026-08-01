/**
 * JADEITE main process.
 *
 * Usage is open → enter → close, so the app is not a resident: it holds no
 * background window, checks for nothing, and locks the moment it loses focus
 * of the owner's attention for long enough (see idle.ts).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

import { defaultDark } from '../shared/theme/palettes/default.js'
import { hardenSession, hardenWebContents } from './security/session.js'
import { forwardLockEvents, registerIpcHandlers } from './security/ipc.js'
import { startIdleWatch, stopIdleWatch } from './idle.js'
import { startPriceRefresh } from './prices/schedule.js'
import { completeInterruptedInstall } from './vault/backup/install.js'
import * as vault from './vault/vault.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Cold start is measured from when the process actually began, not from when
 * this module happened to load — Electron's own startup is part of the budget
 * the owner cares about (§3.4). `performance.now()` here is the elapsed time
 * since process start, so subtracting it from the wall clock recovers the
 * moment the process was created.
 */
const processStartedAt = Date.now() - performance.now()
const sinceLaunch = (): number => Math.round(Date.now() - processStartedAt)

let mainWindow: BrowserWindow | null = null

/** Stops the §14 auto-refresh watcher; null until the app is ready. */
let stopPriceRefresh: (() => void) | null = null

app.setName('jadeite')

// Windows groups taskbar buttons, and matches a pinned shortcut to a running
// window, by AppUserModelID and nothing else. Electron defaults it to something
// derived from the executable, NSIS stamps the shortcut with `appId` from
// electron-builder.yml, and when the two disagree the result is the same
// complaint every Electron app on Windows eventually files: pinning the
// application produces a second, dead icon beside the live one.
//
// So this string must equal `appId` in electron-builder.yml, exactly. It is the
// Windows counterpart of the `StartupWMClass` coupling package.json documents
// for Linux, and `scripts/audit-strings.mjs` holds both to it.
//
// Set unconditionally: the call is a no-op off Windows, and a platform guard
// around a one-line assignment would only invite someone to wonder which
// platforms it was meant to skip.
app.setAppUserModelId('dev.sudomegas.jadeite')

// One vault, one process. A second instance would open the same database file
// behind the first one's back.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// Renderers are sandboxed (§3.3). This must be called before any window exists.
app.enableSandbox()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    /*
     * The window and taskbar icon.
     *
     * Resolved against `app.getAppPath()` rather than against `here`, because
     * `here` is `out/main` in both dev and package and the icon is not build
     * output — it is a committed asset that `electron-builder.yml` lists in
     * `files`, which puts it at `build/icon.png` relative to the app root either
     * way. Electron reads paths inside the asar transparently, so the same
     * string works unpacked and packed.
     *
     * Linux only takes this seriously: on Windows and macOS the packaged
     * executable carries its own icon and this is ignored, which is why nothing
     * branches on the platform here.
     */
    icon: join(app.getAppPath(), 'build/icon.png'),
    // The window paints before the renderer does. Taking the colour from the
    // fallback palette rather than naming one here keeps §12.2 true of the
    // main process too: no component hard-codes a colour, including this one.
    backgroundColor: defaultDark.tokens.surface,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // Emitted unconditionally: the budget of §3.4 is enforced from Realisation
    // II onward, and a number nobody can read is a number nobody checks.
    console.info(`[cold-start] launch to lock screen: ${sinceLaunch()} ms`)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(here, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  hardenSession()
  hardenWebContents()

  // Before anything asks whether a vault exists. A restore that a power cut
  // interrupted left a journal and one or two staged files behind; finishing it
  // here means `vault.status()` never sees the half-applied state, and a
  // half-applied state is the one thing §15's replacement must never produce.
  //
  // Guarded, because everything below depends on reaching the next line. This
  // callback creates the only window there is, so a throw here does not fail the
  // replay — it leaves the process alive with no window, no IPC and no way to
  // say what happened, which the owner reads as a hang. A replay that fails is
  // recoverable and the journal survives to be retried on the next start; a
  // window that never appears is neither.
  let recovery: ReturnType<typeof completeInterruptedInstall> = 'none'
  try {
    recovery = completeInterruptedInstall()
  } catch (e) {
    console.error('[restore] interrupted install could not be replayed', e)
  }
  if (recovery !== 'none') console.info(`[restore] interrupted install: ${recovery}`)

  registerIpcHandlers(() => mainWindow)
  forwardLockEvents(() => mainWindow)
  startIdleWatch()
  // §14's optional auto-refresh. Off by default, and every tick is a no-op
  // while the vault is shut — the interval it would obey lives inside it.
  stopPriceRefresh = startPriceRefresh()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

// Close the database cleanly so the WAL is checkpointed back into the file and
// the data directory is left holding exactly its two files.
app.on('before-quit', () => {
  stopIdleWatch()
  stopPriceRefresh?.()
  vault.lock('manual')
})
