import type { RokugaApi } from './index'

declare global {
  interface Window {
    rokuga: RokugaApi
  }
}

export {}
