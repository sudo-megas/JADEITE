/**
 * Yedekleme — take a backup, restore one, and read the contract (§15, §4.4).
 *
 * Everything here is one crossing of the bridge away from the main process, and
 * none of it carries a path. The owner chooses where a backup goes in the
 * operating system's own dialogue, which runs on the other side; this page
 * learns that one was written and when, and nothing about where.
 *
 * The reminder cadence sits beside the button it governs rather than in
 * Settings. It is the same argument that put price refresh in Settings and lost:
 * a control belongs with the thing it changes, and the only reason auto-refresh
 * lives under Ayarlar is that Section 3 has no other home for a machine
 * setting. This page is that home.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { SETTING_KEYS } from '@shared/ipc-contract'
import { BACKUP_REMINDER_CHOICES, type BackupStatus } from '@shared/backup/types'
import { formatDate } from '../../i18n/format.js'
import { useAppStore } from '../../store/app-store.js'
import { RestoreFlow } from './RestoreFlow.js'
import { TruthTable } from './TruthTable.js'

interface Props {
  /** Tell the rail whether a backup is due, so its mark stays honest. */
  onStatusChanged: (overdue: boolean) => void
  /** A restore replaced the vault; this session is over. */
  onRestored: () => void
}

export function Backup({ onStatusChanged, onRestored }: Props): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)

  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const load = useCallback(async () => {
    const result = await window.jadeite.backup.status()
    if (!result.ok) {
      setError(t(`errors.${result.error}`))
      return
    }
    setStatus(result.value)
    onStatusChanged(result.value.overdue)
  }, [onStatusChanged, t])

  useEffect(() => {
    void load()
  }, [load])

  async function takeBackup(): Promise<void> {
    setError('')
    setJustSaved(false)
    setBusy(true)
    const result = await window.jadeite.backup.create('manual')
    setBusy(false)

    if (result.ok) {
      setJustSaved(true)
      await load()
      return
    }
    if (result.error !== 'CANCELLED') setError(t(`errors.${result.error}`))
  }

  /**
   * Write first, then believe it — the same order `setPriceRefreshMinutes` uses
   * and for the same reason. A cadence showing on screen that the vault never
   * took is a page disagreeing with the database, which is the class of defect
   * this application exists to end.
   */
  async function setReminder(days: number | null): Promise<void> {
    if (!status || days === status.reminderDays) return
    const written = await window.jadeite.settings.set(
      SETTING_KEYS.backupReminderDays,
      days === null ? '0' : String(days)
    )
    if (!written.ok) {
      setError(t(`errors.${written.error}`))
      return
    }
    await load()
  }

  const lastBackup =
    status === null || status.lastBackupAt === null
      ? t('backup.never')
      : formatDate(status.lastBackupAt, language)

  return (
    <section className="settings" data-testid="backup-panel">
      <h2 className="settings-heading">{t('backup.title')}</h2>
      <p className="lede">{t('backup.lede')}</p>

      <div className="status-row">
        <span>{t('backup.lastBackup')}</span>
        <span data-testid="backup-last">{lastBackup}</span>
      </div>
      <div className="status-row">
        <span>{t('backup.count')}</span>
        <span data-testid="backup-count">{status?.count ?? 0}</span>
      </div>

      {status?.overdue ? (
        <p className="warning" data-testid="backup-overdue-note">
          <strong>{t('backup.overdueTitle')}</strong>
          {t('backup.overdue')}
        </p>
      ) : null}

      <p className="error" data-testid="backup-error">
        {error}
      </p>

      {justSaved ? (
        <p className="backup-hint" data-testid="backup-saved">
          {t('backup.saved')}
        </p>
      ) : null}

      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        data-testid="backup-create"
        onClick={() => void takeBackup()}
      >
        {busy ? t('common.working') : t('backup.create')}
      </button>

      <h2 className="settings-heading">{t('backup.reminder')}</h2>
      <div className="segmented" role="group" aria-label={t('backup.reminder')}>
        {BACKUP_REMINDER_CHOICES.map((days) => (
          <button
            key={days === null ? 'off' : days}
            type="button"
            className="segmented-item"
            data-selected={status?.reminderDays === days ? 'true' : undefined}
            aria-pressed={status?.reminderDays === days}
            data-testid={`backup-reminder-${days === null ? 'off' : days}`}
            onClick={() => void setReminder(days)}
          >
            {days === null ? t('backup.reminderOff') : t('backup.reminderDays', { days })}
          </button>
        ))}
      </div>

      <h2 className="settings-heading">{t('backup.restoreTitle')}</h2>
      <RestoreFlow onRestored={onRestored} />

      <TruthTable generation={status?.recoveryGeneration ?? null} />
    </section>
  )
}
