/**
 * The bodies the parser is written against — and an honest account of where
 * they came from.
 *
 * **These were not captured from the wire.** They are hand-authored to the shape
 * §14.1 records, because the environment this application is built in has no
 * outbound network and REALISATION.md rule 6 forbids any test in any layer from
 * making a request. Every structural detail below is taken from the
 * reconnaissance §14.1–14.3 wrote down — the `{message, error, data, meta}`
 * envelope, `kayit_tarihi` at a minute before midnight, the instrument codes —
 * but the *figures* are invented, and no byte here was ever sent by the source.
 *
 * **That sentence used to sit two paragraphs above one claiming the opposite**,
 * and `docs/realisation-vii.md` claimed the opposite too — that this file *is*
 * the capture. The truth is the narrow middle: a hand-authored reconstruction,
 * seeded with figures that were observed, in an envelope that was observed, and
 * in an **encoding that was not**. Realisation VII learned that the decimal
 * *places* vary and re-typed the frame by hand to prove it; re-typing it put
 * quotation marks around every value, and in August 2026 the source turned out
 * to send canonical decimals unquoted. Eight instruments stopped pricing, and
 * nothing here could have said so.
 *
 * So the frame below is now encoded by the source's own observed rule — a value
 * is written unquoted exactly when its decimal text round-trips — which is why
 * gold and silver appear bare and the currency pairs stay quoted. It is still
 * hand-authored and still no substitute for
 * `tests/fixtures/haremaltin/price-changed-2026-08-03.frame`, which is bytes
 * that really arrived and is what the parser is now proved against. This file's
 * job is to be the *shipped mock provider*, so what matters is that an
 * unpackaged run exercises the same encodings the real source sends.
 *
 * The honest claim about the history bodies is unchanged and still narrow:
 * **those tests turn on the shape, not on the numbers.** Whether the stale-tail
 * defence works depends on how far the newest returned date falls behind the one
 * requested, and that is a property this file can state truthfully without
 * having observed a single price. (The history endpoint does still send its
 * figures quoted — checked on 3 August 2026 — so those bodies are left alone.)
 *
 * Two deliberate departures from what a wire capture would look like, both for
 * reading rather than for the parser, which does not care:
 *
 *   - the JSON is indented, where the source sends it unspaced;
 *   - the history series are **trimmed**. A real body for `GOOD_HISTORY`'s range
 *     carries about twenty-eight rows, one per trading day, and one back to 2012
 *     carries some three thousand. Ten rows and nine rows respectively, because
 *     what the parser turns on is the envelope and the tail, and thirty
 *     hand-typed rows would be thirty chances to typo a fixture.
 *
 * Figures are mid-2026 Turkish, anchored on the ₺6.505/g gram price §18.4
 * records — which is also, deliberately, the last close in `GOOD_HISTORY`.
 */

import type { HistoryRequest } from '../provider.js'

/**
 * One `price_changed` frame: all ten mapped instruments, and three the
 * application must be seen to ignore.
 *
 * **All ten mapped quotes clear `MAX_UNIT_PRICE`, and that is a fact about the
 * ceiling rather than about the fixture.** These figures came off the wire on
 * 30 July 2026: `GREMESE_ESKI` at ₺100.496 and `ATA5_ESKI` at ₺206.869. Against
 * the ₺100.000 bound that shipped in Realisation V both were refused, which
 * meant a real frame stored nothing at all — and, because `cleanPrice` gates the
 * manual price setter too, that the owner could not type a beşli price by hand
 * either. The bound is now ₺500.000 (`units.ts`), so the frame yields ten.
 *
 * An earlier draft of this fixture anchored the coin ladder low enough to fit
 * under the old ceiling. That would have produced a tidy green test and hidden a
 * defect that had already shipped.
 *
 * The three unmapped instruments each earn their place:
 *
 *   - **`ALTIN`** (HAS ALTIN) is the label that looks like the gram price and is
 *     not it — 7 of the owner's 24 dated prices fall in its band against 16 for
 *     `KULCEALTIN` (§14.3).
 *   - **`AYAR22`** is ziynet's old row, struck from the closed list this rung.
 *   - **`GUMUSUSD`** is quoted per **kilogram in dollars**, and its danger is
 *     that ₺2.036 per unit is an entirely plausible-looking figure. Taking it
 *     for silver would be wrong by a factor of a thousand and in the wrong
 *     currency, and nothing on screen would say so.
 *
 * `USDTRY` ends `.2950` and `GUMUSTRY` ends `.1749` on purpose: one sits exactly
 * on the rounding boundary the third decimal decides and the other just below
 * it, so a parser that truncated instead of rounding would be caught by the
 * first and a parser that rounded up regardless by the second. The value that
 * separates string assembly from `parseFloat(x) * 100` is a rarer thing — about
 * one four-decimal string in two thousand — and lives in the test rather than
 * here, since a fixture claiming to be a frame should look like one.
 */
export const PRICE_CHANGED_FRAME = `42["price_changed",{"meta":{"time":1785434165076},"data":{
  "KULCEALTIN":{"code":"KULCEALTIN","alis":6212.85,"satis":6251.37,"dusuk":"6180.00","yuksek":"6266.00","dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "ALTIN":{"code":"ALTIN","alis":"6168.000","satis":"6238.890","dusuk":"6150.000","yuksek":"6250.000","dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "AYAR22":{"code":"AYAR22","alis":"5690.00","satis":"5731.00","dusuk":"5660.00","yuksek":"5744.00","dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:04"},
  "CEYREK_ESKI":{"code":"CEYREK_ESKI","alis":9975,"satis":10124,"dusuk":9950,"yuksek":10140,"dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "YARIM_ESKI":{"code":"YARIM_ESKI","alis":19900,"satis":20193,"dusuk":19850,"yuksek":20220,"dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "TEK_ESKI":{"code":"TEK_ESKI","alis":39560,"satis":40136,"dusuk":39500,"yuksek":40190,"dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "ATA_ESKI":{"code":"ATA_ESKI","alis":40720,"satis":41309,"dusuk":40660,"yuksek":41370,"dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "GREMESE_ESKI":{"code":"GREMESE_ESKI","alis":99070,"satis":100496,"dusuk":98900,"yuksek":100600,"dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "ATA5_ESKI":{"code":"ATA5_ESKI","alis":203900,"satis":206869,"dusuk":203500,"yuksek":207000,"dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "USDTRY":{"code":"USDTRY","alis":"47.3400","satis":"47.3600","dusuk":"47.2800","yuksek":"47.4100","dir":{"alis_dir":"down","satis_dir":"down"},"tarih":"30-07-2026 20:56:05"},
  "EURTRY":{"code":"EURTRY","alis":"54.4900","satis":"54.5200","dusuk":"54.4100","yuksek":"54.6000","dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "GUMUSTRY":{"code":"GUMUSTRY","alis":93.741,"satis":94.017,"dusuk":"93.400","yuksek":"94.220","dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"},
  "GUMUSUSD":{"code":"GUMUSUSD","alis":"1978.0000","satis":"1985.5000","dusuk":"1970.0000","yuksek":"1990.0000","dir":{"alis_dir":"up","satis_dir":"up"},"tarih":"30-07-2026 20:56:05"}
}}]`

/**
 * The range `GOOD_HISTORY` answers.
 *
 * Recorded beside the body because a response is only meaningful against the
 * request that produced it — the whole of §14.2 item 1 is a comparison between
 * the two, and a fixture that carried only one half could not state it.
 *
 * Thirty-nine days, and not fewer by accident: a span of thirty days or less
 * comes back with no `data` key at all (§14.2 item 2), so a well-formed series
 * cannot be asked for over a short range. `DATALESS_HISTORY` is that case.
 */
export const GOOD_HISTORY_REQUEST: HistoryRequest = Object.freeze({
  typeCode: 'gram',
  from: '2026-03-30',
  to: '2026-05-08'
})

/**
 * A well-formed multi-day series, current to the day it was asked for.
 *
 * Ten daily closes, ascending, ending exactly on the requested `to`. The gaps
 * between them are a trimmed fixture rather than a claim about trading days; the
 * parser judges the newest date and nothing about density.
 */
export const GOOD_HISTORY = `{"message":"","error":false,"data":[
  {"alis":"6290.0000","satis":"6322.0000","kayit_tarihi":"2026-03-30 23:59:04"},
  {"alis":"6308.0000","satis":"6339.5000","kayit_tarihi":"2026-04-01 23:59:02"},
  {"alis":"6321.0000","satis":"6353.0000","kayit_tarihi":"2026-04-06 23:59:07"},
  {"alis":"6342.5000","satis":"6374.0000","kayit_tarihi":"2026-04-10 23:59:03"},
  {"alis":"6360.0000","satis":"6391.5000","kayit_tarihi":"2026-04-15 23:59:09"},
  {"alis":"6379.0000","satis":"6410.0000","kayit_tarihi":"2026-04-20 23:59:01"},
  {"alis":"6397.5000","satis":"6429.0000","kayit_tarihi":"2026-04-24 23:59:06"},
  {"alis":"6418.5000","satis":"6450.5000","kayit_tarihi":"2026-04-29 23:59:02"},
  {"alis":"6454.0000","satis":"6486.0000","kayit_tarihi":"2026-05-05 23:59:08"},
  {"alis":"6472.0000","satis":"6505.0000","kayit_tarihi":"2026-05-08 23:59:01"}
],"meta":{"yuksek":"6505.0000","dusuk":"6322.0000"}}`

/**
 * The range `TRUNCATED_HISTORY` answers — the one §14.2 records as reproducing
 * the stale cache.
 *
 * Asking from 2022-01-01 returned a complete-looking series ending four months
 * early, while asking from 2023-01-01 returned one that was current. It is not
 * monotone in the start date, so nothing about a request predicts it and only
 * the response can be asked.
 */
export const TRUNCATED_HISTORY_REQUEST: HistoryRequest = Object.freeze({
  typeCode: 'gram',
  from: '2022-01-01',
  to: '2026-07-29'
})

/**
 * §14.2 item 1: `error:false`, a plausible four-year climb, and a tail that
 * stops on 2026-03-28 — one hundred and twenty-three days short of the date
 * requested.
 *
 * Nothing inside this body says so. Every record is well-formed, the envelope is
 * the good one, and a provider that trusted it would price today's holdings at
 * March's figure and show the owner a number four months old with no mark on it.
 */
export const TRUNCATED_HISTORY = `{"message":"","error":false,"data":[
  {"alis":"772.0000","satis":"780.5000","kayit_tarihi":"2022-01-03 23:59:04"},
  {"alis":"976.5000","satis":"985.0000","kayit_tarihi":"2022-06-01 23:59:02"},
  {"alis":"1110.0000","satis":"1120.0000","kayit_tarihi":"2023-01-02 23:59:05"},
  {"alis":"1941.0000","satis":"1955.0000","kayit_tarihi":"2024-01-02 23:59:03"},
  {"alis":"3218.0000","satis":"3240.0000","kayit_tarihi":"2025-01-02 23:59:07"},
  {"alis":"5782.0000","satis":"5810.0000","kayit_tarihi":"2026-01-02 23:59:01"},
  {"alis":"6371.0000","satis":"6402.5000","kayit_tarihi":"2026-03-26 23:59:02"},
  {"alis":"6386.5000","satis":"6418.0000","kayit_tarihi":"2026-03-27 23:59:08"},
  {"alis":"6393.0000","satis":"6425.0000","kayit_tarihi":"2026-03-28 23:59:01"}
],"meta":{"yuksek":"6425.0000","dusuk":"780.5000"}}`

/**
 * Twenty-nine days — inside the span that triggers §14.2 item 2.
 */
export const DATALESS_HISTORY_REQUEST: HistoryRequest = Object.freeze({
  typeCode: 'gram',
  from: '2026-07-01',
  to: '2026-07-29'
})

/**
 * §14.2 item 2: valid JSON, `error:false`, and **no `data` key at all** — not an
 * empty array.
 *
 * The distinction is the whole point. An empty array is an answer meaning "no
 * closes in that range"; an absent key is the source declining to answer, and
 * the source's own page guards on exactly this, which is what makes it expected
 * behaviour rather than a fault.
 *
 * `meta` is here because the envelope is otherwise the recorded one and a body
 * that kept only its message would be a weaker test — a parser must not mistake
 * a `meta` object for a series. What was actually observed is the absence of
 * `data`; `meta`'s contents in that case were not recorded, and the nulls below
 * are this file's invention like every other figure in it.
 */
export const DATALESS_HISTORY = `{"message":"","error":false,"meta":{"yuksek":null,"dusuk":null}}`
