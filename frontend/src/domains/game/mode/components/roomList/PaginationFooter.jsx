import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import {
  ROOM_LIST_PAGE_ARROW_BTN_CLASS,
  ROOM_LIST_PAGE_ARROW_IMG_CLASS,
  ROOM_LIST_PAGE_TEXT_CLASS,
  ROOM_LIST_PAGINATION_CLASS,
  ROOM_LIST_PAGINATION_FOOTER_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function PaginationFooter({ currentPage, pageCount, onPrevPage, onNextPage }) {
  return (
    <div className={ROOM_LIST_PAGINATION_FOOTER_CLASS}>
      <div className={ROOM_LIST_PAGINATION_CLASS} aria-label="페이지 이동">
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={currentPage === 0}
          onClick={onPrevPage}
          className={ROOM_LIST_PAGE_ARROW_BTN_CLASS}
        >
          <PublicAsset src={NAVIGATION_ASSETS.backButton} alt="" className={ROOM_LIST_PAGE_ARROW_IMG_CLASS} />
        </button>

        <span className={ROOM_LIST_PAGE_TEXT_CLASS}>
          {currentPage + 1} / {pageCount}
        </span>

        <button
          type="button"
          aria-label="다음 페이지"
          disabled={currentPage >= pageCount - 1}
          onClick={onNextPage}
          className={ROOM_LIST_PAGE_ARROW_BTN_CLASS}
        >
          <PublicAsset
            src={NAVIGATION_ASSETS.backButton}
            alt=""
            className={`${ROOM_LIST_PAGE_ARROW_IMG_CLASS} rotate-180`}
          />
        </button>
      </div>
    </div>
  )
}
