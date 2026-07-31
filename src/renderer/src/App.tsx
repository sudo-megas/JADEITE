/**
 * The application state machine: no vault, locked, resetting, or open.
 *
 * The recovery-key panel is a stage between two of those states rather than a
 * screen of its own, because §4.3 requires that it be passed through exactly
 * once and never returned to.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { LockReason, RecoveryKeyIssue } from '@shared/ipc-contract'

import { BackupPrompt } from './screens/BackupPrompt'
import { FirstRun } from './screens/FirstRun'
import { Lock } from './screens/Lock'
import { RecoveryKeyPanel } from './screens/RecoveryKeyPanel'
import { Reset } from './screens/Reset'
import { Restore } from './screens/Restore'
import { Shell } from './shell/Shell'
import { useAppStore } from './store/app-store.js'
import { forgetVaultData } from './store/vault-scoped.js'

type Stage =
  | 'loading'
  | 'first-run'
  | 'locked'
  | 'reset'
  | 'recovery'
  | 'backup-prompt'
  | 'restore'
  | 'unlocked'

export function App(): ReactElement {
  const [stage, setStage] = useState<Stage>('loading')
  const [issue, setIssue] = useState<RecoveryKeyIssue | null>(null)
  const [lockReason, setLockReason] = useState<LockReason | null>(null)

  /**
   * Where the restore screen came from, so cancelling returns there.
   *
   * It is reachable from both pre-vault screens: from the lock screen when the
   * password is gone, and from first-run when the whole vault is (§4.4, row 2).
   * Those are the same act from the owner's side and two different states from
   * the application's.
   */
  const [restoreOrigin, setRestoreOrigin] = useState<'locked' | 'first-run'>('locked')

  /**
   * Whether the recovery key on screen was issued by a *reset* rather than by
   * creation. §4.4 mandates a backup prompt after a credential changes, and
   * only a reset changes one — first run replaces nothing and strands no
   * existing backup.
   */
  const [afterReset, setAfterReset] = useState(false)

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
  //
  // The main process has already zeroised the key and closed the database by
  // the time this arrives; the renderer's own copies of what it read go here,
  // in the same breath. Unmounting a section is not enough — its store is
  // module state and outlives it. Appearance is unaffected: it never came from
  // the vault (§4.1).
  useEffect(() => {
    return window.jadeite.vault.onLocked((reason) => {
      forgetVaultData()
      setLockReason(reason)
      setStage((current) => (current === 'recovery' ? current : 'locked'))
    })
  }, [])

  const showRecovery = useCallback((next: RecoveryKeyIssue) => {
    setIssue(next)
    setStage('recovery')
  }, [])

  /**
   * A restore replaced both files underneath the running application.
   *
   * The vault is locked by the time this is called — the service ends the
   * session before it moves anything — and the renderer's copies of what it
   * read must go with it, exactly as they do on an idle lock. `refresh` then
   * asks the main process what is on disk now, which may be a vault where a
   * moment ago there was none.
   */
  const afterRestore = useCallback(() => {
    forgetVaultData()
    setIssue(null)
    setLockReason(null)
    void refresh()
  }, [refresh])

  switch (stage) {
    case 'loading':
      return <div className="shell" />

    case 'first-run':
      return (
        <div className="shell">
          <FirstRun
            onCreated={(next) => {
              setAfterReset(false)
              showRecovery(next)
            }}
            onRestore={() => {
              setRestoreOrigin('first-run')
              setStage('restore')
            }}
          />
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
            onRestore={() => {
              setRestoreOrigin('locked')
              setStage('restore')
            }}
          />
        </div>
      )

    case 'reset':
      return (
        <div className="shell">
          <Reset
            onReset={(next) => {
              setAfterReset(true)
              showRecovery(next)
            }}
            onCancel={() => setStage('locked')}
          />
        </div>
      )

    case 'restore':
      return (
        <div className="shell">
          <Restore onRestored={afterRestore} onCancel={() => setStage(restoreOrigin)} />
        </div>
      )

    case 'backup-prompt':
      return (
        <div className="shell">
          <BackupPrompt
            onDone={() => {
              setAfterReset(false)
              void refresh()
            }}
          />
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
              // §4.4's mandated prompt goes here and not before: asking for a
              // backup while the only copy of the new recovery key is still on
              // screen would invite the owner past it.
              if (afterReset) setStage('backup-prompt')
              else void refresh()
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
          onRestored={afterRestore}
        />
      )
  }
}
