import { useBgmAutoplay } from "./useBgmAutoplay.js"

export const globalBgmRef = { current: null }

export function getGlobalBgmRef() {
  return globalBgmRef
}

export function useBgmRuntime() {
  useBgmAutoplay(globalBgmRef)
}
