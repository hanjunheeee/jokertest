// 멀티 화면 방 목록 자리
// MultiplayEntryPage가 씀
import RoomListShell from "@/domains/game/mode/components/roomList/RoomListShell.jsx"

export default function MultiplayRoomListArea({ rooms, onCreateGame, onJoinByCode, onEnterRoom, isJoining }) {
  return (
    <RoomListShell
      rooms={rooms}
      onCreateGame={onCreateGame}
      onJoinByCode={onJoinByCode}
      onEnterRoom={onEnterRoom}
      isJoining={isJoining}
    />
  )
}
