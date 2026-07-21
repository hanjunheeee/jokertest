// 파일 역할: MultiplayRoomListArea.jsx - 화면을 구성하는 컴포넌트입니다.
import RoomListShell from "@/domains/game/mode/components/roomList/RoomListShell.jsx"

/** 멀티플레이 공개방 목록과 상단 작업 버튼을 보여줍니다. */
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
