/**
 * A column header of the Payments grid — the name, and what can be done to it.
 *
 * There is no sort control and no filter here, unlike Section 1's. Section 2's
 * rows are the twelve months in their own order; sorting them by amount would
 * destroy the only ordering the section is about, and the paid/pending cue of
 * §7.2 would become nonsense the moment July sat above March.
 */

import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Bank } from '@shared/section2/types'

interface Props {
  bank: Bank
  /** A frozen year offers no menu at all (§7.3). */
  readOnly: boolean
  onRename: (id: number, name: string) => void
  onMove: (bank: Bank, delta: number) => void
  onDelete: (bank: Bank) => void
}

export function BankHeader({ bank, readOnly, onRename, onMove, onDelete }: Props): ReactElement {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState(bank.name)

  if (readOnly) {
    return (
      <div className="s2-header">
        <span className="s2-header-text" data-testid={`s2-header-${bank.name}`}>
          {bank.name}
        </span>
      </div>
    )
  }

  return (
    <div className="s2-header">
      <span className="s2-header-text" data-testid={`s2-header-${bank.name}`}>
        {bank.name}
      </span>

      <button
        type="button"
        className="s2-header-menu"
        aria-label={t('section2.bankMenu', { name: bank.name })}
        aria-expanded={open}
        data-testid={`s2-column-menu-${bank.name}`}
        onClick={() => {
          setDraftName(bank.name)
          setOpen((value) => !value)
        }}
      >
        ⋮
      </button>

      {open ? (
        <div className="s2-menu" role="dialog" aria-label={t('section2.bankMenuTitle', { name: bank.name })}>
          <div className="s2-menu-row">
            <label className="s2-field-label" htmlFor={`s2-rename-${bank.id}`}>
              {t('section2.rename')}
            </label>
            <input
              id={`s2-rename-${bank.id}`}
              type="text"
              value={draftName}
              data-testid={`s2-rename-input-${bank.name}`}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const cleaned = draftName.trim()
                if (cleaned.length === 0 || cleaned === bank.name) return
                onRename(bank.id, cleaned)
                setOpen(false)
              }}
            />
          </div>

          <div className="s2-menu-row">
            <span className="s2-field-label">{t('section2.order')}</span>
            <span>
              <button
                type="button"
                className="s2-btn-quiet"
                data-testid={`s2-move-left-${bank.name}`}
                onClick={() => onMove(bank, -1)}
              >
                {t('section2.moveLeft')}
              </button>
              <button
                type="button"
                className="s2-btn-quiet"
                data-testid={`s2-move-right-${bank.name}`}
                onClick={() => onMove(bank, 1)}
              >
                {t('section2.moveRight')}
              </button>
            </span>
          </div>

          <div className="s2-menu-foot">
            <button
              type="button"
              className="s2-btn-danger"
              data-testid={`s2-delete-${bank.name}`}
              onClick={() => {
                setOpen(false)
                onDelete(bank)
              }}
            >
              {t('section2.deleteColumn')}
            </button>
            <button type="button" className="s2-btn-quiet" onClick={() => setOpen(false)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
