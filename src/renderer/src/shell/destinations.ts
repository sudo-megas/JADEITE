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
