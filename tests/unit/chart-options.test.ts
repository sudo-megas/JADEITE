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

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
  // Pinned rather than assumed: CI runners default to UTC, where the local-vs-UTC
  // tick bug below cannot reproduce (local midnight and its UTC calendar date
  // agree). Istanbul is the app's own target zone (UTC+3) and the one the bug
  // was found in, so the suite forces it for real rather than by accident of
  // wherever it happens to run.
  let originalTZ: string | undefined

  beforeAll(() => {
    originalTZ = process.env['TZ']
    process.env['TZ'] = 'Europe/Istanbul'
  })

  afterAll(() => {
    if (originalTZ === undefined) delete process.env['TZ']
    else process.env['TZ'] = originalTZ
  })

  it('is a true date axis, which is the whole of §11 mistyped-date argument', () => {
    const axis = dateAxis(palette, 'tr')
    expect(axis['type']).toBe('time')
    expect(at(axis, ['splitLine', 'show'])).toBe(false)
  })

  it('labels the axis in the app’s own date shape, never the machine’s (§13)', () => {
    const formatter = at(dateAxis(palette, 'tr'), ['axisLabel', 'formatter']) as (
      value: number
    ) => string
    // 8 May 2026, as an instant. The app writes GG/AA/YYYY.
    expect(formatter(Date.parse('2026-05-08T00:00:00Z'))).toBe('08/05/2026')

    // English renders the same shape rather than a different one. The two
    // languages used to disagree here — ICU gives Turkish dots — and the point
    // revision settled the date as a house format, so they converge. This
    // assertion therefore no longer discriminates one language from the other,
    // and it was never the thing that proved §13 anyway: what §13 forbids is
    // reading the *machine*, and the load-bearing proof of that is the money and
    // month-name work under a mutated LANG in tests/unit/format.test.ts.
    const english = at(dateAxis(palette, 'en'), ['axisLabel', 'formatter']) as (
      value: number
    ) => string
    expect(english(Date.parse('2026-05-08T00:00:00Z'))).toBe('08/05/2026')
  })

  it('names the day the tick actually sits on, not its UTC calendar date', () => {
    // ECharts places a time-axis tick using the *local* calendar — there is no
    // per-axis UTC switch — so a tick this suite pins at local midnight, 8 May
    // 2026 in the Europe/Istanbul zone this suite runs under (UTC+3), is an
    // instant one that's `2026-05-07T21:00:00Z` in UTC. A formatter built from
    // `toISOString()` would read that instant back as the 7th; one built from
    // local getters, matching where ECharts actually drew the tick, reads the 8th.
    const formatter = at(dateAxis(palette, 'tr'), ['axisLabel', 'formatter']) as (
      value: number
    ) => string
    const localMidnight = new Date(2026, 4, 8, 0, 0, 0).getTime()
    expect(formatter(localMidnight)).toBe('08/05/2026')
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
