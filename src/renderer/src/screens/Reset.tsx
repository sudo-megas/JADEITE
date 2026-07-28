/**
 * Password reset — XJADEITE §4.3 steps 2 and 3.
 *
 * Using the recovery key consumes it permanently and issues the next one. At
 * any moment exactly one valid recovery key exists.
 */

import { useState, type FormEvent, type ReactElement } from 'react'
import { MIN_PASSWORD_LENGTH, type RecoveryKeyIssue } from '@shared/ipc-contract'
import { T, errorMessage } from '../strings'

interface Props {
  onReset: (issue: RecoveryKeyIssue) => void
  onCancel: () => void
}

export function Reset({ onReset, onCancel }: Props): ReactElement {
  const [recoveryKey, setRecoveryKey] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(T.passwordTooShort(MIN_PASSWORD_LENGTH))
      return
    }
    if (password !== confirm) {
      setError(T.passwordsDoNotMatch)
      return
    }

    setBusy(true)
    const result = await window.jadeite.vault.reset(recoveryKey, password)
    setBusy(false)

    if (result.ok) onReset(result.value)
    else setError(errorMessage(result.error))
  }

  return (
    <form className="panel panel--wide" onSubmit={submit}>
      <p className="brand">{T.brand}</p>
      <h1>{T.resetTitle}</h1>
      <p className="lede">{T.resetLede}</p>

      <div className="field">
        <label htmlFor="recovery-key">{T.recoveryKeyLabel}</label>
        <input
          id="recovery-key"
          className="mono"
          type="text"
          value={recoveryKey}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          onChange={(e) => setRecoveryKey(e.target.value)}
          data-testid="recovery-key-input"
        />
      </div>

      <div className="field">
        <label htmlFor="new-password">{T.newPassword}</label>
        <input
          id="new-password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
          data-testid="new-password"
        />
      </div>

      <div className="field">
        <label htmlFor="new-confirm">{T.newPasswordConfirm}</label>
        <input
          id="new-confirm"
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
          data-testid="new-password-confirm"
        />
      </div>

      <p className="error" data-testid="error">
        {error}
      </p>

      <button className="btn-primary" type="submit" disabled={busy} data-testid="submit">
        {busy ? T.working : T.resetSubmit}
      </button>

      <button className="btn-link" type="button" onClick={onCancel} data-testid="cancel">
        {T.backToUnlock}
      </button>
    </form>
  )
}
