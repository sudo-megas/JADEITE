/**
 * A destination that exists but is not yet furnished.
 *
 * It says which Realisation fills it in rather than pretending to be empty —
 * an unfinished thing that admits it is unfinished is not a defect.
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { Destination } from './destinations.js'

interface Props {
  destination: Destination
}

export function SectionStub({ destination }: Props): ReactElement {
  const { t } = useTranslation()

  return (
    <section className="stub" data-testid={`stub-${destination.id}`}>
      <h1>{t(destination.labelKey)}</h1>
      <p className="lede">{t(destination.descriptionKey)}</p>
      <p className="stub-note">{t('sections.comingIn', { roman: destination.arrivesIn })}</p>
    </section>
  )
}
