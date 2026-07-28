/**
 * The recovery key, displayed exactly once — XJADEITE §4.3.
 *
 * There is no copy button and selection is disabled: this key belongs on
 * paper, not in a clipboard history or a screenshot buffer. The print
 * stylesheet exists so the owner can put it there directly.
 */

import { useState, type ReactElement } from 'react'
import { T } from '../strings'

interface Props {
  recoveryKey: string
  generation: number
  onAcknowledged: () => void
}

export function RecoveryKeyPanel({ recoveryKey, generation, onAcknowledged }: Props): ReactElement {
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <div className="panel panel--wide">
      <p className="brand">{T.brand}</p>
      <h1>{T.recoveryTitle}</h1>
      <p className="lede">
        {T.recoveryLede}
        {generation > 1 ? ` (#${generation})` : ''}
      </p>

      <div
        className="recovery-key"
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="recovery-key"
      >
        {recoveryKey}
      </div>

      <p className="warning">
        <strong>{T.recoveryWarningTitle}</strong>
        {T.recoveryWarningBody}
      </p>

      <label className="ack">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          data-testid="recovery-ack"
        />
        <span>{T.recoveryAck}</span>
      </label>

      <button
        className="btn-primary"
        disabled={!acknowledged}
        onClick={onAcknowledged}
        data-testid="recovery-continue"
      >
        {T.recoveryContinue}
      </button>
    </div>
  )
}
