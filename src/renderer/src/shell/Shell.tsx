/**
 * The application shell — navigation rail, content area, keyboard map.
 *
 * Realisation II builds the frame; the sections that fill it arrive from III
 * onward.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ABOUT_DESTINATION_ID,
  BACKUP_DESTINATION_ID,
  DESTINATIONS,
  SETTINGS_DESTINATION_ID
} from './destinations.js'
import { AboutPanel } from './AboutPanel.js'
import { BrandMark } from './BrandMark.js'
import { InfoGlyph } from './InfoGlyph.js'
import { SectionStub } from './SectionStub.js'
import { Backup } from '../sections/backup/Backup.js'
import { Overview } from '../sections/overview/Overview.js'
import { focusYearIn } from '../sections/overview/navigate.js'
import { SettingsPanel } from './SettingsPanel.js'
import { Section1 } from '../sections/section1/Section1.js'
import { Section2 } from '../sections/section2/Section2.js'
import { Section3 } from '../sections/section3/Section3.js'
import { Section4 } from '../sections/section4/Section4.js'
import { AltinEgrisi } from '../sections/altin/AltinEgrisi.js'

interface Props {
  onLock: () => void
  /** A restore replaced the vault; the session it belonged to is over. */
  onRestored: () => void
}

export function Shell({ onLock, onRestored }: Props): ReactElement {
  const { t } = useTranslation()

  /**
   * Whether a backup is due (§15's periodic reminder).
   *
   * Read once, here, so the rail can carry the mark wherever the owner is —
   * a reminder that only appears on the page about reminders is not one. The
   * Backup page hands back a fresh answer whenever it changes the figure, which
   * is the whole of the coupling: no store, because the value is one boolean
   * read once per session and dropped with the window.
   */
  const [overdue, setOverdue] = useState(false)

  useEffect(() => {
    void window.jadeite.backup.status().then((result) => {
      if (result.ok) setOverdue(result.value.overdue)
    })
  }, [])
  /**
   * Which destination is on screen.
   *
   * A bare id until Realisation VIII. Overview deep links into the section that
   * owns a figure, and "Section 1" is not enough of an instruction when the
   * owner clicked the 2023 card — so the destination carries the year with it.
   * The rejected alternative was a router: this application has one window, six
   * destinations and no URL, and a router would bring a history stack nothing
   * asks for.
   *
   * The parameter is *not* the mechanism that opens the right year — the target
   * section's own store is, through `focusYear`, called synchronously before the
   * navigation so it cannot lose the race against that section's mount. This
   * carries the intent; `navigate` below performs it.
   */
  const [active, setActive] = useState<string>(DESTINATIONS[0]!.id)

  /**
   * Go to a destination, optionally with a year in mind.
   *
   * One place where "open the owning section at this year" is written down, so
   * a card and a tile cannot disagree about what that means.
   */
  const navigate = useCallback((id: string, year?: number): void => {
    if (year !== undefined) focusYearIn(id, year)
    setActive(id)
  }, [])

  const lock = useCallback(async () => {
    await window.jadeite.vault.lock()
    onLock()
  }, [onLock])

  // The keyboard map skeleton: Ctrl+1..6 for destinations, Ctrl+, for
  // settings, Ctrl+L to lock. Sections extend this from Realisation III.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey && !event.metaKey) return

      if (event.key === 'l' || event.key === 'L') {
        event.preventDefault()
        void lock()
        return
      }
      if (event.key === ',') {
        event.preventDefault()
        setActive(SETTINGS_DESTINATION_ID)
        return
      }
      if (event.key === 'b' || event.key === 'B') {
        event.preventDefault()
        setActive(BACKUP_DESTINATION_ID)
        return
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault()
        setActive(ABOUT_DESTINATION_ID)
        return
      }
      const digit = Number.parseInt(event.key, 10)
      if (Number.isInteger(digit)) {
        const target = DESTINATIONS.find((d) => d.accelerator === digit)
        if (target) {
          event.preventDefault()
          setActive(target.id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lock])

  const destination = DESTINATIONS.find((d) => d.id === active)

  return (
    <div className="shell-frame" data-testid="shell">
      <nav className="rail" aria-label={t('common.brand')}>
        {/* The mark leads the wordmark. The `nav` above already carries the
            brand as its accessible name, so the glyph is decorative here in the
            strict sense — hiding it from the accessibility tree says the name
            once rather than twice. */}
        <p className="rail-brand">
          <BrandMark />
          <span>{t('common.brand')}</span>
        </p>

        <ul className="rail-list">
          {DESTINATIONS.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="rail-item"
                aria-current={active === d.id ? 'page' : undefined}
                data-active={active === d.id ? 'true' : undefined}
                data-testid={`nav-${d.id}`}
                onClick={() => setActive(d.id)}
              >
                <span>{t(d.labelKey)}</span>
                <kbd className="rail-key">{d.accelerator}</kbd>
              </button>
            </li>
          ))}
        </ul>

        <div className="rail-foot">
          <button
            type="button"
            className="rail-item"
            aria-current={active === BACKUP_DESTINATION_ID ? 'page' : undefined}
            data-active={active === BACKUP_DESTINATION_ID ? 'true' : undefined}
            data-testid="nav-backup"
            onClick={() => setActive(BACKUP_DESTINATION_ID)}
          >
            <span>{t('nav.backup')}</span>
            {/* The mark is decorative and the sentence is on the button, so the
                dot carries no text of its own — a screen reader hearing
                "Yedekleme, bekliyor" would be told twice. */}
            {overdue ? <i className="rail-dot" data-testid="backup-overdue" aria-hidden="true" /> : null}
            <kbd className="rail-key">B</kbd>
          </button>
          <button
            type="button"
            className="rail-item"
            aria-current={active === SETTINGS_DESTINATION_ID ? 'page' : undefined}
            data-active={active === SETTINGS_DESTINATION_ID ? 'true' : undefined}
            data-testid="nav-settings"
            onClick={() => setActive(SETTINGS_DESTINATION_ID)}
          >
            <span>{t('nav.settings')}</span>
            <kbd className="rail-key">,</kbd>
          </button>
          <button
            type="button"
            className="rail-item"
            aria-current={active === ABOUT_DESTINATION_ID ? 'page' : undefined}
            data-active={active === ABOUT_DESTINATION_ID ? 'true' : undefined}
            data-testid="nav-about"
            onClick={() => setActive(ABOUT_DESTINATION_ID)}
          >
            {/* `.rail-item` justifies its children apart so the accelerator sits
                at the far edge. The mark belongs to the label rather than to the
                row, so the two travel together inside one span. */}
            <span className="rail-item-label">
              <InfoGlyph />
              <span>{t('nav.about')}</span>
            </span>
            <kbd className="rail-key">H</kbd>
          </button>
          <button type="button" className="rail-item" data-testid="nav-lock" onClick={() => void lock()}>
            <span>{t('nav.lock')}</span>
            <kbd className="rail-key">L</kbd>
          </button>
        </div>
      </nav>

      <main className="content" data-testid="content">
        {/* The two foot destinations are matched by name before the list is
            consulted. Falling through to `!destination` was how Settings used
            to be reached, and with a second foot entry that fallback would
            answer for *any* unknown id — including a typo. */}
        {active === SETTINGS_DESTINATION_ID ? (
          <SettingsPanel />
        ) : active === ABOUT_DESTINATION_ID ? (
          <AboutPanel />
        ) : active === BACKUP_DESTINATION_ID ? (
          <Backup onStatusChanged={setOverdue} onRestored={onRestored} />
        ) : destination?.id === 'section1' ? (
          <Section1 />
        ) : destination?.id === 'section2' ? (
          <Section2 />
        ) : destination?.id === 'section3' ? (
          <Section3 />
        ) : destination?.id === 'section4' ? (
          <Section4 />
        ) : destination?.id === 'altinEgrisi' ? (
          <AltinEgrisi />
        ) : destination?.id === 'overview' ? (
          <Overview navigate={navigate} />
        ) : destination ? (
          <SectionStub destination={destination} />
        ) : null}
      </main>
    </div>
  )
}
