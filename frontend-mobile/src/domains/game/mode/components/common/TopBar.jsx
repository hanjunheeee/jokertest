// 화면 위 고정 줄: 왼쪽 뒤로 가기, 가운데 제목, 오른쪽 자리(소리 조절 등)
// 모드 영역 페이지 3개가 씀, 데스크톱 왼쪽 아래 뒤로 가기를 위로 옮긴 것
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 위 줄 (스크롤해도 붙어 있음)
export default function TopBar({ onBack, backAriaLabel = "뒤로 가기", title = null, right = null }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-gradient-to-b from-black/80 to-black/0 px-3 land:h-12">
      <button
        type="button"
        aria-label={backAriaLabel}
        onClick={onBack}
        data-sfx-kind="ui-cancel"
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90"
      >
        <PublicAsset src={NAVIGATION_ASSETS.backButton} alt="" className="block h-auto w-full select-none" />
      </button>

      <div className="flex min-w-0 flex-1 justify-center">{title}</div>

      {/* 오른쪽이 비어도 제목이 가운데 오게 같은 폭 자리 둠 */}
      <div className="flex min-w-11 shrink-0 justify-end">{right}</div>
    </header>
  )
}
