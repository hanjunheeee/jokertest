// 화면을 옮겨도 끊기지 않는 배경 음악 audio 한 개
// 데스크톱·모바일 App.jsx가 씀, 음악 끄기 값이면 안 그림
import { BGM_ASSETS, MUSIC_PLAYBACK_ENABLED } from "@/shared/constants/bgmAssets.js"
import { getGlobalBgmRef, useBgmRuntime } from "@/shared/hooks/useBgmRuntime.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

export default function GlobalBgmLayer() {
  useBgmRuntime()

  if (!MUSIC_PLAYBACK_ENABLED) return null

  return <audio ref={getGlobalBgmRef()} src={publicAsset(BGM_ASSETS.loginMusic)} loop />
}
