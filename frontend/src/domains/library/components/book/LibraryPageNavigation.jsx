// 금지된 기록 쪽 넘김 화살표 줄 (이전·다음)
// book/LibraryBookContent.jsx가 씀
import { LIBRARY_ASSETS } from "../../../../domains/library/constants/libraryAssets.js"
import {
  PAGE_NAV_ARROW_BTN_CLASS,
  PAGE_NAV_ARROW_IMG_CLASS,
  PAGE_NAV_BAR_CLASS,
  PAGE_NAV_SLOT_CLASS,
  PAGE_NAV_SLOT_NEXT_CLASS,
} from "../../../../domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset"

// 끝 쪽이면 그쪽 화살표 잠그고 투명하게 숨김
export default function LibraryPageNavigation({
  canGoPrev = false,
  canGoNext = false,
  onPrevPage,
  onNextPage,
}) {
  return (
    <div className={PAGE_NAV_BAR_CLASS} aria-label="페이지 이동">
      <div className={PAGE_NAV_SLOT_CLASS}>
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={!canGoPrev}
          onClick={onPrevPage}
          className={PAGE_NAV_ARROW_BTN_CLASS}
        >
          <PublicAsset
            src={LIBRARY_ASSETS.pageArrow}
            alt=""
            className={PAGE_NAV_ARROW_IMG_CLASS}
          />
        </button>
      </div>
      <div className={PAGE_NAV_SLOT_NEXT_CLASS}>
        <button
          type="button"
          aria-label="다음 페이지"
          disabled={!canGoNext}
          onClick={onNextPage}
          className={PAGE_NAV_ARROW_BTN_CLASS}
        >
          <PublicAsset
            src={LIBRARY_ASSETS.pageArrow}
            alt=""
            className={`${PAGE_NAV_ARROW_IMG_CLASS} rotate-180`}
          />
        </button>
      </div>
    </div>
  )
}