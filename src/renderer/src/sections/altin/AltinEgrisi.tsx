/**
 * Altın Eğrisi — the charts that end PowerPoint (§11).
 *
 * **This is a view, never a data store.** It has no store of its own: it reads the
 * Section 3 store, because the ledger is the only input the charts have. That is
 * the whole answer to the defect it replaces — two charts maintained by hand in a
 * third application, which drifted a purchase apart from each other and from the
 * ledger they were supposed to describe. Nothing here is maintained, so nothing
 * here can drift.
 *
 * Three charts, all interactive, all palette-native:
 *
 *   Spektrum — unit price over time on a **true date axis** (§11.1). The date axis
 *              is the point: a mistyped date lands visibly in the wrong year
 *              instead of looking like the next bar along, which is how §18.3
 *              item 6's impossible date was found.
 *   Frekans  — acquisition quantity per date (§11.2), in each type's own unit and
 *              never scaled. 300 g is 300 g.
 *   Değer    — holdings valued at the newest price then known (§11.3).
 *
 * The **log-scale toggle** (§11) applies to the two charts whose values are
 * strictly positive. It exists so that 300 g never again has to be typed as 0.300
 * to survive a linear axis — and when the data does span orders of magnitude the
 * page says so, rather than leaving the owner to notice that the small bars have
 * become a line along the bottom.
 *
 * The market-value chart keeps a linear axis: a holding can legitimately be zero,
 * and can read negative while a disposal's matching purchases are still being
 * typed (§8.4), and neither has a place on a logarithmic scale. Dropping those
 * points to allow the toggle would be hiding data to make a chart prettier.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { EChartsCoreOption } from 'echarts/core'

import { buildSeries, spansOrdersOfMagnitude, type Series } from '@shared/altin/series'
import type { QuantityUnit, TypeCode } from '@shared/section3/types'
import { paletteById } from '@shared/theme/palettes'
import type { Palette } from '@shared/theme/types'
import { formatCount, formatDate, formatGrams, formatMoney } from '../../i18n/format.js'
import type { AppLanguage } from '../../i18n/format.js'
import { useAppStore } from '../../store/app-store.js'
import { useSection3Store } from '../../store/section3-store.js'
import { Chart } from './Chart.js'

const MS_PER_DAY = 86_400_000

export function AltinEgrisi(): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const paletteId = useAppStore((s) => s.paletteId)
  const store = useSection3Store()
  const { data, loading } = store

  const [logScale, setLogScale] = useState(false)
  const [types, setTypes] = useState<TypeCode[]>([])
  const [personIds, setPersonIds] = useState<number[]>([])

  // The ledger is Section 3's, so this section loads Section 3's store. Opening
  // Altın Eğrisi first must still draw something.
  useEffect(() => {
    if (!data) void store.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const palette = useMemo(() => paletteById(paletteId), [paletteId])

  const series = useMemo(
    () => (data ? buildSeries(data, { types, personIds }) : null),
    [data, types, personIds]
  )

  const unitOf = useMemo(() => {
    const map = new Map<TypeCode, QuantityUnit>()
    for (const type of data?.types ?? []) map.set(type.code, type.unit)
    return map
  }, [data])

  if (loading && !data) return <section className="altin" data-testid="altinEgrisi" />

  const empty = !series || series.spektrum.length === 0

  /** Whether the linear view is crushing the small values (§11's acceptance). */
  const crushed =
    series !== null &&
    (spansOrdersOfMagnitude(series.frekans.map((p) => p.quantity)) ||
      spansOrdersOfMagnitude(series.spektrum.map((p) => p.price)))

  return (
    <section className="altin" data-testid="altinEgrisi">
      <header className="altin-top">
        <label className="altin-toggle">
          <input
            type="checkbox"
            checked={logScale}
            data-testid="altin-log-toggle"
            onChange={(e) => setLogScale(e.target.checked)}
          />
          {t('altin.logScale')}
        </label>

        {data ? (
          <>
            <Filter
              label={t('altin.filterType')}
              testId="altin-type-filter"
              options={data.types.map((type) => ({
                value: type.code,
                label: t(`section3.types.${type.code}`)
              }))}
              selected={types}
              onToggle={(value) =>
                setTypes((current) =>
                  current.includes(value as TypeCode)
                    ? current.filter((c) => c !== value)
                    : [...current, value as TypeCode]
                )
              }
              onClear={() => setTypes([])}
              clearLabel={t('altin.allTypes')}
            />

            <Filter
              label={t('altin.filterPerson')}
              testId="altin-person-filter"
              options={data.persons.map((person) => ({
                value: String(person.id),
                label: person.name
              }))}
              selected={personIds.map(String)}
              onToggle={(value) =>
                setPersonIds((current) =>
                  current.includes(Number(value))
                    ? current.filter((c) => c !== Number(value))
                    : [...current, Number(value)]
                )
              }
              onClear={() => setPersonIds([])}
              clearLabel={t('altin.allPersons')}
            />
          </>
        ) : null}
      </header>

      {empty ? (
        <p className="altin-empty" data-testid="altin-empty">
          {t('altin.empty')}
        </p>
      ) : (
        <div className="altin-charts">
          {crushed && !logScale ? (
            <p className="altin-hint" role="status" data-testid="altin-crushed-hint">
              {t('altin.crushed')}
            </p>
          ) : null}

          <figure className="altin-figure">
            <figcaption>{t('altin.spektrum')}</figcaption>
            <Chart
              option={spektrumOption(series, palette, language, logScale, t)}
              resetKey={`spektrum-${palette.id}-${language}-${logScale}`}
              height={280}
              label={t('altin.spektrum')}
              testId="altin-spektrum"
              scale={logScale ? 'log' : 'linear'}
              spanDays={spanDays(series.spektrum.map((p) => p.date))}
            />
          </figure>

          <figure className="altin-figure">
            <figcaption>{t('altin.frekans')}</figcaption>
            <Chart
              option={frekansOption(series, palette, language, logScale, unitOf, t)}
              resetKey={`frekans-${palette.id}-${language}-${logScale}`}
              height={240}
              label={t('altin.frekans')}
              testId="altin-frekans"
              scale={logScale ? 'log' : 'linear'}
              spanDays={spanDays(series.frekans.map((p) => p.date))}
            />
          </figure>

          <figure className="altin-figure">
            <figcaption>{t('altin.marketValue')}</figcaption>
            <Chart
              option={valueOption(series, palette, language)}
              resetKey={`value-${palette.id}-${language}`}
              height={240}
              label={t('altin.marketValue')}
              testId="altin-market"
              scale="linear"
            />
            {logScale ? (
              <p className="altin-note" data-testid="altin-market-linear-note">
                {t('altin.marketStaysLinear')}
              </p>
            ) : null}
          </figure>

          {series.provisionalDates.length > 0 ? (
            <p className="altin-note" data-testid="altin-provisional-note">
              {t('altin.provisional', { count: series.provisionalDates.length })}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}

/** Days between the earliest and latest date, so a test can read the span. */
function spanDays(dates: readonly string[]): number {
  if (dates.length === 0) return 0
  let earliest = Infinity
  let latest = -Infinity
  for (const date of dates) {
    const value = Date.parse(`${date}T00:00:00Z`)
    if (Number.isNaN(value)) continue
    if (value < earliest) earliest = value
    if (value > latest) latest = value
  }
  if (earliest === Infinity) return 0
  return Math.round((latest - earliest) / MS_PER_DAY)
}

// --- The options ------------------------------------------------------------

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Everything every chart shares.
 *
 * Colours come from the palette, so all three are palette-native in all ten and no
 * component names a colour (§12.2). The grid is generous on the left because a
 * lira figure in the hundreds of thousands is wide.
 */
function base(palette: Palette): Record<string, unknown> {
  const tokens = palette.tokens
  return {
    backgroundColor: 'transparent',
    animationDuration: 220,
    textStyle: { color: tokens.textMuted, fontFamily: 'inherit', fontSize: 11 },
    grid: { top: 28, right: 18, bottom: 44, left: 74, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.surfaceOverlay,
      borderColor: tokens.borderStrong,
      textStyle: { color: tokens.text, fontSize: 12 }
    },
    // Zoom, as §11 asks: a wheel over the plot and a brush beneath it.
    dataZoom: [
      { type: 'inside', throttle: 40 },
      {
        type: 'slider',
        height: 16,
        bottom: 8,
        borderColor: tokens.border,
        fillerColor: tokens.selection,
        handleStyle: { color: tokens.accent },
        textStyle: { color: tokens.textSubtle }
      }
    ]
  }
}

/** A true date axis (§11), never a category one. */
function dateAxis(palette: Palette, language: AppLanguage): Record<string, unknown> {
  const tokens = palette.tokens
  return {
    type: 'time',
    axisLine: { lineStyle: { color: tokens.border } },
    axisTick: { lineStyle: { color: tokens.border } },
    axisLabel: {
      color: tokens.textSubtle,
      hideOverlap: true,
      // The app language formats the date, never the machine (§13).
      formatter: (value: number): string =>
        formatDate(new Date(value).toISOString().slice(0, 10), language)
    },
    splitLine: { show: false }
  }
}

function valueAxis(
  palette: Palette,
  logScale: boolean,
  formatter: (value: number) => string,
  min?: number
): Record<string, unknown> {
  const tokens = palette.tokens
  return {
    type: logScale ? 'log' : 'value',
    logBase: 10,
    ...(min === undefined ? {} : { min }),
    axisLine: { show: false },
    axisLabel: { color: tokens.textSubtle, formatter },
    splitLine: { lineStyle: { color: tokens.border, type: 'dotted' } }
  }
}

/**
 * Where a logarithmic bar axis should start.
 *
 * A bar is drawn from the axis floor, and a logarithmic axis has no zero to use
 * as one — so left to itself ECharts drops the floor several decades below the
 * data and every bar becomes a full-height stripe over three empty decades. One
 * decade below the smallest value gives each bar visible height and wastes no
 * space, which is the whole reason the toggle exists.
 */
function logFloor(values: readonly number[]): number | undefined {
  let smallest = Infinity
  for (const value of values) if (value > 0 && value < smallest) smallest = value
  if (smallest === Infinity) return undefined
  return 10 ** (Math.floor(Math.log10(smallest)) - 1)
}

/** A quantity in the unit its own type is counted in. */
function quantityLabel(
  quantity: number,
  typeCode: TypeCode,
  unitOf: Map<TypeCode, QuantityUnit>,
  language: AppLanguage
): string {
  const unit = unitOf.get(typeCode) ?? 'mg'
  if (unit === 'mg') return formatGrams(quantity, language)
  if (unit === 'piece') return formatCount(quantity, language)
  return formatMoney(quantity, 'USD', language)
}

function spektrumOption(
  series: Series,
  palette: Palette,
  language: AppLanguage,
  logScale: boolean,
  t: Translate
): EChartsCoreOption {
  // One line per type present, each taking the next palette accent, so a chart of
  // gold beside silver is legible in every palette without a colour being named.
  const byType = new Map<TypeCode, [number, number][]>()
  for (const point of series.spektrum) {
    const bucket = byType.get(point.typeCode) ?? []
    bucket.push([Date.parse(`${point.date}T00:00:00Z`), point.price])
    byType.set(point.typeCode, bucket)
  }

  return {
    ...base(palette),
    legend: {
      top: 0,
      textStyle: { color: palette.tokens.textMuted },
      data: [...byType.keys()].map((code) => t(`section3.types.${code}`))
    },
    xAxis: dateAxis(palette, language),
    yAxis: valueAxis(palette, logScale, (value) => formatMoney(value, 'TRY', language)),
    series: [...byType.entries()].map(([code, points], index) => ({
      name: t(`section3.types.${code}`),
      type: 'line',
      showSymbol: true,
      symbolSize: 6,
      smooth: false,
      color: palette.accentSequence[index % palette.accentSequence.length],
      data: points.sort((a, b) => a[0] - b[0])
    }))
  } as EChartsCoreOption
}

function frekansOption(
  series: Series,
  palette: Palette,
  language: AppLanguage,
  logScale: boolean,
  unitOf: Map<TypeCode, QuantityUnit>,
  t: Translate
): EChartsCoreOption {
  const byType = new Map<TypeCode, [number, number][]>()
  for (const point of series.frekans) {
    const bucket = byType.get(point.typeCode) ?? []
    bucket.push([Date.parse(`${point.date}T00:00:00Z`), point.quantity])
    byType.set(point.typeCode, bucket)
  }

  const firstType = [...byType.keys()][0] ?? ('gram' as TypeCode)

  return {
    ...base(palette),
    legend: {
      top: 0,
      textStyle: { color: palette.tokens.textMuted },
      data: [...byType.keys()].map((code) => t(`section3.types.${code}`))
    },
    xAxis: dateAxis(palette, language),
    // Labelled in the unit of the first type present: mixing coins and grams on
    // one axis is the owner's choice to make with the filter, not this chart's to
    // pretend away.
    yAxis: valueAxis(
      palette,
      logScale,
      (value) => quantityLabel(value, firstType, unitOf, language),
      logScale ? logFloor(series.frekans.map((p) => p.quantity)) : undefined
    ),
    series: [...byType.entries()].map(([code, points], index) => ({
      name: t(`section3.types.${code}`),
      type: 'bar',
      barMaxWidth: 18,
      color: palette.accentSequence[index % palette.accentSequence.length],
      data: points.sort((a, b) => a[0] - b[0])
    }))
  } as EChartsCoreOption
}

function valueOption(
  series: Series,
  palette: Palette,
  language: AppLanguage
): EChartsCoreOption {
  return {
    ...base(palette),
    xAxis: dateAxis(palette, language),
    yAxis: valueAxis(palette, false, (value) => formatMoney(value, 'TRY', language)),
    series: [
      {
        type: 'line',
        step: 'end',
        showSymbol: false,
        color: palette.tokens.accent,
        areaStyle: { opacity: 0.12 },
        data: series.marketValue.map((point) => [
          Date.parse(`${point.date}T00:00:00Z`),
          point.value
        ])
      }
    ]
  } as EChartsCoreOption
}

// --- The filters ------------------------------------------------------------

/**
 * A multiple-choice filter where nothing chosen means everything.
 *
 * Chips rather than a `<select multiple>`, which is unreadable at four entries and
 * unusable at ten, and which no keyboard user enjoys.
 */
function Filter({
  label,
  testId,
  options,
  selected,
  onToggle,
  onClear,
  clearLabel
}: {
  label: string
  testId: string
  options: readonly { value: string; label: string }[]
  selected: readonly string[]
  onToggle: (value: string) => void
  onClear: () => void
  clearLabel: string
}): ReactElement {
  return (
    <div className="altin-filter" data-testid={testId}>
      <span className="altin-filter-label">{label}</span>
      <button
        type="button"
        className="altin-chip"
        aria-pressed={selected.length === 0}
        data-active={selected.length === 0 ? 'true' : undefined}
        data-testid={`${testId}-all`}
        onClick={onClear}
      >
        {clearLabel}
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="altin-chip"
          aria-pressed={selected.includes(option.value)}
          data-active={selected.includes(option.value) ? 'true' : undefined}
          data-testid={`${testId}-${option.value}`}
          onClick={() => onToggle(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
