/**
 * The backup JADEITE asks for after a credential changes — XJADEITE §4.4.
 *
 * "Mandated behaviour: after every successful password change or reset,
 * JADEITE immediately prompts for a fresh backup, so the newest backup always
 * matches the newest credentials."
 *
 * The reason is the second row of the truth table. A backup carries the
 * envelopes that were in force when it was taken, so the moment a reset issues
 * a new password and a new recovery key, every existing backup is one the owner
 * can only open with credentials they have just replaced — and, for the
 * recovery key, permanently destroyed. The window between a reset and the next
 * backup is the only interval in which this vault's disaster recovery depends
 * on a card that has already been consumed.
 *
 * It prompts and does not compel. §4.4 says prompt; a modal with no way out
 * would be a different promise, and the owner may have no drive to hand. The
 * refusal is therefore a plain button rather than a hidden one — but the
 * consequence is stated beside it, which is the difference between offering a
 * choice and burying one.
 *
 * First-run creation deliberately does not prompt. Nothing has been replaced,
 * there is no older backup to be stranded, and the vault is empty.
 */

import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from '../shell/BrandMark.js'

interface Props {
  onDone: () => void
}

export function BackupPrompt({ onDone }: Props): ReactElement {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function takeBackup(): Promise<void> {
    setError('')
    setBusy(true)
    const result = await window.jadeite.backup.create('credential-change')
    setBusy(false)

    if (result.ok) {
      onDone()
      return
    }
    // A cancelled picker returns the owner to this panel rather than past it:
    // they closed a file dialogue, which is not the same as declining.
    if (result.error !== 'CANCELLED') setError(t(`errors.${result.error}`))
  }

  return (
    <div className="panel" data-testid="backup-prompt">
      <p className="brand">
        <BrandMark size={66} />
        <span>{t('common.brand')}</span>
      </p>
      <h1>{t('backup.promptTitle')}</h1>
      <p className="lede">{t('backup.promptLede')}</p>

      <p className="warning">
        <strong>{t('backup.promptWarningTitle')}</strong>
        {t('backup.promptWarning')}
      </p>

      <p className="error" data-testid="error">
        {error}
      </p>

      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        data-testid="prompt-backup"
        onClick={() => void takeBackup()}
      >
        {busy ? t('common.working') : t('backup.create')}
      </button>

      <button type="button" className="btn-link" data-testid="prompt-skip" onClick={onDone}>
        {t('backup.promptSkip')}
      </button>
    </div>
  )
}
