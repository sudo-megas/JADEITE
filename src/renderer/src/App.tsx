/**
 * The application state machine: no vault, locked, resetting, or open.
 *
 * The recovery-key panel is a stage between two of those states rather than a
 * screen of its own, because §4.3 requires that it be passed through exactly
 * once and never returned to.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { LockReason, RecoveryKeyIssue } from '@shared/ipc-contract'

import { FirstRun } from './screens/FirstRun'
import { Lock } from './screens/Lock'
import { RecoveryKeyPanel } from './screens/RecoveryKeyPanel'
import { Reset } from './screens/Reset'
import { Shell } from './shell/Shell'
import { useAppStore } from './store/app-store.js'

type Stage = 'loading' | 'first-run' | 'locked' | 'reset' | 'recovery' | 'unlocked'

export function App(): ReactElement {
  const [stage, setStage] = useState<Stage>('loading')
  const [issue, setIssue] = useState<RecoveryKeyIssue | null>(null)
  const [lockReason, setLockReason] = useState<LockReason | null>(null)

  const loadSettings = useAppStore((s) => s.loadFromVault)
  const resetToLockedDefaults = useAppStore((s) => s.resetToLockedDefaults)

  const openShell = useCallback(async () => {
    // Appearance and language only become knowable once the vault is open.
    await loadSettings()
    setStage('unlocked')
  }, [loadSettings])

  const refresh = useCallback(async () => {
    const status = await window.jadeite.vault.status()
    if (!status.exists) setStage('first-run')
    else if (status.locked) setStage('locked')
    else await openShell()
  }, [openShell])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The vault can lock itself while the renderer is showing something else.
  useEffect(() => {
    return window.jadeite.vault.onLocked((reason) => {
      setLockReason(reason)
      setStage((current) => {
        if (current === 'recovery') return current
        // Locking drops back to the palette and language the lock screen can
        // actually know about.
        resetToLockedDefaults()
        return 'locked'
      })
    })
  }, [resetToLockedDefaults])

  const showRecovery = useCallback((next: RecoveryKeyIssue) => {
    setIssue(next)
    setStage('recovery')
  }, [])

  switch (stage) {
    case 'loading':
      return <div className="shell" />

    case 'first-run':
      return (
        <div className="shell">
          <FirstRun onCreated={showRecovery} />
        </div>
      )

    case 'locked':
      return (
        <div className="shell">
          <Lock
            reason={lockReason}
            onUnlocked={() => {
              setLockReason(null)
              void openShell()
            }}
            onForgotPassword={() => setStage('reset')}
          />
        </div>
      )

    case 'reset':
      return (
        <div className="shell">
          <Reset onReset={showRecovery} onCancel={() => setStage('locked')} />
        </div>
      )

    case 'recovery':
      return (
        <div className="shell">
          <RecoveryKeyPanel
            recoveryKey={issue?.recoveryKey ?? ''}
            generation={issue?.generation ?? 1}
            onAcknowledged={() => {
              // The key is dropped from renderer memory the moment it is
              // acknowledged; there is no path back to this panel.
              setIssue(null)
              void refresh()
            }}
          />
        </div>
      )

    case 'unlocked':
      return (
        <Shell
          onLock={() => {
            resetToLockedDefaults()
            setLockReason('manual')
            setStage('locked')
          }}
        />
      )
  }
}
