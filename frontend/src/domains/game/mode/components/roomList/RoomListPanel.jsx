import { useRef } from "react"
import { ROOM_LIST_ASSETS } from "../../constants/roomListAssets.js"
import {
  ROOM_LIST_PANEL_CLASS,
  ROOM_LIST_PANEL_INSET_CLASS,
  ROOM_LIST_SCROLL_CLASS,
  ROOM_LIST_SCROLL_WRAP_CLASS,
} from "../../constants/roomListLayout.js"
import RoomListRow from "./RoomListRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function RoomListPanel({ rooms, onRoomSelect }) {
  const scrollRef = useRef(null)

  return (
    <section className={ROOM_LIST_PANEL_CLASS} aria-label="공개 방 목록">
      <div className={ROOM_LIST_PANEL_INSET_CLASS}>
        <div className={ROOM_LIST_SCROLL_WRAP_CLASS}>
          <ul ref={scrollRef} className={ROOM_LIST_SCROLL_CLASS}>
            {rooms.map((room) => (
              <RoomListRow
                key={room.id}
                stage={room.stage}
                current={room.current}
                max={room.max}
                title={room.title}
                onSelect={() => onRoomSelect?.(room.id)}
              />
            ))}
          </ul>

          <Scrollbar
            scrollRef={scrollRef}
            trackSrc={ROOM_LIST_ASSETS.scrollTrack}
            thumbSrc={ROOM_LIST_ASSETS.scrollThumb}
          />
        </div>
      </div>
    </section>
  )
}
