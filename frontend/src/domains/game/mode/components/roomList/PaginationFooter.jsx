import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import {
  PAGE_ARROW_BTN_CLASS,
  PAGE_ARROW_IMG_CLASS,
  PAGE_TEXT_CLASS,
  PAGINATION_CLASS,
  PAGINATION_FOOTER_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function PaginationFooter({ currentPage, pageCount, onPrevPage, onNextPage }) {
  return (
    <div className={PAGINATION_FOOTER_CLASS}>
      <div className={PAGINATION_CLASS} aria-label="페이지 이동">
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={currentPage === 0}
          onClick={onPrevPage}
          className={PAGE_ARROW_BTN_CLASS}
        >
          <PublicAsset src={NAVIGATION_ASSETS.backButton} alt="" className={PAGE_ARROW_IMG_CLASS} />
        </button>

        <span className={PAGE_TEXT_CLASS}>
          {currentPage + 1} / {pageCount}
        </span>

        <button
          type="button"
          aria-label="다음 페이지"
          disabled={currentPage >= pageCount - 1}
          onClick={onNextPage}
          className={PAGE_ARROW_BTN_CLASS}
        >
          <PublicAsset
            src={NAVIGATION_ASSETS.backButton}
            alt=""
            className={`${PAGE_ARROW_IMG_CLASS} rotate-180`}
          />
        </button>
      </div>
    </div>
  )
}
