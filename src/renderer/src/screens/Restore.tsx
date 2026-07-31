/**
 * Restoring before there is anything to unlock — XJADEITE §4.4, second row.
 *
 * The case this screen exists for is a disk that has died. There is no vault on
 * this machine, or there is one and its password is gone; either way the door
 * has to be *outside* the lock, because every other route to a backup in this
 * application is behind it. A restore feature reachable only from a vault you
 * can open is a restore feature for the one situation that never needed it.
 *
 * It is also the machine-transfer door (§15): the laptop meets the rig's `.jbk`
 * here, before it has been persuaded to open its own vault.
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from '../shell/BrandMark.js'
import { RestoreFlow } from '../sections/backup/RestoreFlow.js'

interface Props {
  onRestored: () => void
  onCancel: () => void
}

export function Restore({ onRestored, onCancel }: Props): ReactElement {
  const { t } = useTranslation()

  return (
    <div className="panel panel--wide" data-testid="restore-screen">
      <p className="brand">
        <BrandMark size={66} />
        <span>{t('common.brand')}</span>
      </p>
      <h1>{t('backup.restoreTitle')}</h1>

      <RestoreFlow onRestored={onRestored} />

      <button type="button" className="btn-link" data-testid="restore-back" onClick={onCancel}>
        {t('backup.back')}
      </button>
    </div>
  )
}
