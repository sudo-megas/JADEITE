/**
 * The recovery key, displayed exactly once — XJADEITE §4.3.
 *
 * There is no copy button and selection is disabled: this key belongs on
 * paper, not in a clipboard history or a screenshot buffer. The print
 * stylesheet exists so the owner can put it there directly.
 */

import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '../shell/BrandMark.js'

interface Props {
  recoveryKey: string
  generation: number
  /** True once a lock event has fired while this panel was showing — see App.tsx. */
  masked: boolean
  onReveal: () => void
  onAcknowledged: () => void
}

export function RecoveryKeyPanel({
  recoveryKey,
  generation,
  masked,
  onReveal,
  onAcknowledged
}: Props): ReactElement {
  const { t } = useTranslation()
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <div className="panel panel--wide">
      <p className="brand">
        <BrandMark size={66} />
        <span>{t('common.brand')}</span>
      </p>
      <h1>{t('recovery.title')}</h1>
      <p className="lede">
        {t('recovery.lede')}
        {generation > 1 ? ` (#${generation})` : ''}
      </p>

      {masked ? (
        <p className="warning" data-testid="recovery-masked-notice">
          {t('recovery.maskedNotice')}
        </p>
      ) : null}

      <div
        className="recovery-key"
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="recovery-key"
      >
        {masked ? '•'.repeat(recoveryKey.length || 32) : recoveryKey}
      </div>

      {masked ? (
        <button
          type="button"
          className="btn-primary"
          onClick={onReveal}
          data-testid="recovery-reveal"
        >
          {t('recovery.reveal')}
        </button>
      ) : (
        <>
          <p className="warning">
            <strong>{t('recovery.warningTitle')}</strong>
            {t('recovery.warningBody')}
          </p>

          <label className="ack">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              data-testid="recovery-ack"
            />
            <span>{t('recovery.ack')}</span>
          </label>

          <button
            className="btn-primary"
            disabled={!acknowledged}
            onClick={onAcknowledged}
            data-testid="recovery-continue"
          >
            {t('common.continue')}
          </button>
        </>
      )}
    </div>
  )
}
