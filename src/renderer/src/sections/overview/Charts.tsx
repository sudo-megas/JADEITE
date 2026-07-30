/**
 * Overview's three trend charts — XJADEITE §10.
 *
 * Every point comes out of `selectors.ts`, which is pure and unit-tested against
 * hand-typed constants. **That is not tidiness; it is the only way acceptance
 * box 1 can mean anything about a chart.** "Every Overview number equals its
 * section source" is uncheckable for a figure that exists solely as a pixel
 * inside a `<canvas>` — so the numbers exist first, in a module a test can hold,
 * and this file only decides how they look.
 *
 * **No zoom.** `base(palette, { zoom: false })` on all three. Altın Eğrisi's
 * pair — a wheel handler over the plot and a brush beneath — belongs to a date
 * axis spanning years. A twelve-point category chart has nothing to zoom into,
 * and the `inside` handler would swallow the mouse wheel inside the element that
 * *is* this page's scroller: the dashboard would simply stop scrolling wherever
 * the pointer came to rest, on a page built to be scrolled.
 *
 * **A year's line is the colour of its card.** Both index the palette's accent
 * sequence the same way `accentForYear` does, so the eye can carry a year from
 * the grid of cards down into the charts without being told which is which.
 */

import { useMemo, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { EChartsCoreOption } from 'echarts/core'

import type { LedgerData } from '@shared/section3/types'
import type { Palette } from '@shared/theme/types'
import type { AppLanguage } from '../../i18n/format.js'
import { formatMoney, monthNames } from '../../i18n/format.js'
import { accentAt } from '../../theme/accents.js'
import { Chart } from '../altin/Chart.js'
import { base, categoryAxis, valueAxis, valueSeriesOption } from '../charts/options.js'
import { netByMonthSeries, valueLine, yoySeries, type OverviewYear } from './selectors.js'

interface Props {
  years: readonly OverviewYear[]
  ledger: LedgerData | null
  palette: Palette
  language: AppLanguage
}

const CHART_HEIGHT = 260

export function Charts({ years, ledger, palette, language }: Props): ReactElement {
  const { t } = useTranslation()

  const net = useMemo(() => netByMonthSeries(years), [years])
  const yoy = useMemo(() => yoySeries(years), [years])
  const value = useMemo(() => valueLine(ledger), [ledger])

  const money = (amount: number): string => formatMoney(amount, 'TRY', language)

  /**
   * Rebuilt from scratch on a palette or language change.
   *
   * `Chart` disposes and recreates its instance when this moves, which is what a
   * colour change actually needs: ECharts merges an option by default and a
   * merged palette leaves the old series' strokes behind.
   */
  const resetKey = (name: string): string => `ov-${name}-${palette.id}-${language}`

  /**
   * The flat point list, gathered back into one line per year.
   *
   * `netByMonthSeries` returns points rather than lines on purpose — a flat list
   * is what a unit test can compare against hand-typed constants without
   * mirroring a grouping decision. Grouping is presentation, so it happens here.
   */
  const netLines = useMemo(() => {
    const byYear = new Map<number, { month: number; net: number; empty: boolean }[]>()
    for (const point of net.points) {
      const line = byYear.get(point.year) ?? []
      line.push({ month: point.month, net: point.net, empty: point.empty })
      byYear.set(point.year, line)
    }
    return [...byYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, months]) => ({ year, months: months.sort((a, b) => a.month - b.month) }))
  }, [net])

  const netOption = useMemo<EChartsCoreOption>(() => {
    const months = monthNames(language)
    return {
      ...base(palette, { zoom: false }),
      xAxis: categoryAxis(palette, months),
      yAxis: valueAxis(palette, false, money),
      legend: { show: true, textStyle: { color: palette.tokens.textMuted } },
      series: netLines.map((line, index) => ({
        type: 'line',
        name: String(line.year),
        smooth: false,
        showSymbol: false,
        connectNulls: false,
        color: accentAt(palette, index),
        // A month with nothing entered is a gap, not a zero. The current year's
        // remaining months would otherwise draw a line diving to the axis for
        // months that have not happened yet.
        data: line.months.map((month) => (month.empty ? null : month.net))
      }))
    } as EChartsCoreOption
  }, [netLines, palette, language])

  const yoyOption = useMemo<EChartsCoreOption>(
    () =>
      ({
        ...base(palette, { zoom: false }),
        xAxis: categoryAxis(
          palette,
          yoy.years.map((entry) => String(entry.year))
        ),
        yAxis: valueAxis(palette, false, money),
        series: [
          {
            type: 'bar',
            barMaxWidth: 42,
            data: yoy.years.map((entry, index) => ({
              value: entry.net,
              itemStyle: { color: accentAt(palette, index) }
            }))
          }
        ]
      }) as EChartsCoreOption,
    [yoy, palette, language]
  )

  const valueOption = useMemo<EChartsCoreOption>(
    () =>
      valueSeriesOption(
        value.kind === 'line' ? value.points : [],
        palette,
        language,
        money,
        { zoom: false }
      ) as EChartsCoreOption,
    [value, palette, language]
  )

  const excluded = [...new Set([...net.excluded, ...yoy.excluded].map((entry) => entry.year))].sort(
    (a, b) => a - b
  )

  return (
    <div className="ov-charts">
      <section className="ov-chart-block">
        <h2 className="ov-heading">{t('overview.charts.netByMonth')}</h2>
        <p className="lede">{t('overview.charts.netByMonthLede')}</p>
        <Chart
          className="ov-chart"
          option={netOption}
          resetKey={resetKey('net')}
          height={CHART_HEIGHT}
          label={t('overview.charts.netByMonth')}
          testId="ov-chart-net"
        />
        {/*
          Named rather than silently dropped, and named under *both* charts from
          one list — two charts that disagreed about which years they left out
          would be the drift §11's opening paragraph is about.
        */}
        {excluded.length > 0 ? (
          <p className="ov-chart-note" data-testid="ov-chart-excluded">
            {t('overview.charts.excluded', { years: excluded.join(', ') })}
          </p>
        ) : null}
      </section>

      <section className="ov-chart-block">
        <h2 className="ov-heading">{t('overview.charts.yoy')}</h2>
        <Chart
          className="ov-chart"
          option={yoyOption}
          resetKey={resetKey('yoy')}
          height={CHART_HEIGHT}
          label={t('overview.charts.yoy')}
          testId="ov-chart-yoy"
        />
      </section>

      <section className="ov-chart-block">
        <h2 className="ov-heading">{t('overview.charts.value')}</h2>
        {/*
          The caption is load-bearing. This line and the market tile above are two
          totals of the same holdings and they do not agree: the line values each
          date at the price the ledger's own rows recorded and stops at the last
          transaction, while the tile values today's position at the price the
          owner typed. Two disagreeing totals on one page that never explain
          themselves is verbatim the §8.6 defect this application answers, so this
          one explains itself.
        */}
        <p className="lede">{t('overview.charts.valueLede')}</p>
        <Chart
          className="ov-chart"
          option={valueOption}
          resetKey={resetKey('value')}
          height={CHART_HEIGHT}
          label={t('overview.charts.value')}
          testId="ov-chart-value"
        />
      </section>
    </div>
  )
}
