// 앱 전체 배경음 audio 하나를 가리키는 ref와 재생 훅
// GlobalBgmLayer가 audio에 붙이고, SoundControl·PageSoundControlArea가 같은 ref로 조절
import { useBgmAutoplay } from "./useBgmAutoplay.js"

// 화면마다 audio를 따로 안 만들고 이 하나를 같이 씀
export const globalBgmRef = { current: null }

// 컴포넌트 기본값 인자로 넘기기용
export function getGlobalBgmRef() {
  return globalBgmRef
}

// GlobalBgmLayer가 한 번 부름
export function useBgmRuntime() {
  useBgmAutoplay(globalBgmRef)
}
