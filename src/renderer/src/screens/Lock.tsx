/** The lock screen — the first thing the app ever shows an existing vault. */

import { useState, type FormEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { LockReason } from '@shared/ipc-contract'
import { BrandMark } from '../shell/BrandMark.js'

interface Props {
  reason: LockReason | null
  onUnlocked: () => void
  onForgotPassword: () => void
  /** Open a `.jbk` instead — §4.4's second row, and §15's machine transfer. */
  onRestore: () => void
}

export function Lock({ reason, onUnlocked, onForgotPassword, onRestore }: Props): ReactElement {
  const { t } = useTranslation()
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
      setError(t(`errors.${result.error}`))
    }
  }

  const lede =
    reason === 'idle' ? t('lock.ledeIdle') : reason === 'reset' ? t('lock.ledeReset') : null

  return (
    <form className="panel" onSubmit={submit}>
      <p className="brand">
        <BrandMark size={66} />
        <span>{t('common.brand')}</span>
      </p>
      <h1>{t('lock.title')}</h1>
      {lede ? <p className="lede">{lede}</p> : <p className="lede" />}

      <div className="field">
        <label htmlFor="password">{t('lock.password')}</label>
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
        {busy ? t('common.working') : t('lock.submit')}
      </button>

      <button className="btn-link" type="button" onClick={onForgotPassword} data-testid="forgot">
        {t('lock.forgot')}
      </button>

      <button className="btn-link" type="button" onClick={onRestore} data-testid="restore-entry">
        {t('backup.restoreEntry')}
      </button>
    </form>
  )
}
