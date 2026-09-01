import { LIBRARY_ASSETS } from "@/domains/library/constants/libraryAssets.js"
import {
  LIBRARY_PAGE_NAV_ARROW_BTN_CLASS,
  LIBRARY_PAGE_NAV_ARROW_IMG_CLASS,
  LIBRARY_PAGE_NAV_BAR_CLASS,
  LIBRARY_PAGE_NAV_SLOT_CLASS,
  LIBRARY_PAGE_NAV_SLOT_NEXT_CLASS,
} from "@/domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 기억의 서고 — spread 하단 이전/다음 페이지 버튼 */
export default function LibraryPageNavigation({
  canGoPrev = false,
  canGoNext = false,
  onPrevPage,
  onNextPage,
}) {
  return (
    <div className={LIBRARY_PAGE_NAV_BAR_CLASS} aria-label="페이지 이동">
      <div className={LIBRARY_PAGE_NAV_SLOT_CLASS}>
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={!canGoPrev}
          onClick={onPrevPage}
          className={LIBRARY_PAGE_NAV_ARROW_BTN_CLASS}
        >
          <PublicAsset
            src={LIBRARY_ASSETS.pageArrow}
            alt=""
            className={LIBRARY_PAGE_NAV_ARROW_IMG_CLASS}
          />
        </button>
      </div>
      <div className={LIBRARY_PAGE_NAV_SLOT_NEXT_CLASS}>
        <button
          type="button"
          aria-label="다음 페이지"
          disabled={!canGoNext}
          onClick={onNextPage}
          className={LIBRARY_PAGE_NAV_ARROW_BTN_CLASS}
        >
          <PublicAsset
            src={LIBRARY_ASSETS.pageArrow}
            alt=""
            className={`${LIBRARY_PAGE_NAV_ARROW_IMG_CLASS} rotate-180`}
          />
        </button>
      </div>
    </div>
  )
}
