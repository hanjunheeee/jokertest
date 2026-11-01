// 모드 화면 배경 그림
// GameModePage·MultiplayEntryPage가 씀
import { MODE_SCREEN_ASSETS } from "@/domains/game/mode/constants/modeAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"

// 배경 그림 (기본은 모드 선택창 배경)
export default function ModeBackground({ src = MODE_SCREEN_ASSETS.bg }) {
  return (
    <img
      src={publicAsset(src)}
      alt=""
      className="absolute inset-0 h-full w-full object-cover object-center"
      draggable={false}
    />
  )
}
