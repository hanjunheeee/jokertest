import { getGlobalBgmRef } from "./useBgmRuntime.js"

/** 페이지 우하단 SoundControl이 붙을 공통 BGM ref — 재생은 App의 GlobalBgmLayer가 담당합니다. */
export function usePageBackgroundMusic() {
  return getGlobalBgmRef()
}
