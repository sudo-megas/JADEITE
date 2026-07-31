/**
 * Password reset — XJADEITE §4.3 steps 2 and 3.
 *
 * Using the recovery key consumes it permanently and issues the next one. At
 * any moment exactly one valid recovery key exists.
 */

import { useState, type FormEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { MIN_PASSWORD_LENGTH, type RecoveryKeyIssue } from '@shared/ipc-contract'
import { JadeGlyph } from '../shell/JadeGlyph.js'

interface Props {
  onReset: (issue: RecoveryKeyIssue) => void
  onCancel: () => void
}

export function Reset({ onReset, onCancel }: Props): ReactElement {
  const { t } = useTranslation()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('validation.passwordTooShort', { count: MIN_PASSWORD_LENGTH }))
      return
    }
    if (password !== confirm) {
      setError(t('validation.passwordsDoNotMatch'))
      return
    }

    setBusy(true)
    const result = await window.jadeite.vault.reset(recoveryKey, password)
    setBusy(false)

    if (result.ok) onReset(result.value)
    else setError(t(`errors.${result.error}`))
  }

  return (
    <form className="panel panel--wide" onSubmit={submit}>
      <p className="brand">
        <JadeGlyph />
        <span>{t('common.brand')}</span>
      </p>
      <h1>{t('reset.title')}</h1>
      <p className="lede">{t('reset.lede')}</p>

      <div className="field">
        <label htmlFor="recovery-key">{t('reset.keyLabel')}</label>
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
        <label htmlFor="new-password">{t('reset.newPassword')}</label>
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
        <label htmlFor="new-confirm">{t('reset.newPasswordConfirm')}</label>
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
        {busy ? t('common.working') : t('reset.submit')}
      </button>

      <button className="btn-link" type="button" onClick={onCancel} data-testid="cancel">
        {t('common.back')}
      </button>
    </form>
  )
}
