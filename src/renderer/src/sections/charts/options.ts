/**
 * Chart options every view shares — XJADEITE §11, §12.2.
 *
 * Lifted out of `sections/altin/AltinEgrisi.tsx` at Realisation VIII, when
 * Overview became a second caller. **Only what gained one moved.** `Filter`,
 * `logFloor`, `spanDays` and `quantityLabel` stayed behind with exactly one
 * caller each, because REALISATION.md rule 7 asks a feature to earn its place
 * through repeated use and a shared module of things one view uses is a
 * dependency pretending to be an abstraction.
 *
 * **Colours arrive as an argument and are never read from the DOM.** The palette
 * is the one place permitted to hold a colour value (§12.2), so there is no
 * literal here for `audit-colours.mjs` to refuse and no `getComputedStyle`
 * guessing at what a token resolved to.
 *
 * A plain `.ts` module with no JSX, deliberately: `tests/unit/chart-options.test.ts`
 * pins these objects, and a test that had to import a `.tsx` to reach them would
 * drag React into a suite that runs under plain Node.
 */

import type { AppLanguage } from '../../i18n/format.js'
import { formatDate } from '../../i18n/format.js'
import type { Palette } from '@shared/theme/types'

/**
 * Whether a chart offers the §11 zoom pair.
 *
 * Altın Eğrisi wants both — a wheel over the plot and a brush beneath it — on a
 * date axis spanning years. Overview does not: a twelve-point category chart has
 * nothing to zoom into, and its `inside` handler would capture the mouse wheel
 * inside the element that *is* the dashboard's vertical scroller, so the page
 * would stop scrolling wherever the pointer happened to rest. That is found on
 * first use and never by a test.
 */
export interface BaseOptions {
  zoom?: boolean
}

/**
 * Everything every chart shares.
 *
 * The grid is generous on the left because a lira figure in the hundreds of
 * thousands is wide.
 */
export function base(palette: Palette, { zoom = true }: BaseOptions = {}): Record<string, unknown> {
  const tokens = palette.tokens
  return {
    backgroundColor: 'transparent',
    animationDuration: 220,
    textStyle: { color: tokens.textMuted, fontFamily: 'inherit', fontSize: 11 },
    grid: { top: 28, right: 18, bottom: zoom ? 44 : 28, left: 74, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.surfaceOverlay,
      borderColor: tokens.borderStrong,
      textStyle: { color: tokens.text, fontSize: 12 }
    },
    // Zoom, as §11 asks: a wheel over the plot and a brush beneath it.
    dataZoom: zoom
      ? [
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
      : []
  }
}

/** A true date axis (§11), never a category one. */
export function dateAxis(palette: Palette, language: AppLanguage): Record<string, unknown> {
  const tokens = palette.tokens
  return {
    type: 'time',
    axisLine: { lineStyle: { color: tokens.border } },
    axisTick: { lineStyle: { color: tokens.border } },
    axisLabel: {
      color: tokens.textSubtle,
      hideOverlap: true,
      // The app language formats the date, never the machine (§13).
      //
      // Built from local getters rather than `toISOString()`. ECharts places a
      // time-axis tick using the viewer's local calendar (there is no per-axis
      // UTC switch, only a chart-wide one this shared module cannot reach), so a
      // tick sitting at local midnight can be the previous UTC calendar day —
      // reading it back through `toISOString()` names that earlier day, one
      // short of the one the tick is actually drawn under. Local getters name
      // the same day ECharts drew.
      formatter: (value: number): string => {
        const d = new Date(value)
        const y = String(d.getFullYear()).padStart(4, '0')
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return formatDate(`${y}-${m}-${day}`, language)
      }
    },
    splitLine: { show: false }
  }
}

export function valueAxis(
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
 * A category axis of labels that are not instants.
 *
 * The twelve months of a year are buckets, not moments, and drawing them on the
 * time axis above would space February closer to January than March is to
 * February — true of the calendar and false of the figures, which each cover a
 * whole month whatever its length.
 */
export function categoryAxis(
  palette: Palette,
  categories: readonly string[]
): Record<string, unknown> {
  const tokens = palette.tokens
  return {
    type: 'category',
    data: [...categories],
    boundaryGap: true,
    axisLine: { lineStyle: { color: tokens.border } },
    axisTick: { show: false },
    axisLabel: { color: tokens.textSubtle, hideOverlap: true },
    splitLine: { show: false }
  }
}

/** One dated point of a value series. */
export interface DatedValue {
  date: string
  value: number
}

/**
 * The valuables value line (§11.3).
 *
 * Shared because Overview draws the same series from the same source. Reproducing
 * it there so the dashboard could have its own shape is precisely how the deck
 * and the workbook came to disagree about a kilogram of gold — §11's opening
 * paragraph is about two charts that drifted apart while both were maintained by
 * hand.
 */
export function valueSeriesOption(
  points: readonly DatedValue[],
  palette: Palette,
  language: AppLanguage,
  formatMoneyTry: (value: number) => string,
  options: BaseOptions = {}
): Record<string, unknown> {
  return {
    ...base(palette, options),
    xAxis: dateAxis(palette, language),
    yAxis: valueAxis(palette, false, formatMoneyTry),
    series: [
      {
        type: 'line',
        step: 'end',
        showSymbol: false,
        color: palette.tokens.accent,
        areaStyle: { opacity: 0.12 },
        data: points.map((point) => [Date.parse(`${point.date}T00:00:00Z`), point.value])
      }
    ]
  }
}
