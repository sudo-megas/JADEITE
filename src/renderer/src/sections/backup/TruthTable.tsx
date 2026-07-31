/**
 * The Credentials & Backup Truth Table — XJADEITE §4.4, on screen.
 *
 * The specification calls this a verbatim contract, and Realisation IX puts it
 * in the application because the person who will need it most is the owner
 * three years from now, holding a drive and a card, with no repository to read.
 * It has to be true without a footnote and readable in thirty seconds.
 *
 * Three rows, and the third one says *cemetery*. It is kept because the whole
 * design rests on it: there is no third copy of the key, no back door and no
 * support channel, and a page that softened that would be describing a
 * different application. The honest limitation is kept for the same reason — a
 * stolen old backup plus its old password stays readable forever, because the
 * DEK never changes. Rotating a password does not reach copies an attacker
 * already holds. That is true of every encrypted-file scheme and it is written
 * here rather than left to be discovered.
 *
 * The live figure at the foot is the one thing here that is not §4.4: the
 * generation of the recovery key in force right now. It turns a contract into
 * an instruction — *the card you are holding should say this number* — and
 * costs one integer that the vault already knows.
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  /** The recovery-key generation in force (§4.3), or null while unknown. */
  generation: number | null
}

export function TruthTable({ generation }: Props): ReactElement {
  const { t } = useTranslation()

  const rows = [
    { id: 'healthy', case: t('backup.truthCase1'), outcome: t('backup.truthOutcome1') },
    { id: 'lost', case: t('backup.truthCase2'), outcome: t('backup.truthOutcome2') },
    { id: 'both', case: t('backup.truthCase3'), outcome: t('backup.truthOutcome3') }
  ]

  return (
    <section data-testid="truth-table">
      <h2 className="settings-heading">{t('backup.truthTitle')}</h2>
      <p className="lede">{t('backup.truthLede')}</p>

      <table className="truth">
        <thead>
          <tr>
            <th scope="col">{t('backup.truthColCase')}</th>
            <th scope="col">{t('backup.truthColOutcome')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid={`truth-${row.id}`}>
              <th scope="row">{row.case}</th>
              <td>{row.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="warning">
        <strong>{t('backup.truthMandatedTitle')}</strong>
        {t('backup.truthMandated')}
      </p>

      <p className="backup-hint">{t('backup.truthLimitation')}</p>

      {generation === null ? null : (
        <p className="backup-hint" data-testid="truth-generation">
          {t('backup.truthGeneration', { generation })}
        </p>
      )}
    </section>
  )
}
