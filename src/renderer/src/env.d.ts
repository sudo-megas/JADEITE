declare module '*.css' {
  const content: string
  export default content
}

/**
 * Vite emits an imported image as an asset and hands back its URL. It needs no
 * configuration to do that, but it does need to be declared: `tsconfig.web.json`
 * sets `"types": []` and nothing here references `vite/client`, so without this
 * an image import type-checks as a missing module.
 */
declare module '*.png' {
  const src: string
  export default src
}

/** Compiled in by `electron.vite.config.ts` — see the `define` block there. */
declare const __APP_VERSION__: string
declare const __RELEASE_DATE__: string
declare const __REPOSITORY_URL__: string
declare const __LICENCE_TEXT__: string

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
