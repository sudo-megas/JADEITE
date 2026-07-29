/**
 * Persons (§8.1) — free creation, rename, colour dot, order.
 *
 * A person's colour is a **slot in the active palette's accent sequence**, not a
 * colour. So the same person is one hue under Nord and another under Kanagawa
 * Lotus, and both are hues that palette chose for itself — §12.3's constraint
 * applied to people rather than years, and the reason no colour literal exists
 * anywhere in this file for `audit-colours.mjs` to refuse.
 *
 * **Ortak** is here but cannot be renamed or removed. It is where §18.3 item 8
 * sends every row whose owner the owner cannot recall, and where every other
 * person's rows go when that person is removed — so it is a contract, not merely
 * a default.
 */

import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Person, PersonUsage } from '@shared/section3/types'
import type { Palette } from '@shared/theme/types'
import { accentSlotCount, personAccent } from './format.js'

export interface PersonHandlers {
  onAdd: (name: string) => void
  onRename: (id: number, name: string) => void
  onColour: (id: number, colour: string | null) => void
  onMove: (person: Person, delta: number) => void
  onRequestDelete: (person: Person) => void
}

export function Persons({
  persons,
  palette,
  handlers
}: {
  persons: readonly Person[]
  palette: Palette
  handlers: PersonHandlers
}): ReactElement {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  return (
    <section className="s3-persons" data-testid="s3-persons">
      <h2>{t('section3.persons')}</h2>

      <ul className="s3-person-list">
        {persons.map((person, index) => (
          <PersonRow
            key={person.id}
            person={person}
            palette={palette}
            first={index === 0}
            last={index === persons.length - 1}
            handlers={handlers}
          />
        ))}
      </ul>

      <form
        className="s3-add-person"
        onSubmit={(e) => {
          e.preventDefault()
          const cleaned = name.trim()
          if (cleaned.length === 0) return
          handlers.onAdd(cleaned)
          setName('')
        }}
      >
        <input
          type="text"
          placeholder={t('section3.newPersonName')}
          aria-label={t('section3.newPersonName')}
          value={name}
          data-testid="s3-new-person-name"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="s3-btn" data-testid="s3-add-person">
          {t('section3.addPerson')}
        </button>
      </form>
    </section>
  )
}

function PersonRow({
  person,
  palette,
  first,
  last,
  handlers
}: {
  person: Person
  palette: Palette
  first: boolean
  last: boolean
  handlers: PersonHandlers
}): ReactElement {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(person.name)
  const [picking, setPicking] = useState(false)

  return (
    <li className="s3-person-row" data-testid={`s3-person-${person.id}`}>
      <button
        type="button"
        className="s3-dot-button"
        aria-label={t('section3.chooseColour', { name: person.name })}
        data-testid={`s3-person-colour-${person.id}`}
        onClick={() => setPicking((open) => !open)}
      >
        <span
          className="s3-dot"
          style={{ background: personAccent(palette, person.colour, person.position) }}
          aria-hidden="true"
        />
      </button>

      {person.isBuiltin ? (
        <span className="s3-person-name s3-builtin" data-testid={`s3-person-name-${person.id}`}>
          {person.name}
          <span className="lede"> {t('section3.builtinHint')}</span>
        </span>
      ) : (
        <input
          className="s3-person-name"
          type="text"
          aria-label={t('section3.personName')}
          value={draft}
          data-testid={`s3-person-name-${person.id}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const cleaned = draft.trim()
            if (cleaned.length === 0) {
              setDraft(person.name)
              return
            }
            if (cleaned !== person.name) handlers.onRename(person.id, cleaned)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraft(person.name)
              e.currentTarget.blur()
            }
          }}
        />
      )}

      <span className="s3-person-tools">
        <button
          type="button"
          className="s3-btn-quiet"
          disabled={first}
          aria-label={t('section3.moveUp', { name: person.name })}
          onClick={() => handlers.onMove(person, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="s3-btn-quiet"
          disabled={last}
          aria-label={t('section3.moveDown', { name: person.name })}
          onClick={() => handlers.onMove(person, 1)}
        >
          ↓
        </button>
        {person.isBuiltin ? null : (
          <button
            type="button"
            className="s3-btn-quiet"
            data-testid={`s3-delete-person-${person.id}`}
            onClick={() => handlers.onRequestDelete(person)}
          >
            {t('common.delete')}
          </button>
        )}
      </span>

      {picking ? (
        <span className="s3-slot-picker" data-testid={`s3-slot-picker-${person.id}`}>
          {Array.from({ length: accentSlotCount(palette) }, (_, slot) => (
            <button
              key={slot}
              type="button"
              className="s3-slot"
              aria-label={t('section3.colourSlot', { slot: slot + 1 })}
              data-testid={`s3-slot-${person.id}-${slot}`}
              onClick={() => {
                handlers.onColour(person.id, String(slot))
                setPicking(false)
              }}
            >
              <span
                className="s3-dot"
                style={{ background: personAccent(palette, String(slot), slot) }}
                aria-hidden="true"
              />
            </button>
          ))}
        </span>
      ) : null}
    </li>
  )
}

/**
 * The one dialogue Section 3 has.
 *
 * Removing a person is not on the typing path §6.4 protects, and it moves a
 * countable number of the owner's own rows, so it says how many before it does
 * anything — and says that none of them is deleted, because that is the part a
 * person would otherwise reasonably fear.
 */
export function ConfirmDeletePerson({
  person,
  usage,
  onCancel,
  onConfirm
}: {
  person: Person
  usage: PersonUsage
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  const { t } = useTranslation()

  return (
    <div
      className="s3-modal"
      role="dialog"
      aria-modal="true"
      data-testid="s3-confirm-delete-person"
      aria-label={t('section3.deletePersonTitle', { name: person.name })}
    >
      <div className="s3-modal-body">
        <h2>{t('section3.deletePersonTitle', { name: person.name })}</h2>
        <p className="lede" data-testid="s3-confirm-delete-person-detail">
          {usage.transactionCount === 0
            ? t('section3.deletePersonEmpty')
            : t('section3.deletePersonDetail', { count: usage.transactionCount })}
        </p>
        <div className="s3-menu-foot">
          <button
            type="button"
            className="s3-btn-danger"
            data-testid="s3-confirm-delete-person-yes"
            onClick={onConfirm}
          >
            {t('section3.deletePersonConfirm')}
          </button>
          <button type="button" className="s3-btn-quiet" onClick={onCancel}>
            {t('common.back')}
          </button>
        </div>
      </div>
    </div>
  )
}
