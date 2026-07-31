/**
 * What this application is, who wrote it, and under what licence.
 *
 * The layout is the owner's, from `docs/conficon.md`: the tile centred at the
 * top, then the maker, then the version and the date it shipped, then where the
 * source lives, then the licence, and the motto last. Everything is centred on a
 * narrow column, which is why this does not reuse `.settings` — that panel is a
 * left-aligned 720px column of controls, and this page has nothing to operate.
 *
 * **The two addresses are text, not links, and that is the security posture
 * rather than an omission.** `session.ts` denies `window.open` unconditionally,
 * `will-navigate` admits only this application's own files, and the module
 * carries a `refuseExternalOpen` whose comment says it exists to be unused.
 * §3.3 is marked non-negotiable, and the reason it is written that way is that a
 * permitted top-level navigation would hand a remote origin the preload bridge
 * and with it the whole vault API. A GitHub link is not worth reopening that, so
 * the addresses are rendered in the monospace face and left selectable: the
 * owner can copy one, and nothing in this process ever opens it.
 *
 * The repository is also private for the length of the ladder (§17), so an
 * address that opened would mostly refuse the person who clicked it.
 *
 * The licence is the real thing rather than a summary. `__LICENCE_TEXT__` is the
 * repository's own `LICENSE`, compiled in by `electron.vite.config.ts` — one
 * copy, so the notice on screen cannot drift from the file that governs. It
 * opens in place instead of on a page of its own: thirty-five kilobytes of legal
 * text does not deserve a rail entry, and a reader who wants it wants it from
 * here.
 */

import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDate } from '../i18n/format.js'
import { useAppStore } from '../store/app-store.js'
import tileSrc from '../assets/tile.png'

/** Where the source lives. Stated, never opened — see the note above. */
const REPOSITORY_URL = 'https://github.com/sudo-megas/JADEITE'
const README_URL = 'https://github.com/sudo-megas/JADEITE#readme'

export function AboutPanel(): ReactElement {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const [licenceOpen, setLicenceOpen] = useState(false)

  if (licenceOpen) {
    return (
      <section className="about about--licence" data-testid="about-licence">
        <button
          type="button"
          className="btn-link about-back"
          data-testid="about-licence-close"
          onClick={() => setLicenceOpen(false)}
        >
          {t('about.licenceBack')}
        </button>
        <h1>{t('about.licenceTitle')}</h1>
        {/* Pre-formatted because the GPL is laid out in fixed columns, and
            re-wrapping it would be a modification of the notice. */}
        <pre className="about-licence-text" data-testid="about-licence-text">
          {__LICENCE_TEXT__}
        </pre>
      </section>
    )
  }

  return (
    <section className="about" data-testid="about-panel">
      <img className="about-tile" src={tileSrc} alt="" aria-hidden="true" draggable={false} />

      <h1 className="about-name">{t('common.brand')}</h1>
      <p className="about-lede">{t('about.tagline')}</p>

      <p className="about-line">
        <span className="about-label">{t('about.creator')}</span>
        <span className="about-value" data-testid="about-creator">
          sudo-megas
        </span>
      </p>

      <p className="about-line">
        <span className="about-label">{t('about.version')}</span>
        <span className="about-value" data-testid="about-version">
          {__APP_VERSION__}
        </span>
      </p>
      <p className="about-line">
        <span className="about-label">{t('about.released')}</span>
        <span className="about-value" data-testid="about-released">
          {formatDate(__RELEASE_DATE__, language)}
        </span>
      </p>

      <p className="about-line about-line--stacked">
        <span className="about-label">{t('about.repository')}</span>
        <span className="about-url" data-testid="about-repository">
          {REPOSITORY_URL}
        </span>
      </p>
      <p className="about-line about-line--stacked">
        <span className="about-label">{t('about.readme')}</span>
        <span className="about-url" data-testid="about-readme">
          {README_URL}
        </span>
      </p>
      <p className="about-note">{t('about.linksAreText')}</p>

      <p className="about-line">
        <span className="about-label">{t('about.licence')}</span>
        <span className="about-value" data-testid="about-licence-name">
          GPL-3.0-only
        </span>
      </p>
      <button
        type="button"
        className="btn-link"
        data-testid="about-licence-open"
        onClick={() => setLicenceOpen(true)}
      >
        {t('about.licenceRead')}
      </button>

      <p className="about-motto">{t('about.motto')}</p>
    </section>
  )
}
