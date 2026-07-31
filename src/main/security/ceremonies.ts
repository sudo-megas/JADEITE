/**
 * Every credential ceremony, one at a time.
 *
 * Argon2id is configured at 256 MiB per derivation (§4.2), and the four
 * channels that run one — create, unlock, reset, and a container restore — are
 * all `invoke`able from the renderer as fast as it cares to call them. Measured
 * at the real parameters during Realisation IX's hardening pass, eight
 * concurrent derivations peaked at 1268 MiB against 243 MiB for one, and took
 * 4.67× the wall time rather than 8×: they genuinely run in parallel, bounded
 * only by libuv's four-thread default rather than by anything this application
 * decided.
 *
 * Serialised rather than refused. A queue needs no new error code, no message
 * to translate and no explanation to the owner, and the honest description of
 * two unlock attempts arriving together is that the second waits — which is
 * what a person double-clicking a button meant anyway. The cost is that a
 * second ceremony waits out the first; §3.4's ceilings exclude the Argon2id
 * time explicitly, so nothing the specification measures moves.
 *
 * It lives in its own module because both `ipc.ts` and `backup-ipc.ts` need it
 * and the first imports the second. One queue, shared: the point is a ceiling
 * on concurrent derivations, and two queues would have none.
 */

/** Runs to whatever the last ceremony settled as; never rejects. */
let queue: Promise<unknown> = Promise.resolve()

/**
 * Run `fn` after every ceremony already queued, and never throw.
 *
 * `INTERNAL` on a thrown exception, for the reason this file's neighbours give:
 * an error crossing the bridge carries a stack trace, and sometimes a path or
 * an argument, into the one process that is not supposed to see them.
 */
export function exclusively<R>(fn: () => Promise<R> | R, onFailure: R): Promise<R> {
  const run = async (): Promise<R> => {
    try {
      return await fn()
    } catch {
      return onFailure
    }
  }

  // Chained on both settlements, so one ceremony's failure cannot strand every
  // ceremony after it. `run` cannot reject, and this keeps the queue honest if
  // that ever stops being true.
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}
