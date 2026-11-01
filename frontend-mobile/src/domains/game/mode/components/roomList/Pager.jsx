// 방 목록 아래 쪽 넘기기: 이전·다음 화살표 + "현재 / 전체"
// MultiplayEntryPage가 씀, 화살표는 데스크톱처럼 뒤로 가기 그림(다음은 뒤집음), 누르는 자리 44px
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const ARROW_BTN_CLASS =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 opacity-90 transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 disabled:brightness-75"

// 쪽 넘기기 (첫·끝 쪽이면 그쪽 화살표 잠금)
export default function Pager({ currentPage, pageCount, onPrev, onNext }) {
  return (
    <nav className="flex items-center justify-center gap-3 py-1" aria-label="페이지 이동">
      <button type="button" aria-label="이전 페이지" disabled={currentPage === 0} onClick={onPrev} className={ARROW_BTN_CLASS}>
        <PublicAsset src={NAVIGATION_ASSETS.backButton} alt="" className="block h-auto w-8 select-none" />
      </button>

      <span className="min-w-14 text-center font-subheading app-text-scaled [--app-text-size:1rem] font-semibold tabular-nums text-[#e8d5a8] [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
        {currentPage + 1} / {pageCount}
      </span>

      <button type="button" aria-label="다음 페이지" disabled={currentPage >= pageCount - 1} onClick={onNext} className={ARROW_BTN_CLASS}>
        <PublicAsset src={NAVIGATION_ASSETS.backButton} alt="" className="block h-auto w-8 rotate-180 select-none" />
      </button>
    </nav>
  )
}
