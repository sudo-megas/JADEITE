/** First run — create the master password, then receive recovery key #1. */

import { useState, type FormEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { MIN_PASSWORD_LENGTH, type RecoveryKeyIssue } from '@shared/ipc-contract'
import { JadeGlyph } from '../shell/JadeGlyph.js'

interface Props {
  onCreated: (issue: RecoveryKeyIssue) => void
}

export function FirstRun({ onCreated }: Props): ReactElement {
  const { t } = useTranslation()
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
    const result = await window.jadeite.vault.create(password)
    setBusy(false)

    if (result.ok) onCreated(result.value)
    else setError(t(`errors.${result.error}`))
  }

  return (
    <form className="panel" onSubmit={submit}>
      <p className="brand">
        <JadeGlyph />
        <span>{t('common.brand')}</span>
      </p>
      <h1>{t('firstRun.title')}</h1>
      <p className="lede">{t('firstRun.lede')}</p>

      <div className="field">
        <label htmlFor="password">{t('firstRun.password')}</label>
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
        <label htmlFor="confirm">{t('firstRun.passwordConfirm')}</label>
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
        {busy ? t('common.working') : t('firstRun.submit')}
      </button>
    </form>
  )
}
