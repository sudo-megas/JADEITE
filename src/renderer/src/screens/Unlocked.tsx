/**
 * Realisation I ends here.
 *
 * The vault is open and the schema exists; the sections that will fill it
 * arrive from Realisation III onward. This screen exists so that "unlocked" is
 * observable and lockable, not as a destination.
 */

import { useEffect, useState, type ReactElement } from 'react'
import { SETTING_KEYS } from '@shared/ipc-contract'
import { T } from '../strings'

interface Props {
  onLocked: () => void
}

export function Unlocked({ onLocked }: Props): ReactElement {
  const [autoLock, setAutoLock] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    void window.jadeite.settings.get(SETTING_KEYS.autoLockMinutes).then((r) => {
      if (!cancelled && r.ok && r.value !== null) setAutoLock(r.value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function lockNow(): Promise<void> {
    await window.jadeite.vault.lock()
    onLocked()
  }

  return (
    <div className="panel" data-testid="unlocked">
      <p className="brand">{T.brand}</p>
      <h1>{T.unlockedTitle}</h1>
      <p className="lede">{T.unlockedLede}</p>

      <div className="status-row">
        <span>{T.statusVault}</span>
        <span>{T.statusVaultOpen}</span>
      </div>
      <div className="status-row">
        <span>{T.statusAutoLock}</span>
        <span>
          {autoLock} {T.minutesShort}
        </span>
      </div>

      <br />
      <button className="btn-primary" onClick={lockNow} data-testid="lock-now">
        {T.lockNow}
      </button>
    </div>
  )
}
