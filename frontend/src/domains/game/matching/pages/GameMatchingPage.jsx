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
// F-20: 방 생성과 **같은** 설정 패널을 편집 모드로 장착한다 — 새 설정 화면을 만들지 않는다.
// 같은 대기 페이지 안에 두어야 방 이벤트 구독(useMatchingRoom)이 끊기지 않는다.
import GameSetupPanel from "@/domains/game/setup/components/GameSetupPanel.jsx"

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
    settingsOpen,
    openSettings,
    closeSettings,
    canEditSettings,
    settingsForm,
    settingsFormResetKey,
    submitSettings,
    isSavingSettings,
    hasPendingSettingsResult,
    verifyRoomSettingsResult,
    settingsError,
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

      {/*
        F-20: 방장에게만 편집 진입을 제공한다. 비방장·미검증·오프라인·결과 확인 중에는
        버튼이 아예 나타나지 않으므로 화면에서 편집을 시작할 수 없고, 서버도 같은 판정을
        독립적으로 다시 한다(버튼 상태는 권한 경계가 아니다).
      */}
      {canEditSettings && !settingsOpen ? (
        <button
          type="button"
          onClick={openSettings}
          aria-label="방 설정 변경"
          className="interactive-scale absolute left-1/2 top-[calc(50%+18rem)] z-30 -translate-x-1/2 cursor-pointer rounded-md border border-[#c9b892]/60 bg-black/55 px-4 py-2 font-subheading app-text-scaled [--app-text-size:clamp(0.95rem,1.3vw,1.1rem)] font-bold text-[#f5f0e6]"
        >
          방 설정 변경
        </button>
      ) : null}

      {/* ACK를 잃은 저장이 있으면 새 저장 대신 그 결과를 먼저 확인하게 한다 — 적용 여부를
          추측하지 않는다(A-07). */}
      {hasPendingSettingsResult ? (
        <div
          role="status"
          className="absolute left-1/2 top-[calc(50%+18rem)] z-30 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/70 px-4 py-2 text-[#f5f0e6]"
        >
          <span>{settingsError?.message ?? "저장 결과를 확인하는 중입니다."}</span>
          <button
            type="button"
            onClick={verifyRoomSettingsResult}
            aria-label="설정 저장 결과 확인"
            className="interactive-scale cursor-pointer rounded border border-[#c9b892]/60 px-2 py-1 font-bold"
          >
            결과 확인
          </button>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="absolute inset-0 z-40 bg-black/70">
          <GameSetupPanel
            visible
            mode="edit"
            initialFormState={settingsForm.ok ? settingsForm : null}
            formResetKey={settingsFormResetKey}
            isCreating={isSavingSettings}
            onCreateGame={submitSettings}
          />
          <button
            type="button"
            onClick={closeSettings}
            aria-label="설정 변경 취소"
            className="interactive-scale absolute right-6 top-6 z-50 cursor-pointer rounded-md border border-[#c9b892]/60 bg-black/55 px-4 py-2 font-subheading font-bold text-[#f5f0e6]"
          >
            취소
          </button>
          {settingsError && !hasPendingSettingsResult ? (
            <p role="alert" className="absolute bottom-8 left-1/2 z-50 -translate-x-1/2 text-[#ffd9d9]">
              {settingsError.message ?? "설정을 저장하지 못했습니다."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
