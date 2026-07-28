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

import { hardenSession, hardenWebContents } from './security/session.js'
import { forwardLockEvents, registerIpcHandlers } from './security/ipc.js'
import { startIdleWatch, stopIdleWatch } from './idle.js'
import * as vault from './vault/vault.js'

const here = dirname(fileURLToPath(import.meta.url))
const launchedAt = Date.now()

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
    backgroundColor: '#101215',
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
    if (!app.isPackaged) {
      console.info(`[cold-start] launch to lock screen: ${Date.now() - launchedAt} ms`)
    }
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
