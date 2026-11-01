// 쪽 넘김 화살표 줄 (이전·다음), 책 아래 끝 안쪽
// book/BookSheet.jsx 아래 자리에 pages/LibraryPage.jsx가 넣음 (데스크톱 LibraryPageNavigation 자리)
import { LIBRARY_ASSETS } from "@/domains/library/constants/libraryAssets.js"
import { PAGE_NAV_ARROW_IMG_CLASS } from "@/domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { TAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 데스크톱 화살표 버튼처럼 살짝 흐리게, 끝 쪽이면 잠그고 투명하게 숨김 (누르는 칸만 44px)
const ARROW_BTN_CLASS = `${TAP_CLASS} w-14 opacity-90 transition hover:opacity-100 disabled:opacity-0`

// 다음 화살표는 같은 그림을 뒤집어 씀
export default function PageNavigation({ canPrev, canNext, onPrev, onNext }) {
  return (
    <div className="relative z-20 flex w-full shrink-0 items-end justify-between px-2 pb-1" aria-label="페이지 이동">
      <button type="button" aria-label="이전 페이지" disabled={!canPrev} onClick={onPrev} className={ARROW_BTN_CLASS}>
        <PublicAsset src={LIBRARY_ASSETS.pageArrow} alt="" className={PAGE_NAV_ARROW_IMG_CLASS} />
      </button>
      <button type="button" aria-label="다음 페이지" disabled={!canNext} onClick={onNext} className={ARROW_BTN_CLASS}>
        <PublicAsset src={LIBRARY_ASSETS.pageArrow} alt="" className={`${PAGE_NAV_ARROW_IMG_CLASS} rotate-180`} />
      </button>
    </div>
  )
}
