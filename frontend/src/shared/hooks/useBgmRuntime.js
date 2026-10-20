import { useBgmAutoplay } from "./useBgmAutoplay.js"

/** 앱 수명 동안 유지되는 공통 BGM audio ref — 페이지 전환 시 요소를 바꾸지 않는다. */
export const globalBgmRef = { current: null }

export function getGlobalBgmRef() {
  return globalBgmRef
}

/** App에서 한 번만 호출 — useSfxRuntime과 같은 수명 규칙입니다. */
export function useBgmRuntime() {
  useBgmAutoplay(globalBgmRef)
}
