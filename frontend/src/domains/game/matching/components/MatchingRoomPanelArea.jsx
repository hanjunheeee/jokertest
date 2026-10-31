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
  isHost,
  isReady,
  isSettingReady,
  onToggleReady,
  isStarting,
  isRoomVerified,
  onStartGame,
  onDeleteRoom,
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
        isHost={isHost}
        isReady={isReady}
        isSettingReady={isSettingReady}
        onToggleReady={onToggleReady}
        isStarting={isStarting}
        isRoomVerified={isRoomVerified}
        onStartGame={onStartGame}
        onDeleteRoom={onDeleteRoom}
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
