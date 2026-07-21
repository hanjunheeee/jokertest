// 파일 역할: PaginationFooter.jsx - 화면을 구성하는 컴포넌트입니다.
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import {
  ROOM_LIST_PAGE_ARROW_BTN_CLASS,
  ROOM_LIST_PAGE_ARROW_IMG_CLASS,
  ROOM_LIST_PAGE_TEXT_CLASS,
  ROOM_LIST_PAGINATION_CLASS,
  ROOM_LIST_PAGINATION_FOOTER_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 목록 패널 하단, 카드 그리드 바로 아래에 고정 높이로 붙는 페이지 이동 영역입니다.
// 표시 전용 컴포넌트로, 현재/전체 페이지 값과 이동 콜백만 상위(RoomListShell)로부터 받습니다.
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
          {/* 기존 뒤로가기 버튼 이미지를 축소 재사용합니다. BackButton 컴포넌트 자체는
              복제하지 않고, 화면 좌하단의 실제 뒤로가기 버튼에도 영향을 주지 않습니다. */}
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
