// 대기방 가운데 팝업 + 방코드 창 + 시작 막힘 창 묶음
// GameMatchingPage가 씀, 값은 받은 그대로 아래로 넘김
import MatchingPopupPanel from "./MatchingPopupPanel.jsx"
import RoomCodeViewModal from "./RoomCodeViewModal.jsx"
import GameStartBlockedModal from "./GameStartBlockedModal.jsx"

export default function MatchingRoomPanelArea({
  visible,
  slots,
  waitingMessage = "",
  roomCode,
  roomCodeOpen,
  onRoomCodeOpen,
  onRoomCodeClose,
  roomCodeDisabled = false,
  isHost,
  isReady,
  isSettingReady,
  onToggleReady,
  isStarting,
  isRoomVerified,
  onStartGame,
  onDeleteRoom,
  isDeleting = false,
  onLeaveRoom,
  startBlockedMessage,
  onDismissStartBlocked,
}) {
  return (
    <>
      <MatchingPopupPanel
        visible={visible}
        slots={slots}
        waitingMessage={waitingMessage}
        onRoomCodeView={onRoomCodeOpen}
        roomCodeDisabled={roomCodeDisabled}
        isHost={isHost}
        isReady={isReady}
        isSettingReady={isSettingReady}
        onToggleReady={onToggleReady}
        isStarting={isStarting}
        isRoomVerified={isRoomVerified}
        onStartGame={onStartGame}
        onDeleteRoom={onDeleteRoom}
        isDeleting={isDeleting}
        onLeaveRoom={onLeaveRoom}
      />

      <RoomCodeViewModal
        open={roomCodeOpen}
        onClose={onRoomCodeClose}
        roomCode={roomCode}
      />

      <GameStartBlockedModal
        message={startBlockedMessage}
        onClose={onDismissStartBlocked}
      />
    </>
  )
}
