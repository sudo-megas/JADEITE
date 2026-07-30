/**
 * The ECharts instance lifecycle, in one place.
 *
 * ECharts is imported through `echarts/core` with only the charts and components
 * this application draws registered against it. The full bundle carries every
 * chart type it has ever shipped; §1 says dependency size is not a constraint, but
 * a megabyte of gauge charts and treemaps is not a dependency, it is ballast.
 *
 * Colours arrive as an argument rather than being read from the DOM. They come
 * from `@shared/theme/palettes`, which §12.2 names as the one place permitted to
 * hold a colour value, so there is no literal here for `audit-colours.mjs` to
 * refuse and no `getComputedStyle` guessing at what a token resolved to.
 *
 * The instance is disposed on unmount and re-observed on resize. Neither is
 * optional: an undisposed instance keeps a canvas and a render loop alive in a
 * section the owner has navigated away from, and this application is opened,
 * used and closed rather than left resident (§1).
 */

import { useEffect, useRef, type ReactElement } from 'react'

import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer
])

interface Props {
  /** A complete ECharts option object, rebuilt by the caller when data changes. */
  option: echarts.EChartsCoreOption
  /** Redrawn from scratch when this changes — a palette switch, for instance. */
  resetKey: string
  height: number
  label: string
  testId: string
  /** Surfaced as a data attribute so a test can read the axis actually in force. */
  scale?: 'linear' | 'log'
  /** Days between the first and last point, for the date-axis check of §11. */
  spanDays?: number
  /**
   * The wrapper's class, defaulting to Altın Eğrisi's own.
   *
   * Hard-coded until Realisation VIII, when Overview became a second caller and
   * would otherwise have inherited a stylesheet written for a different page.
   * Defaulted rather than required so §11's three charts are untouched by the
   * change that made room for the dashboard's.
   */
  className?: string
}

export function Chart({
  option,
  resetKey,
  height,
  label,
  testId,
  scale,
  spanDays,
  className = 'altin-chart'
}: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  // Created once per reset key. A palette change replaces the instance rather
  // than merging into it, because ECharts merges option objects and a stale
  // colour would otherwise survive the switch.
  useEffect(() => {
    const element = host.current
    if (!element) return

    const instance = echarts.init(element, undefined, { renderer: 'canvas' })
    chart.current = instance

    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(element)

    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [resetKey])

  // `notMerge` because every option here is built complete: merging would leave
  // a series behind after a filter removed it.
  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  return (
    <div
      ref={host}
      className={className}
      style={{ height: `${height}px` }}
      role="img"
      aria-label={label}
      data-testid={testId}
      data-scale={scale}
      data-span-days={spanDays}
    />
  )
}
