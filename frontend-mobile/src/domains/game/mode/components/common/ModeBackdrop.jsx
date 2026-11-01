// 모드 화면 배경 그림 (화면 전체에 고정, 내용만 스크롤)
// 모드 선택·방 목록·방 코드 페이지가 씀
import { MODE_SCREEN_ASSETS } from "@/domains/game/mode/constants/modeAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 배경 그림 + 아래쪽 어둡게 (글자·버튼 잘 보이게)
export default function ModeBackdrop({ src = MODE_SCREEN_ASSETS.bg }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <img
        src={publicAsset(src)}
        alt=""
        className="h-full w-full object-cover object-center"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/60" />
    </div>
  )
}
