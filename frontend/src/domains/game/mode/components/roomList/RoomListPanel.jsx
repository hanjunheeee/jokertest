import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import {
  ROOM_LIST_GRID_CLASS,
  ROOM_LIST_PANEL_CLASS,
  PANEL_INSET_CLASS,
  ROOM_LIST_ROW_CLASS,
  ROW_PLACEHOLDER_FRAME_CLASS,
  SCROLL_WRAP_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import RoomListRow from "@/domains/game/mode/components/roomList/RoomListRow.jsx"
import PaginationFooter from "@/domains/game/mode/components/roomList/PaginationFooter.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const SLOTS_PER_PAGE = 12

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
      <div className={PANEL_INSET_CLASS}>
        <div className={SCROLL_WRAP_CLASS}>
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
                  className={ROW_PLACEHOLDER_FRAME_CLASS}
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
