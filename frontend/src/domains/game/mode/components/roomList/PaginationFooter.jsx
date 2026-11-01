// 방 목록 아래 페이지 넘기기: 이전·다음 화살표 + "현재 / 전체"
// RoomListPanel이 씀
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import {
  PAGE_ARROW_BTN_CLASS,
  PAGE_ARROW_IMG_CLASS,
  PAGE_TEXT_CLASS,
  PAGINATION_CLASS,
  PAGINATION_FOOTER_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 페이지 넘기기 (첫·끝 페이지면 그쪽 화살표 잠금)
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

        {/* 다음 화살표는 뒤로 가기 그림을 뒤집어 씀 */}
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
