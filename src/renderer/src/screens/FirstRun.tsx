/** First run — create the master password, then receive recovery key #1. */

import { useState, type FormEvent, type ReactElement } from 'react'
import { MIN_PASSWORD_LENGTH, type RecoveryKeyIssue } from '@shared/ipc-contract'
import { T, errorMessage } from '../strings'

interface Props {
  onCreated: (issue: RecoveryKeyIssue) => void
}

export function FirstRun({ onCreated }: Props): ReactElement {
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
    const result = await window.jadeite.vault.create(password)
    setBusy(false)

    if (result.ok) onCreated(result.value)
    else setError(errorMessage(result.error))
  }

  return (
    <form className="panel" onSubmit={submit}>
      <p className="brand">{T.brand}</p>
      <h1>{T.firstRunTitle}</h1>
      <p className="lede">{T.firstRunLede}</p>

      <div className="field">
        <label htmlFor="password">{T.password}</label>
        <input
          id="password"
          type="password"
          value={password}
          autoFocus
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
          data-testid="password"
        />
      </div>

      <div className="field">
        <label htmlFor="confirm">{T.passwordConfirm}</label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
          data-testid="password-confirm"
        />
      </div>

      <p className="error" data-testid="error">
        {error}
      </p>

      <button className="btn-primary" type="submit" disabled={busy} data-testid="submit">
        {busy ? T.working : T.createVault}
      </button>
    </form>
  )
}
