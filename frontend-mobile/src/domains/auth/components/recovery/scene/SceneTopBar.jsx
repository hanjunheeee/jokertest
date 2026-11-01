// 계정 찾기 화면 위 줄: 뒤로 가기·이용 등급 그림(왼쪽), 배경음 조절(오른쪽)
// scene/RecoveryScene.jsx가 씀
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

// onBack 없으면 뒤로 가기 버튼 없음 (재설정 화면은 데스크톱도 없음)
export default function SceneTopBar({ onBack }) {
  return (
    // 폰 가로는 높이가 모자라서 위 줄을 카드 양옆 빈 곳에 띄움 (카드가 가운데 26rem이라 안 겹침)
    <header className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 land:pointer-events-none land:absolute land:inset-x-0 land:top-0 land:items-start land:pt-2 md:px-6 md:pt-5 [&>*]:pointer-events-auto">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <BackButton
            onClick={onBack}
            className="size-11 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none active:scale-90"
            iconClassName="block h-auto w-full select-none"
          />
        )}
        <PublicAsset
          src={LOGIN_ASSETS.ageRating}
          alt="전체이용가"
          className="pointer-events-none h-auto w-11 shrink-0 select-none md:w-16"
        />
      </div>

      <SoundControl look="recovery" />
    </header>
  )
}
