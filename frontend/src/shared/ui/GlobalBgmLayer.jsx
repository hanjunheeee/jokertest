import { BGM_ASSETS, MUSIC_PLAYBACK_ENABLED } from "@/shared/constants/bgmAssets.js"
import { getGlobalBgmRef, useBgmRuntime } from "@/shared/hooks/useBgmRuntime.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

export default function GlobalBgmLayer() {
  useBgmRuntime()

  if (!MUSIC_PLAYBACK_ENABLED) return null

  return <audio ref={getGlobalBgmRef()} src={publicAsset(BGM_ASSETS.loginMusic)} loop />
}
