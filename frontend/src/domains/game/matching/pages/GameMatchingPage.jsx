// 대기방 화면: 배경·팝업·인원 머리말·뒤로/친구 초대·방장 버튼·강퇴 창·설정 편집
// /game-matching 라우트가 씀, 값과 동작은 모두 useMatchingPage에서 받음
import MatchingBackground from "../components/MatchingBackground.jsx"
import MatchingPartyHeader from "../components/MatchingPartyHeader.jsx"
import MatchingPageControls from "../components/MatchingPageControls.jsx"
import MatchingRoomPanelArea from "../components/MatchingRoomPanelArea.jsx"
import { useMatchingPage } from "../hooks/useMatchingPage.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import FriendListToggleButton from "@/domains/lobby/components/friendList/FriendListToggleButton.jsx"
import FriendInviteModalShell from "../components/friendInvite/FriendInviteModalShell.jsx"
import FriendInviteModalContent from "../components/friendInvite/FriendInviteModalContent.jsx"
import RoomSettingsResultNotice from "../components/RoomSettingsResultNotice.jsx"
import SettingKickPlayerModalContent from "@/domains/game/ingame/components/controls/kickPlayer/SettingKickPlayerModalContent.jsx"
import SettingKickPlayerModalShell from "@/domains/game/ingame/components/controls/kickPlayer/SettingKickPlayerModalShell.jsx"
import MatchingHostActionButtons from "../components/MatchingHostActionButtons.jsx"
import SettingsPendingNotice from "../components/settingsEdit/SettingsPendingNotice.jsx"
import SettingsEditOverlay from "../components/settingsEdit/SettingsEditOverlay.jsx"

export default function GameMatchingPage() {
  const {
    uiVisible,
    waitingMessage,
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
    isStarting,
    isRoomVerified,
    startGame,
    deleteRoom,
    startBlockedMessage,
    dismissStartBlockedMessage,
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
    settingsResultNotice,
    dismissSettingsResultNotice,
    canKick,
    isKickHost,
    kickModalOpen,
    openKickModal,
    closeKickModal,
    kickTargets,
    kickPendingTarget,
    kickStatus,
    kickErrorCode,
    isKicking,
    canLookupKickResult,
    isAwaitingKickResolution,
    requestKickConfirm,
    cancelKickConfirm,
    confirmKick,
    lookupKickResult,
    canOpenFriendInvite,
    friendInviteModalOpen,
    openFriendInviteModal,
    closeFriendInviteModal,
    inviteFriends,
    invitingIds,
    inviteFriend,
  } = useMatchingPage()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <MatchingBackground visible={uiVisible} />
      <MatchingRoomPanelArea
        visible={uiVisible}
        slots={slots}
        waitingMessage={waitingMessage}
        roomCode={roomCode}
        roomCodeOpen={roomCodeOpen}
        onRoomCodeOpen={openRoomCode}
        onRoomCodeClose={closeRoomCode}
        isHost={isHost}
        isReady={isReady}
        isSettingReady={isSettingReady}
        onToggleReady={toggleReady}
        isStarting={isStarting}
        isRoomVerified={isRoomVerified}
        onStartGame={startGame}
        onDeleteRoom={deleteRoom}
        onLeaveRoom={handleBack}
        startBlockedMessage={startBlockedMessage}
        onDismissStartBlocked={dismissStartBlockedMessage}
      />
      <MatchingPartyHeader
        visible={uiVisible}
        partyCount={partyCount}
        transition={UI_REVEAL_TRANSITION}
      />
      <MatchingPageControls
        visible={uiVisible}
        onBack={handleBack}
        rightControls={canOpenFriendInvite ? (
          <FriendListToggleButton
            open={friendInviteModalOpen}
            ariaLabel="친구 초대"
            onOpen={() => {
              if (friendInviteModalOpen) closeFriendInviteModal()
              else openFriendInviteModal()
            }}
          />
        ) : null}
      />

      <FriendInviteModalShell
        open={friendInviteModalOpen}
        onClose={closeFriendInviteModal}
      >
        <FriendInviteModalContent
          friends={inviteFriends}
          invitingIds={invitingIds}
          onInviteFriend={inviteFriend}
        />
      </FriendInviteModalShell>

      {/* 다른 창이 떠 있을 땐 방장 버튼 숨김 */}
      {!settingsOpen && !kickModalOpen && !friendInviteModalOpen ? (
        <MatchingHostActionButtons
          visible={uiVisible}
          canEditSettings={canEditSettings}
          isKickHost={isKickHost}
          canKick={canKick}
          onOpenSettings={openSettings}
          onOpenKickModal={openKickModal}
        />
      ) : null}

      <SettingKickPlayerModalShell open={kickModalOpen} onClose={closeKickModal}>
        <SettingKickPlayerModalContent
          targets={kickTargets}
          pendingTarget={kickPendingTarget}
          status={kickStatus}
          errorCode={kickErrorCode}
          isSending={isKicking}
          canLookupResult={canLookupKickResult}
          isAwaitingResolution={isAwaitingKickResolution}
          onRequestConfirm={requestKickConfirm}
          onCancelConfirm={cancelKickConfirm}
          onConfirmKick={confirmKick}
          onLookupResult={lookupKickResult}
        />
      </SettingKickPlayerModalShell>

      {hasPendingSettingsResult ? (
        <SettingsPendingNotice
          message={settingsError?.message}
          onVerify={verifyRoomSettingsResult}
        />
      ) : null}

      {/* 결과 안내는 편집 중에만 가림 (결과 확인 대기 안내와 따로 뜸) */}
      <RoomSettingsResultNotice
        message={settingsOpen ? null : settingsResultNotice}
        onDismiss={dismissSettingsResultNotice}
      />

      {settingsOpen ? (
        <SettingsEditOverlay
          settingsForm={settingsForm}
          formResetKey={settingsFormResetKey}
          isSaving={isSavingSettings}
          onSubmit={submitSettings}
          onCancel={closeSettings}
          settingsError={settingsError}
          hasPendingSettingsResult={hasPendingSettingsResult}
        />
      ) : null}
    </div>
  )
}
