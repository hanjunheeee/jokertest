import { BGM_ASSETS, MUSIC_PLAYBACK_ENABLED } from "@/shared/constants/bgmAssets.js"
import { getGlobalBgmRef, useBgmRuntime } from "@/shared/hooks/useBgmRuntime.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

/** Router 밖 App 수명에 붙는 공통 BGM — 화면 전환마다 audio를 새로 만들지 않습니다. */
export default function GlobalBgmLayer() {
  useBgmRuntime()

  if (!MUSIC_PLAYBACK_ENABLED) return null

  return <audio ref={getGlobalBgmRef()} src={publicAsset(BGM_ASSETS.loginMusic)} loop />
}
