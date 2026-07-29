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

app.setName('jadeite')

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
  registerIpcHandlers()
  forwardLockEvents(() => mainWindow)
  startIdleWatch()
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
  vault.lock('manual')
})
