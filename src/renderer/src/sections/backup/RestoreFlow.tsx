/**
 * Choosing a backup, being told what is in it, and confirming the replacement.
 *
 * One component for both of §4.4's rows, because they differ in exactly one
 * thing and it would be a lie to build two screens that look alike and disagree
 * about which questions they ask. Row 1 — a healthy vault opening its own
 * backup — asks nothing, because the key is already in memory. Row 2 — a dead
 * disk, or another machine's container — asks for the password or recovery key
 * that was current when the backup was taken. Which of those applies is decided
 * in the main process by comparing lineage ids, and arrives as
 * `needsCredential`; the screen does not guess at it.
 *
 * §15 requires "explicit confirmation", and the confirmation step is the whole
 * reason `select` and `restore` are two crossings. A dialogue that could only
 * say *are you sure?* would be a formality. This one says when the backup was
 * taken, which JADEITE wrote it, whether it belongs to this vault, and when
 * each section in it was last edited — and only then asks.
 */

import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { BackupCandidate, SectionKey } from '@shared/backup/types'
import { SECTION_KEYS } from '@shared/backup/types'
import { useAppStore } from '../../store/app-store.js'
import { formatDate } from '../../i18n/format.js'

interface Props {
  /** The container has been applied; the session it replaced is over. */
  onRestored: () => void
}

/**
 * The section stamps are keyed `s1`…`s4` and the rail calls the same sections
 * `nav.section1`…`nav.section4`. One map rather than four ternaries, so the two
 * vocabularies meet in exactly one place.
 */
const SECTION_LABEL: Readonly<Record<SectionKey, string>> = {
  s1: 'nav.section1',
  s2: 'nav.section2',
  s3: 'nav.section3',
  s4: 'nav.section4'
}

export function RestoreFlow({ onRestored }: Props): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)

  const [candidate, setCandidate] = useState<BackupCandidate | null>(null)
  const [credential, setCredential] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function choose(): Promise<void> {
    setError('')
    setBusy(true)
    const result = await window.jadeite.backup.select()
    setBusy(false)

    if (result.ok) {
      setCandidate(result.value)
      return
    }
    // Closing the picker is not a failure and must not paint like one.
    if (result.error !== 'CANCELLED') setError(t(`errors.${result.error}`))
  }

  async function dismiss(): Promise<void> {
    setCandidate(null)
    setCredential('')
    setError('')
    await window.jadeite.backup.cancel()
  }

  async function confirm(): Promise<void> {
    if (!candidate) return
    setError('')
    setBusy(true)
    const result = await window.jadeite.backup.restore(
      candidate.needsCredential ? credential : null
    )
    setBusy(false)

    if (result.ok) {
      setCandidate(null)
      setCredential('')
      onRestored()
      return
    }
    setError(t(`errors.${result.error}`))
  }

  if (!candidate) {
    return (
      <>
        <p className="lede">{t('backup.restoreLede')}</p>
        <p className="error" data-testid="restore-error">
          {error}
        </p>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          data-testid="restore-choose"
          onClick={() => void choose()}
        >
          {busy ? t('common.working') : t('backup.restore')}
        </button>
      </>
    )
  }

  return (
    <div data-testid="restore-candidate">
      <dl className="backup-facts">
        <div className="status-row">
          <dt>{t('backup.candidateCreatedAt')}</dt>
          <dd data-testid="candidate-created">{formatDate(candidate.createdAt, language)}</dd>
        </div>
        <div className="status-row">
          <dt>{t('backup.candidateApp')}</dt>
          <dd>{candidate.appVersion}</dd>
        </div>
        <div className="status-row">
          <dt>{t('backup.candidateOrigin')}</dt>
          <dd data-testid="candidate-origin">
            {candidate.sameVault ? t('backup.originSame') : t('backup.originOther')}
          </dd>
        </div>
        <div className="status-row">
          <dt>{t('backup.candidateGeneration')}</dt>
          <dd>{candidate.recoveryGeneration}</dd>
        </div>
      </dl>

      <p className="settings-heading">{t('backup.candidateSections')}</p>
      <dl className="backup-facts">
        {SECTION_KEYS.map((key: SectionKey) => {
          const stamp = candidate.sections[key]
          return (
            <div className="status-row" key={key}>
              <dt>{t(SECTION_LABEL[key])}</dt>
              <dd data-testid={`candidate-${key}`}>
                {stamp === null ? t('backup.sectionUnknown') : formatDate(stamp, language)}
              </dd>
            </div>
          )
        })}
      </dl>

      <p className="warning">
        <strong>{t('backup.confirmWarningTitle')}</strong>
        {t('backup.confirmWarning')}
      </p>

      {candidate.needsCredential ? (
        <div className="field">
          <label htmlFor="restore-credential">{t('backup.credentialLabel')}</label>
          <input
            id="restore-credential"
            type="password"
            value={credential}
            autoComplete="current-password"
            onChange={(e) => setCredential(e.target.value)}
            data-testid="restore-credential"
          />
          <p className="backup-hint">{t('backup.credentialHint')}</p>
        </div>
      ) : (
        <p className="backup-hint" data-testid="restore-no-credential">
          {t('backup.noCredentialNeeded')}
        </p>
      )}

      <p className="error" data-testid="restore-error">
        {error}
      </p>

      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        data-testid="restore-confirm"
        onClick={() => void confirm()}
      >
        {busy ? t('common.working') : t('backup.confirm')}
      </button>
      <button
        type="button"
        className="btn-link"
        data-testid="restore-cancel"
        onClick={() => void dismiss()}
      >
        {t('backup.cancel')}
      </button>
    </div>
  )
}
