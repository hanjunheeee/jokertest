// 파일 역할: GameMatchingPage.jsx - 라우터에서 렌더링되는 페이지입니다.
/**
 * 멀티플레이 매칭 대기 화면.
 *
 * 배경·중앙 방 패널·파티 인원·공통 조작 버튼만 조합합니다.
 * 방 상태 계산과 소켓 액션 연결은 useMatchingPage가 담당합니다.
 */
import MatchingBackground from "../components/MatchingBackground.jsx"
import MatchingPartyHeader from "../components/MatchingPartyHeader.jsx"
import MatchingPageControls from "../components/MatchingPageControls.jsx"
import MatchingRoomPanelArea from "../components/MatchingRoomPanelArea.jsx"
import { useMatchingPage } from "../hooks/useMatchingPage.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function GameMatchingPage() {
  const {
    uiVisible,
    roomCodeOpen,
    openRoomCode,
    closeRoomCode,
    slots,
    roomCode,
    partyCount,
    isHost,
    isReady,
    isSettingReady,
    toggleReady,
    canStart,
    isStarting,
    startGame,
    deleteRoom,
    handleBack,
  } = useMatchingPage()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <MatchingBackground visible={uiVisible} />
      <MatchingRoomPanelArea
        visible={uiVisible}
        slots={slots}
        roomCode={roomCode}
        roomCodeOpen={roomCodeOpen}
        onRoomCodeOpen={openRoomCode}
        onRoomCodeClose={closeRoomCode}
        isHost={isHost}
        isReady={isReady}
        isSettingReady={isSettingReady}
        onToggleReady={toggleReady}
        canStart={canStart}
        isStarting={isStarting}
        onStartGame={startGame}
        onDeleteRoom={deleteRoom}
        onLeaveRoom={handleBack}
      />
      <MatchingPartyHeader
        visible={uiVisible}
        partyCount={partyCount}
        transition={UI_REVEAL_TRANSITION}
      />
      <MatchingPageControls visible={uiVisible} onBack={handleBack} />
    </div>
  )
}
