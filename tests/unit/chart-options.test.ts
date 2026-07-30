/**
 * The chart options, pinned — because nothing else pins them.
 *
 * Realisation VIII lifted `base`, `dateAxis`, `valueAxis` and the value-line
 * builder out of `AltinEgrisi.tsx` so Overview could call them too. The obvious
 * proof that such a move changed nothing is "Realisation VI's suite still
 * passes", and **it is false**: a repository-wide search of `tests/` finds no
 * assertion that reads any value out of any ECharts option object. `Chart.tsx`
 * renders `data-scale` from a JSX prop, not from what `valueAxis` returned, so
 * the axis could quietly flip to linear and `tests/e2e/altin.spec.ts` would go on
 * passing — including the case that exists to satisfy REALISATION.md:138, the
 * log-toggle acceptance line the whole chart view was built around.
 *
 * So these assertions were written against the functions where they stood,
 * before a line moved, which is what makes the lift checkable rather than
 * hopeful.
 */

import { describe, expect, it } from 'vitest'

import { paletteById } from '@shared/theme/palettes'
import {
  base,
  categoryAxis,
  dateAxis,
  valueAxis,
  valueSeriesOption
} from '../../src/renderer/src/sections/charts/options.js'

const palette = paletteById('default-dark')
const tokens = palette.tokens

/** ECharts options are nested plain objects; this reads a path without `any`. */
function at(option: Record<string, unknown>, path: readonly string[]): unknown {
  let node: unknown = option
  for (const key of path) {
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

describe('base', () => {
  it('paints from the palette and never from a literal', () => {
    const option = base(palette)
    expect(at(option, ['backgroundColor'])).toBe('transparent')
    expect(at(option, ['textStyle', 'color'])).toBe(tokens.textMuted)
    expect(at(option, ['tooltip', 'backgroundColor'])).toBe(tokens.surfaceOverlay)
    expect(at(option, ['tooltip', 'borderColor'])).toBe(tokens.borderStrong)
    expect(at(option, ['tooltip', 'textStyle', 'color'])).toBe(tokens.text)
  })

  it('offers §11 zoom by default — a wheel over the plot and a brush beneath', () => {
    const zoom = base(palette)['dataZoom'] as { type: string }[]
    expect(zoom).toHaveLength(2)
    expect(zoom[0]?.type).toBe('inside')
    expect(zoom[1]?.type).toBe('slider')
  })

  it('withholds both when asked, and takes the slider gutter back with them', () => {
    // Overview passes `false`: a twelve-point category chart has nothing to zoom
    // into, and the inside handler would swallow the mouse wheel inside the
    // element that is the dashboard's own scroller.
    const option = base(palette, { zoom: false })
    expect(option['dataZoom']).toEqual([])
    expect(at(option, ['grid', 'bottom'])).toBe(28)
    expect(at(base(palette), ['grid', 'bottom'])).toBe(44)
  })

  it('keeps the left gutter wide, because a lira figure in the hundred-thousands is', () => {
    expect(at(base(palette), ['grid', 'left'])).toBe(74)
  })
})

describe('dateAxis', () => {
  it('is a true date axis, which is the whole of §11 mistyped-date argument', () => {
    const axis = dateAxis(palette, 'tr')
    expect(axis['type']).toBe('time')
    expect(at(axis, ['splitLine', 'show'])).toBe(false)
  })

  it('formats its labels in the app language, never the machine (§13)', () => {
    const formatter = at(dateAxis(palette, 'tr'), ['axisLabel', 'formatter']) as (
      value: number
    ) => string
    // 8 May 2026, as an instant. Turkish writes it 08.05.2026.
    expect(formatter(Date.parse('2026-05-08T00:00:00Z'))).toBe('08.05.2026')

    const english = at(dateAxis(palette, 'en'), ['axisLabel', 'formatter']) as (
      value: number
    ) => string
    expect(english(Date.parse('2026-05-08T00:00:00Z'))).not.toBe('08.05.2026')
  })
})

describe('valueAxis', () => {
  it('flips between linear and logarithmic — the toggle REALISATION.md:138 asks for', () => {
    expect(valueAxis(palette, false, String)['type']).toBe('value')
    expect(valueAxis(palette, true, String)['type']).toBe('log')
    expect(valueAxis(palette, true, String)['logBase']).toBe(10)
  })

  it('carries a floor only when given one', () => {
    expect('min' in valueAxis(palette, true, String)).toBe(false)
    expect(valueAxis(palette, true, String, 1)['min']).toBe(1)
  })

  it('labels through the formatter it was handed', () => {
    const axis = valueAxis(palette, false, (value) => `<${value}>`)
    const formatter = at(axis, ['axisLabel', 'formatter']) as (value: number) => string
    expect(formatter(12)).toBe('<12>')
  })
})

describe('categoryAxis', () => {
  it('is a category axis, because twelve months are buckets and not instants', () => {
    const axis = categoryAxis(palette, ['Ocak', 'Şubat'])
    expect(axis['type']).toBe('category')
    expect(axis['data']).toEqual(['Ocak', 'Şubat'])
  })

  it('copies the categories rather than holding the caller array', () => {
    const months = ['Ocak']
    const axis = categoryAxis(palette, months)
    months.push('Şubat')
    expect(axis['data']).toEqual(['Ocak'])
  })
})

describe('valueSeriesOption', () => {
  it('draws the valuables line as a step, on a date axis, from the palette accent', () => {
    const option = valueSeriesOption(
      [
        { date: '2026-01-01', value: 1_000 },
        { date: '2026-05-08', value: 3_000 }
      ],
      palette,
      'tr',
      String
    )
    expect(at(option, ['xAxis', 'type'])).toBe('time')
    expect(at(option, ['yAxis', 'type'])).toBe('value')

    const series = option['series'] as {
      type: string
      step: string
      color: string
      data: number[][]
    }[]
    expect(series).toHaveLength(1)
    expect(series[0]?.type).toBe('line')
    // A holding is worth what it was worth until the next event changes it, so
    // the line steps rather than interpolating between two transactions.
    expect(series[0]?.step).toBe('end')
    expect(series[0]?.color).toBe(tokens.accent)
    expect(series[0]?.data).toEqual([
      [Date.parse('2026-01-01T00:00:00Z'), 1_000],
      [Date.parse('2026-05-08T00:00:00Z'), 3_000]
    ])
  })

  it('passes its zoom choice through to base', () => {
    expect(valueSeriesOption([], palette, 'tr', String)['dataZoom']).toHaveLength(2)
    expect(valueSeriesOption([], palette, 'tr', String, { zoom: false })['dataZoom']).toEqual([])
  })
})

describe('every palette', () => {
  it('resolves a colour for every option a chart reads', () => {
    // No literal appears above except through `tokens`; this walks all ten so a
    // palette missing one fails here rather than rendering transparent.
    for (const id of [
      'default-light',
      'default-dark',
      'noctalia',
      'catppuccin-latte',
      'catppuccin-frappe',
      'catppuccin-macchiato',
      'catppuccin-mocha',
      'rose-pine-dawn',
      'nord',
      'kanagawa-lotus'
    ]) {
      const each = paletteById(id)
      const option = base(each)
      expect(typeof at(option, ['textStyle', 'color'])).toBe('string')
      expect(at(option, ['textStyle', 'color'])).not.toBe('')
      expect(each.accentSequence.length).toBeGreaterThan(0)
    }
  })
})
