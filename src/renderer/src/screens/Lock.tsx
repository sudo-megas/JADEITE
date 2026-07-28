/** The lock screen — the first thing the app ever shows an existing vault. */

import { useState, type FormEvent, type ReactElement } from 'react'
import type { LockReason } from '@shared/ipc-contract'
import { T, errorMessage } from '../strings'

interface Props {
  reason: LockReason | null
  onUnlocked: () => void
  onForgotPassword: () => void
}

export function Lock({ reason, onUnlocked, onForgotPassword }: Props): ReactElement {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setBusy(true)
    const result = await window.jadeite.vault.unlock(password)
    setBusy(false)

    if (result.ok) {
      setPassword('')
      onUnlocked()
    } else {
      setError(errorMessage(result.error))
    }
  }

  const lede =
    reason === 'idle' ? T.lockLedeIdle : reason === 'reset' ? T.lockLedeReset : null

  return (
    <form className="panel" onSubmit={submit}>
      <p className="brand">{T.brand}</p>
      <h1>{T.lockTitle}</h1>
      {lede ? <p className="lede">{lede}</p> : <p className="lede" />}

      <div className="field">
        <label htmlFor="password">{T.password}</label>
        <input
          id="password"
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          data-testid="password"
        />
      </div>

      <p className="error" data-testid="error">
        {error}
      </p>

      <button className="btn-primary" type="submit" disabled={busy} data-testid="submit">
        {busy ? T.working : T.unlock}
      </button>

      <button className="btn-link" type="button" onClick={onForgotPassword} data-testid="forgot">
        {T.forgotPassword}
      </button>
    </form>
  )
}
