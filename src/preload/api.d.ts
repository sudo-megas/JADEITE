import type { JadeiteApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    jadeite: JadeiteApi
  }
}

export {}
