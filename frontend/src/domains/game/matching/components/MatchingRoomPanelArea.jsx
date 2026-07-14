// 파일 역할: MatchingRoomPanelArea.jsx - 화면을 구성하는 컴포넌트입니다.
import MatchingPopupPanel from "./MatchingPopupPanel.jsx"
import RoomCodeViewModal from "./RoomCodeViewModal.jsx"

/** 중앙 매칭 팝업과 초대코드 모달을 함께 관리하는 화면 영역입니다. */
export default function MatchingRoomPanelArea({
  visible,
  slots,
  roomCode,
  roomCodeOpen,
  onRoomCodeOpen,
  onRoomCodeClose,
  isHost,
  onStartGame,
  onDeleteRoom,
  onLeaveRoom,
}) {
  return (
    <>
      <MatchingPopupPanel
        visible={visible}
        slots={slots}
        onRoomCodeView={onRoomCodeOpen}
        isHost={isHost}
        onStartGame={onStartGame}
        onDeleteRoom={onDeleteRoom}
        onLeaveRoom={onLeaveRoom}
      />

      <RoomCodeViewModal
        open={roomCodeOpen}
        onClose={onRoomCodeClose}
        roomCode={roomCode}
      />
    </>
  )
}
