import MatchingBackground from "../components/MatchingBackground.jsx"
import MatchingPartyHeader from "../components/MatchingPartyHeader.jsx"
import MatchingPageControls from "../components/MatchingPageControls.jsx"
import MatchingRoomPanelArea from "../components/MatchingRoomPanelArea.jsx"
import { useMatchingPage } from "../hooks/useMatchingPage.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import FriendListToggleButton from "@/domains/lobby/components/friendList/FriendListToggleButton.jsx"
import FriendInviteModalShell from "../components/friendInvite/FriendInviteModalShell.jsx"
import FriendInviteModalContent from "../components/friendInvite/FriendInviteModalContent.jsx"
import GameSetupPanel from "@/domains/game/setup/components/GameSetupPanel.jsx"
import RoomSettingsResultNotice from "../components/RoomSettingsResultNotice.jsx"
import SettingKickPlayerModalContent from "@/domains/game/ingame/components/controls/ingameSetting/kickPlayer/SettingKickPlayerModalContent.jsx"
import SettingKickPlayerModalShell from "@/domains/game/ingame/components/controls/ingameSetting/kickPlayer/SettingKickPlayerModalShell.jsx"
import MatchingHostActionButtons from "../components/MatchingHostActionButtons.jsx"

export default function GameMatchingPage() {
  const {
    uiVisible,
    waitingMessage,
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
        <div
          role="status"
          className="absolute bottom-[clamp(4rem,11vh,6.5rem)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#c9b892]/60 bg-black/70 px-4 py-2 text-[#f5f0e6]"
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

      <RoomSettingsResultNotice
        message={settingsOpen ? null : settingsResultNotice}
        onDismiss={dismissSettingsResultNotice}
      />

      {settingsOpen ? (
        <div className="absolute inset-0 z-40 bg-black/70">
          <GameSetupPanel
            visible
            mode="edit"
            initialFormState={settingsForm.ok ? settingsForm : null}
            formResetKey={settingsFormResetKey}
            isCreating={isSavingSettings}
            onCreateGame={submitSettings}
            onCancel={closeSettings}
          />
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
