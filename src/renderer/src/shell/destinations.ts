/**
 * The six destinations of §2, plus settings.
 *
 * Sections 1-4, Overview and Altın Eğrisi exist as destinations from
 * Realisation II; their contents arrive from III onward. The Realisation each
 * one is waiting for is recorded here so the stub can say so honestly rather
 * than showing an empty page.
 */

export interface Destination {
  id: string
  /** Key under `nav` in the translation catalogues. */
  labelKey: string
  /** Key under `sections`, describing what will live here. */
  descriptionKey: string
  /** Roman numeral of the Realisation that fills it in. */
  arrivesIn: string
  /** Ctrl/Cmd + this digit. */
  accelerator: number
}

export const DESTINATIONS: readonly Destination[] = Object.freeze([
  {
    id: 'section1',
    labelKey: 'nav.section1',
    descriptionKey: 'sections.section1',
    arrivesIn: 'III',
    accelerator: 1
  },
  {
    id: 'section2',
    labelKey: 'nav.section2',
    descriptionKey: 'sections.section2',
    arrivesIn: 'IV',
    accelerator: 2
  },
  {
    id: 'section3',
    labelKey: 'nav.section3',
    descriptionKey: 'sections.section3',
    arrivesIn: 'V',
    accelerator: 3
  },
  {
    id: 'section4',
    labelKey: 'nav.section4',
    descriptionKey: 'sections.section4',
    arrivesIn: 'VI',
    accelerator: 4
  },
  {
    id: 'overview',
    labelKey: 'nav.overview',
    descriptionKey: 'sections.overview',
    arrivesIn: 'VIII',
    accelerator: 5
  },
  {
    id: 'altinEgrisi',
    labelKey: 'nav.altinEgrisi',
    descriptionKey: 'sections.altinEgrisi',
    arrivesIn: 'VI',
    accelerator: 6
  }
])

export const SETTINGS_DESTINATION_ID = 'settings'

/**
 * Backup, restore and the credentials truth table (§15, §4.4).
 *
 * In the rail's foot beside Settings rather than in the numbered list above it,
 * and the reason is the same one that keeps Settings out of that list: the six
 * destinations are the owner's money, and this is the machine that holds it.
 * Sitting Yedekleme between Hesap Alanı and Genel Bakış would put a page about
 * disks and passwords in a row of pages about figures.
 */
export const BACKUP_DESTINATION_ID = 'backup'

/**
 * What the application is, who made it, and under what licence.
 *
 * In the foot for the same reason as its two neighbours: the numbered
 * destinations are the owner's money, and a page about the build is not one of
 * them. It takes a letter rather than a seventh digit — `H` for Hakkında, since
 * Turkish is the primary language (§13) and the accelerators should read in it.
 *
 * Last of the three, and above Kilitle. Yedekleme and Ayarlar are things the
 * owner goes to the foot to *do*; this is the one they go there to read, and
 * locking stays the final entry because it is the way out.
 */
export const ABOUT_DESTINATION_ID = 'about'

/** The destinations that live in the rail's foot, in the order they appear. */
export const FOOT_DESTINATION_IDS: readonly string[] = Object.freeze([
  BACKUP_DESTINATION_ID,
  SETTINGS_DESTINATION_ID,
  ABOUT_DESTINATION_ID
])
