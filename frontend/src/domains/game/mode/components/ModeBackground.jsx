// 파일 역할: ModeBackground.jsx - 화면을 구성하는 컴포넌트입니다.
import { MODE_SCREEN_ASSETS } from "@/domains/game/mode/constants/modeAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"

/** 게임 모드 계열 화면에서 쓰는 공통 배경입니다. */
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
