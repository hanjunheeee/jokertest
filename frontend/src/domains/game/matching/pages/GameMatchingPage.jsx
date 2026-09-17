// 파일 역할: GameMatchingPage.jsx - 라우터에서 렌더링되는 페이지입니다.
/**
 * 멀티플레이 매칭 대기 화면.
 *
 * 배경·중앙 방 패널·파티 인원·공통 조작 버튼만 조합합니다.
 * 방 상태 계산과 소켓 액션 연결은 useMatchingPage가 담당합니다.
 *
 * F-19(AC-01/AC-06): 로비의 **같은** FriendListPanel과 같은 토글 버튼을 여기서도 씁니다 —
 * 새 친구창을 만들지 않습니다. 두 화면이 같은 공용 store(friend.store·gameInvite.store)를
 * 구독하므로 같은 계정의 친구·요청·초대 상태를 그대로 봅니다. 대기방에서만 친구 행에
 * 초대 버튼이 붙고, 방 검증(isRoomVerified) 전에는 조회는 되지만 발송은 비활성입니다.
 */
import { useState } from "react"
import MatchingBackground from "../components/MatchingBackground.jsx"
import MatchingPartyHeader from "../components/MatchingPartyHeader.jsx"
import MatchingPageControls from "../components/MatchingPageControls.jsx"
import MatchingRoomPanelArea from "../components/MatchingRoomPanelArea.jsx"
import { useMatchingPage } from "../hooks/useMatchingPage.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import FriendListPanel from "@/domains/lobby/components/friendList/FriendListPanel.jsx"
import FriendListToggleButton from "@/domains/lobby/components/friendList/FriendListToggleButton.jsx"

export default function GameMatchingPage() {
  const {
    uiVisible,
    roomCodeOpen,
    openRoomCode,
    closeRoomCode,
    slots,
    roomId,
    roomCode,
    partyCount,
    isHost,
    isReady,
    isSettingReady,
    toggleReady,
    canStart,
    isStarting,
    isRoomVerified,
    startGame,
    deleteRoom,
    handleBack,
  } = useMatchingPage()

  // 로비와 같은 방식으로 패널 열림 상태만 화면이 소유합니다 — 친구 데이터·핸들러는
  // FriendListPanel이 open 여부를 받아 직접 구독합니다.
  const [friendListOpen, setFriendListOpen] = useState(false)

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
        isRoomVerified={isRoomVerified}
        onStartGame={startGame}
        onDeleteRoom={deleteRoom}
        onLeaveRoom={handleBack}
      />
      <MatchingPartyHeader
        visible={uiVisible}
        partyCount={partyCount}
        transition={UI_REVEAL_TRANSITION}
      />
      {/*
        친구 목록 버튼은 사운드 조절과 **같은 열**에 넣습니다. 별도의 absolute 박스로 두면
        두 조작이 우하단 같은 자리에 겹치고, 사운드의 투명 range input이 위를 덮어 친구
        버튼이 마우스로 눌리지 않습니다(실제 Chrome 확인 사항 — 키보드로만 열렸습니다).
      */}
      <MatchingPageControls
        visible={uiVisible}
        onBack={handleBack}
        rightControls={(
          <FriendListToggleButton
            open={friendListOpen}
            onOpen={() => setFriendListOpen((open) => !open)}
          />
        )}
      />

      <FriendListPanel
        open={friendListOpen}
        onClose={() => setFriendListOpen(false)}
        roomId={roomId}
        isRoomVerified={isRoomVerified}
      />
    </div>
  )
}
