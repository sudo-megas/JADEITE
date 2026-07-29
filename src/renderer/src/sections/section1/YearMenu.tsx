/**
 * Things about the year you are looking at: its colour, and its removal.
 *
 * One menu rather than two controls, because both are about the workspace as a
 * whole rather than about anything inside it. It opens from the active chip, so
 * it is where the year already is.
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Palette } from '@shared/theme/types.js'
import { accentForYear } from '../../theme/accents.js'

interface Props {
  year: number
  anchorYear: number
  palette: Palette
  /** The stored override, or null when the year follows the sequence. */
  override: string | null
  /** Deleting the only year is refused; the switcher must have somewhere to be. */
  canDelete: boolean
  onSetAccent: (accent: string | null) => void
  onDelete: () => void
  onClose: () => void
}

export function YearMenu({
  year,
  anchorYear,
  palette,
  override,
  canDelete,
  onSetAccent,
  onDelete,
  onClose
}: Props): ReactElement {
  const { t } = useTranslation()
  const sequenceAccent = accentForYear(palette, year, anchorYear)

  return (
    <div className="s1-menu s1-year-menu" role="dialog" aria-label={t('section1.yearMenuTitle', { year })}>
      <p className="s1-field-label">{t('section1.accent')}</p>

      {/*
        The palette's own sequence, offered as itself. An override is a choice
        between this palette's accents, not an arbitrary colour — §12.3 keeps a
        year inside the palette's character, and the muting rules apply to an
        override exactly as they do to the sequence value.
      */}
      <ul className="s1-accent-grid">
        {palette.accentSequence.map((accent, index) => {
          const selected = override === null ? accent === sequenceAccent : override === accent
          return (
            <li key={accent}>
              <button
                type="button"
                className="s1-accent-swatch"
                style={{ background: accent }}
                aria-label={t('section1.accentChoice', { index: index + 1 })}
                aria-pressed={selected}
                data-selected={selected ? 'true' : undefined}
                data-testid={`accent-${index}`}
                onClick={() => onSetAccent(accent)}
              />
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        className="s1-btn-quiet"
        data-testid="accent-reset"
        disabled={override === null}
        onClick={() => onSetAccent(null)}
      >
        {t('section1.accentUseSequence')}
      </button>

      {canDelete ? (
        <div className="s1-menu-row s1-menu-foot">
          <button
            type="button"
            className="s1-btn-danger"
            data-testid="delete-year"
            onClick={() => {
              onClose()
              onDelete()
            }}
          >
            {t('section1.deleteYear')}
          </button>
          <button type="button" className="s1-btn-quiet" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      ) : (
        <div className="s1-menu-row s1-menu-foot">
          <p className="s1-hint">{t('section1.lastYearKept')}</p>
          <button type="button" className="s1-btn-quiet" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      )}
    </div>
  )
}
