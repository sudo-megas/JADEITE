/**
 * How smooth the workspace switch actually was.
 *
 * Realisation III's acceptance asks for a switch that is "smooth on the 280 Hz
 * main display and acceptable on the laptop". That is not a claim anyone should
 * make from a headless test runner, and it is not a claim worth making by eye
 * either — so the app measures itself and says what it found, exactly as
 * Realisation II's cold-start instrumentation does.
 *
 * Nothing leaves the machine. This is a number printed for its owner, which is
 * the opposite of the telemetry §16.2 forbids: no collection, no transmission,
 * no storage beyond the current session.
 *
 * The budget is derived rather than assumed. A frame interval is whatever this
 * display's interval is — 3.57 ms at 280 Hz, 16.67 ms at 60 Hz — so the median
 * of the samples stands in for it, and a frame is counted as dropped when it
 * took more than twice that. The same code therefore judges both machines
 * without either being written into it.
 */

import { create } from 'zustand'

export interface SwitchFrames {
  frames: number
  /** Milliseconds. Stands in for this display's frame interval. */
  median: number
  p95: number
  worst: number
  /** Frames that took more than twice the median — visible stutter. */
  dropped: number
  /** Rounded from the median, so the reading explains which display it saw. */
  impliedHz: number
}

interface FrameStatsState {
  last: SwitchFrames | null
  record(sample: SwitchFrames): void
}

export const useFrameStats = create<FrameStatsState>((set) => ({
  last: null,
  record: (sample) => set({ last: sample })
}))

/** Long enough to cover the 180 ms transition and settle afterwards. */
const SAMPLE_MS = 400

/** Below this there is nothing meaningful to say about a distribution. */
const MIN_FRAMES = 4

let measuring = false

function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  return sorted[index] ?? 0
}

/**
 * Watch the next few hundred milliseconds of frames and report on them.
 *
 * Re-entrant calls are ignored: switching year twice quickly should measure the
 * first switch cleanly rather than interleave two samplers.
 */
export function measureWorkspaceSwitch(): void {
  if (measuring) return
  if (typeof requestAnimationFrame !== 'function') return
  measuring = true

  const deltas: number[] = []
  let previous = performance.now()
  const startedAt = previous

  const tick = (now: number): void => {
    deltas.push(now - previous)
    previous = now

    if (now - startedAt < SAMPLE_MS) {
      requestAnimationFrame(tick)
      return
    }

    measuring = false
    if (deltas.length < MIN_FRAMES) return

    const sorted = [...deltas].sort((a, b) => a - b)
    const median = quantile(sorted, 0.5)
    const sample: SwitchFrames = {
      frames: deltas.length,
      median,
      p95: quantile(sorted, 0.95),
      worst: sorted[sorted.length - 1] ?? 0,
      dropped: median > 0 ? deltas.filter((d) => d > median * 2).length : 0,
      impliedHz: median > 0 ? Math.round(1000 / median) : 0
    }

    useFrameStats.getState().record(sample)

    // Printed in the house style of Realisation II's cold-start line, so the
    // same journey can be read off a terminal without opening Settings.
    console.info(
      `[workspace-switch] frames=${sample.frames} median=${sample.median.toFixed(1)} ms ` +
        `p95=${sample.p95.toFixed(1)} ms worst=${sample.worst.toFixed(1)} ms ` +
        `dropped=${sample.dropped} (~${sample.impliedHz} Hz)`
    )
  }

  requestAnimationFrame(tick)
}
