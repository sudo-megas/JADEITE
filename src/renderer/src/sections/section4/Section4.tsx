/**
 * Section 4 — Calculation Zone (§9).
 *
 * "Deliberately unfancy": a list of label-and-value lines, with TOTAL, AVERAGE and
 * MEDIAN always visible above them. The source workbook only ever sketched this
 * section in placeholder text, so there is nothing here being reproduced — this is
 * the first real one.
 *
 * The three headers are always on screen, including when the list is empty, where
 * they say so rather than showing a zero. A zero total is a real answer for a list
 * of zeros; an empty list has no total, and the difference is worth a word.
 *
 * The keyboard path of §6.4 applies here too. The append row at the foot carries
 * nothing forward — every line in a scratchpad is its own thing — but Enter commits
 * it and returns the caret to the label, so a column of figures goes in without
 * reaching for anything.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { computeStatistics } from '@shared/section4/engine'
import type { Line } from '@shared/section4/types'
import { amountToInput, parseAmount, type ParseFailure } from '@shared/money'
import { formatNumber } from '../../i18n/format.js'
import { useAppStore } from '../../store/app-store.js'
import { useSection4Store } from '../../store/section4-store.js'

export function Section4(): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const store = useSection4Store()
  const { lines, loading, error, addToken } = store

  useEffect(() => {
    void store.load()
    // Loading once on mount is the intent; the store owns everything after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => computeStatistics(lines), [lines])

  if (loading && lines.length === 0) return <section className="s4" data-testid="section4" />

  return (
    <section className="s4" data-testid="section4">
      <header className="s4-stats" data-testid="s4-stats">
        <Statistic
          labelKey="section4.total"
          value={stats.count === 0 ? null : stats.total}
          language={language}
          testId="s4-total"
        />
        <Statistic
          labelKey="section4.average"
          value={stats.average}
          language={language}
          testId="s4-average"
        />
        <Statistic
          labelKey="section4.median"
          value={stats.median}
          language={language}
          testId="s4-median"
        />
        <p className="s4-count" data-testid="s4-count">
          {t('section4.counted', { count: stats.count })}
        </p>
      </header>

      {error ? (
        <p className="s4-error" role="alert" data-testid="section4-error">
          {t(`section4.errors.${error}`)}
          <button type="button" className="s4-btn-quiet" onClick={store.dismissError}>
            {t('common.close')}
          </button>
        </p>
      ) : null}

      <ol className="s4-lines" data-testid="s4-lines">
        {lines.map((line, index) => (
          <Row
            key={line.id}
            line={line}
            language={language}
            first={index === 0}
            last={index === lines.length - 1}
          />
        ))}
      </ol>

      <AppendRow language={language} addToken={addToken} />
    </section>
  )
}

/**
 * One of the three headers.
 *
 * Formatted with `formatNumber` rather than as currency: this is a calculation
 * zone, and a scratchpad figure is a number. Values are stored in the same
 * hundredths money uses, so the two never need separate conventions — only
 * separate presentation.
 */
function Statistic({
  labelKey,
  value,
  language,
  testId
}: {
  labelKey: string
  value: number | null
  language: 'tr' | 'en'
  testId: string
}): ReactElement {
  const { t } = useTranslation()
  return (
    <div className="s4-stat">
      <span className="s4-stat-label">{t(labelKey)}</span>
      <span className="s4-stat-value" data-testid={testId}>
        {value === null ? <span className="s4-none">{t('section4.none')}</span> : formatNumber(value / 100, language)}
      </span>
    </div>
  )
}

function Row({
  line,
  language,
  first,
  last
}: {
  line: Line
  language: 'tr' | 'en'
  first: boolean
  last: boolean
}): ReactElement {
  const { t } = useTranslation()
  const store = useSection4Store()
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="s4-line" data-testid={`s4-line-${line.id}`}>
      <LabelField
        value={line.label}
        testId={`s4-label-${line.id}`}
        onCommit={(label) => void store.updateLine({ id: line.id, label })}
      />

      <ValueField
        value={line.value}
        language={language}
        testId={`s4-value-${line.id}`}
        onCommit={(value) => void store.updateLine({ id: line.id, value })}
      />

      <span className="s4-line-tools">
        <button
          type="button"
          className="s4-btn-quiet"
          disabled={first}
          aria-label={t('section4.moveUp')}
          onClick={() => void store.moveLine(line, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="s4-btn-quiet"
          disabled={last}
          aria-label={t('section4.moveDown')}
          onClick={() => void store.moveLine(line, 1)}
        >
          ↓
        </button>

        {/* Two clicks rather than a dialogue, as the ledger does: one scratchpad
            line is a small thing to lose, and §9 is not a place for ceremony. */}
        {confirming ? (
          <button
            type="button"
            className="s4-btn-danger-quiet"
            data-testid={`s4-delete-confirm-${line.id}`}
            onClick={() => void store.deleteLine(line.id)}
          >
            {t('section4.deleteConfirm')}
          </button>
        ) : (
          <button
            type="button"
            className="s4-btn-quiet"
            aria-label={t('section4.deleteLine')}
            data-testid={`s4-delete-${line.id}`}
            onClick={() => setConfirming(true)}
          >
            ×
          </button>
        )}
      </span>
    </li>
  )
}

function LabelField({
  value,
  testId,
  onCommit
}: {
  value: string
  testId: string
  onCommit: (label: string) => void
}): ReactElement {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  return (
    <input
      className="s4-label"
      type="text"
      aria-label={t('section4.label')}
      value={draft}
      data-testid={testId}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/**
 * A figure, or nothing.
 *
 * Empty commits as null rather than as zero: a line with a label and no figure is
 * a heading, and a heading that counted as a zero would drag every average toward
 * it (§9, and the engine's opening note).
 */
function ValueField({
  value,
  language,
  testId,
  onCommit
}: {
  value: number | null
  language: 'tr' | 'en'
  testId: string
  onCommit: (value: number | null) => void
}): ReactElement {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [problem, setProblem] = useState<ParseFailure | null>(null)

  useEffect(() => {
    if (!editing) setDraft(amountToInput(value, language))
  }, [value, language, editing])

  function commit(): boolean {
    const parsed = parseAmount(draft, language)
    if (parsed.kind === 'error') {
      setProblem(parsed.reason)
      return false
    }
    setProblem(null)
    setEditing(false)
    if (parsed.kind === 'empty') {
      if (value !== null) onCommit(null)
      return true
    }
    if (parsed.minorUnits !== value) onCommit(parsed.minorUnits)
    return true
  }

  return (
    <span className="s4-value-cell">
      <input
        className="s4-value"
        type="text"
        inputMode="decimal"
        aria-label={t('section4.value')}
        aria-invalid={problem !== null}
        value={editing ? draft : value === null ? '' : formatNumber(value / 100, language)}
        data-testid={testId}
        onFocus={() => {
          setDraft(amountToInput(value, language))
          setEditing(true)
          setProblem(null)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          if (problem) setProblem(null)
        }}
        onBlur={() => {
          if (editing) commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (commit()) e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(amountToInput(value, language))
            setProblem(null)
            setEditing(false)
            e.currentTarget.blur()
          }
        }}
      />
      {problem ? (
        <p className="s4-problem" role="alert">
          {t(`section4.parse.${problem}`)}
        </p>
      ) : null}
    </span>
  )
}

/** The always-present line at the foot. Enter commits and comes back here. */
function AppendRow({
  language,
  addToken
}: {
  language: 'tr' | 'en'
  addToken: number
}): ReactElement {
  const { t } = useTranslation()
  const store = useSection4Store()
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<ParseFailure | null>(null)
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addToken === 0) return
    setLabel('')
    setValue('')
    setProblem(null)
    labelRef.current?.focus()
  }, [addToken])

  function submit(): void {
    const parsed = parseAmount(value, language)
    if (parsed.kind === 'error') {
      setProblem(parsed.reason)
      return
    }
    // A line with neither a label nor a figure is nothing at all.
    if (label.trim().length === 0 && parsed.kind === 'empty') return

    setProblem(null)
    void store.addLine({
      label: label.trim(),
      value: parsed.kind === 'amount' ? parsed.minorUnits : null
    })
  }

  return (
    <div
      className="s4-line s4-append"
      data-testid="s4-append"
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        submit()
      }}
    >
      <input
        ref={labelRef}
        className="s4-label"
        type="text"
        placeholder={t('section4.newLabel')}
        aria-label={t('section4.newLabel')}
        value={label}
        data-testid="s4-new-label"
        onChange={(e) => setLabel(e.target.value)}
      />
      <span className="s4-value-cell">
        <input
          className="s4-value"
          type="text"
          inputMode="decimal"
          placeholder={t('section4.newValue')}
          aria-label={t('section4.newValue')}
          aria-invalid={problem !== null}
          value={value}
          data-testid="s4-new-value"
          onChange={(e) => {
            setValue(e.target.value)
            if (problem) setProblem(null)
          }}
        />
        {problem ? (
          <p className="s4-problem" role="alert" data-testid="s4-append-problem">
            {t(`section4.parse.${problem}`)}
          </p>
        ) : null}
      </span>
      <span className="s4-line-tools">
        <button type="button" className="s4-btn" data-testid="s4-add-line" onClick={submit}>
          {t('section4.addLine')}
        </button>
      </span>
    </div>
  )
}
