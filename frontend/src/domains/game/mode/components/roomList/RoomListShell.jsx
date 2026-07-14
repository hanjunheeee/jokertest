// 파일 역할: RoomListShell.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  ROOM_LIST_SHELL_CLASS,
  ROOM_LIST_TOOLBAR_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import RoomListActionButton from "@/domains/game/mode/components/roomList/RoomListActionButton.jsx"
import RoomListPanel from "@/domains/game/mode/components/roomList/RoomListPanel.jsx"

// 공개 방 목록 화면의 작업 버튼과 방 목록 패널을 조합합니다.
export default function RoomListShell({ rooms, onCreateGame, onQuickJoin, onRoomSelect }) {
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
