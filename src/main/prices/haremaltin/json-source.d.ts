/**
 * `JSON.parse`'s third reviver argument, which TypeScript 7.0.2 does not yet
 * declare.
 *
 * ES2025 gives a reviver the *source text* of each primitive it visits, and
 * `parse.ts` uses it to keep a money figure as the decimal the source wrote
 * rather than as the double `JSON.parse` would otherwise hand on. The engines
 * this application runs on both have it — Node 24.18.1 and Electron 42.8.0
 * (V8 14.8.178.38) — measured in both binaries rather than assumed.
 *
 * Declared by **interface merging** rather than by casting the reviver at the
 * call site. A three-parameter function is not assignable to the two-parameter
 * signature `lib.es5.d.ts` declares, so a cast would be an assertion the
 * compiler cannot check; merging adds an overload instead, and the call site
 * stays ordinary code that says what it means.
 *
 * `context` is optional, and that is deliberate rather than defensive noise:
 * an engine without the feature calls the reviver with two arguments, and the
 * type has to admit the shape the code is written to survive.
 *
 * This file declares types and nothing else — no import, no URL, no call — so
 * `scripts/audit-egress.mjs`, which scans every `.ts` under `src/`, has nothing
 * to find here.
 */

declare global {
  interface JSON {
    parse(
      text: string,
      reviver: (
        this: unknown,
        key: string,
        value: unknown,
        context: { readonly source?: string } | undefined
      ) => unknown
    ): unknown
  }
}

export {}
