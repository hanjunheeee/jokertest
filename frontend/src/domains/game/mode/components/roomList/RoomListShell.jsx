import {
  ROOM_LIST_SHELL_CLASS,
  ROOM_LIST_TOOLBAR_CLASS,
} from "../../constants/roomListLayout.js"
import RoomListActionButton from "./RoomListActionButton.jsx"
import RoomListPanel from "./RoomListPanel.jsx"

export default function RoomListShell({
  rooms,
  onCreateGame,
  onQuickJoin,
  onRoomSelect,
}) {
  return (
    <div className={ROOM_LIST_SHELL_CLASS}>
      <nav className={ROOM_LIST_TOOLBAR_CLASS} aria-label="방 목록 작업">
        <RoomListActionButton label="게임 만들기" onClick={onCreateGame} />
        <RoomListActionButton label="게임 찾기" onClick={onQuickJoin} />
      </nav>

      <RoomListPanel rooms={rooms} onRoomSelect={onRoomSelect} />
    </div>
  )
}
