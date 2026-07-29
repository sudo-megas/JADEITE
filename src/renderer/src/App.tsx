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

  const loadAppearance = useAppStore((s) => s.loadAppearance)
  const loadVaultSettings = useAppStore((s) => s.loadVaultSettings)

  const openShell = useCallback(async () => {
    await loadVaultSettings()
    setStage('unlocked')
  }, [loadVaultSettings])

  const refresh = useCallback(async () => {
    const status = await window.jadeite.vault.status()
    if (!status.exists) setStage('first-run')
    else if (status.locked) setStage('locked')
    else await openShell()
  }, [openShell])

  useEffect(() => {
    // Appearance comes from config.json, so it is known before the vault is
    // even looked at — the lock screen wears the owner's palette and speaks
    // the owner's language.
    void loadAppearance().then(refresh)
  }, [loadAppearance, refresh])

  // The vault can lock itself while the renderer is showing something else.
  // Appearance is unaffected: it never came from the vault.
  useEffect(() => {
    return window.jadeite.vault.onLocked((reason) => {
      setLockReason(reason)
      setStage((current) => (current === 'recovery' ? current : 'locked'))
    })
  }, [])

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
            setLockReason('manual')
            setStage('locked')
          }}
        />
      )
  }
}
