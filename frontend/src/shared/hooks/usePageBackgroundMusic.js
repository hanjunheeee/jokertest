import { getGlobalBgmRef } from "./useBgmRuntime.js"

export function usePageBackgroundMusic() {
  return getGlobalBgmRef()
}
