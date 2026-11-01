// 뒤로 가기 그림 버튼 (모바일 위 줄용, 누르는 자리 44px)
// top/SetupTopBar가 씀 (데스크톱 shared/ui/BackButton은 화면 파일이라 못 부름)
import PublicAsset from "@/shared/ui/PublicAsset"
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets"

// 효과음은 부르는 쪽(useGameSetupPage)이 직접 내서 data-sfx-owner로 기본음 막음
export default function BackButton({ onClick, ariaLabel = "뒤로 가기" }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-sfx-owner="explicit"
      onClick={onClick}
      className="group flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0"
    >
      <PublicAsset
        src={NAVIGATION_ASSETS.backButton}
        alt=""
        className="block w-11 select-none transition-transform group-active:scale-90"
      />
    </button>
  )
}
