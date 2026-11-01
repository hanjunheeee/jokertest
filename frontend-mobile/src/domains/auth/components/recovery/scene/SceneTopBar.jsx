// 계정 찾기 화면 위 줄: 이용 등급 그림(왼쪽), 배경음 조절(오른쪽)
// scene/RecoveryScene.jsx가 씀 (데스크톱은 왼쪽 위·오른쪽 아래 구석이었음)
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

// 뒤로 가기는 데스크톱처럼 카드 안 왼쪽 아래에 있음
export default function SceneTopBar() {
  return (
    // 폰 가로는 높이가 모자라서 위 줄을 카드 양옆 빈 곳에 띄움 (카드가 가운데 26rem이라 안 겹침)
    <header className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 land:pointer-events-none land:absolute land:inset-x-0 land:top-0 land:items-start land:pt-2 md:px-6 md:pt-5 [&>*]:pointer-events-auto">
      <PublicAsset
        src={LOGIN_ASSETS.ageRating}
        alt="전체이용가"
        className="pointer-events-none h-auto w-11 shrink-0 select-none md:w-16"
      />

      <SoundControl look="recovery" />
    </header>
  )
}
