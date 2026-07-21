// 파일 역할: RoomListPanel.jsx - 화면을 구성하는 컴포넌트입니다.
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import {
  ROOM_LIST_GRID_CLASS,
  ROOM_LIST_PANEL_CLASS,
  ROOM_LIST_PANEL_INSET_CLASS,
  ROOM_LIST_ROW_CLASS,
  ROOM_LIST_ROW_PLACEHOLDER_FRAME_CLASS,
  ROOM_LIST_SCROLL_WRAP_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import RoomListRow from "@/domains/game/mode/components/roomList/RoomListRow.jsx"
import PaginationFooter from "@/domains/game/mode/components/roomList/PaginationFooter.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 한 페이지의 카드 슬롯 수(2열x6행)입니다. 실제 방이 이보다 적어도(예: 마지막 페이지)
// 같은 수의 슬롯을 항상 그려서 페이지가 바뀌어도 그리드 높이가 흔들리지 않게 합니다.
const SLOTS_PER_PAGE = 12

// 공개 방 목록 패널입니다. 위쪽은 2열x6행 카드 그리드, 아래쪽은 고정 높이 페이지네이션
// footer로 나뉩니다. 목록은 스크롤하지 않고(패널이 overflow-hidden으로 넘치는 내용을 잘라냄),
// 선택/페이지 상태는 상위(RoomListShell)가 소유하고 이 컴포넌트는 전달받은 값을 그대로 그립니다.
export default function RoomListPanel({
  rooms,
  selectedRoomId,
  onSelectRoom,
  currentPage,
  pageCount,
  onPrevPage,
  onNextPage,
}) {
  return (
    <section className={ROOM_LIST_PANEL_CLASS} aria-label="공개 방 목록">
      <div className={ROOM_LIST_PANEL_INSET_CLASS}>
        <div className={ROOM_LIST_SCROLL_WRAP_CLASS}>
          <ul className={ROOM_LIST_GRID_CLASS}>
            {rooms.map((room) => (
              <RoomListRow
                key={room.id}
                room={room}
                selected={room.id === selectedRoomId}
                onSelect={() => onSelectRoom?.(room.id)}
              />
            ))}
            {Array.from({ length: Math.max(0, SLOTS_PER_PAGE - rooms.length) }, (_, index) => (
              <li key={`placeholder-${index}`} className={ROOM_LIST_ROW_CLASS} aria-hidden="true">
                <PublicAsset
                  src={ROOM_LIST_ASSETS.rowFrame}
                  alt=""
                  className={ROOM_LIST_ROW_PLACEHOLDER_FRAME_CLASS}
                />
              </li>
            ))}
          </ul>
        </div>

        <PaginationFooter
          currentPage={currentPage}
          pageCount={pageCount}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
        />
      </div>
    </section>
  )
}
