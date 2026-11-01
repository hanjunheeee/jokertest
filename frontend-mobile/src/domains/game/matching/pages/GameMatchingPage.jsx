// 대기방 화면 (/game-matching): 배경·위 줄·방장 버튼/초대코드·매칭 틀·바닥 준비/시작 줄·창들
// app/routes/index.jsx가 씀, 값과 동작은 모두 데스크톱 useMatchingPage에서 받음
import { useMatchingPage } from "@/domains/game/matching/hooks/useMatchingPage.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import MatchingBackdrop from "../components/layout/MatchingBackdrop.jsx"
import MatchingTopBar from "../components/layout/MatchingTopBar.jsx"
import MatchingBoard from "../components/layout/MatchingBoard.jsx"
import HostActions from "../components/layout/HostActions.jsx"
import ActionBar from "../components/actions/ActionBar.jsx"
import RoomCodeSheet from "../components/roomCode/RoomCodeSheet.jsx"
import FriendInviteSheet from "../components/friendInvite/FriendInviteSheet.jsx"
import KickSheet from "../components/kick/KickSheet.jsx"
import StartBlockedSheet from "../components/startBlocked/StartBlockedSheet.jsx"
import SettingsEditSheet from "../components/settingsEdit/SettingsEditSheet.jsx"

// 대기방 페이지
export default function GameMatchingPage() {
  const page = useMatchingPage()

  // 친구 버튼은 열고 닫기 둘 다 (데스크톱 친구 버튼과 같음)
  const toggleFriendInvite = () => {
    if (page.friendInviteModalOpen) page.closeFriendInviteModal()
    else page.openFriendInviteModal()
  }

  // 다른 창이 떠 있을 땐 방장 버튼 숨김 (데스크톱과 같음, 자리는 남겨 판이 안 흔들림)
  const hostActionsHidden = page.settingsOpen || page.kickModalOpen || page.friendInviteModalOpen

  return (
    <div className="relative flex min-h-full w-full flex-col">
      <MatchingBackdrop visible={page.uiVisible} />

      <div className="relative flex flex-1 flex-col">
        <MatchingTopBar
          visible={page.uiVisible}
          partyCount={page.partyCount}
          onBack={page.handleBack}
          canOpenFriendInvite={page.canOpenFriendInvite}
          friendInviteOpen={page.friendInviteModalOpen}
          onToggleFriendInvite={toggleFriendInvite}
        />

        <div className="flex flex-1 flex-col justify-center px-3 pb-3 land:px-6 land:pb-1 md:px-8">
          <MatchingBoard
            visible={page.uiVisible}
            slots={page.slots}
            waitingMessage={page.waitingMessage}
            onRoomCodeOpen={page.openRoomCode}
            leading={
              <HostActions
                visible={page.uiVisible}
                hidden={hostActionsHidden}
                canEditSettings={page.canEditSettings}
                isKickHost={page.isKickHost}
                canKick={page.canKick}
                onOpenSettings={page.openSettings}
                onOpenKickModal={page.openKickModal}
              />
            }
          />
        </div>
      </div>

      <ShellBottom>
        <ActionBar page={page} />
      </ShellBottom>

      <RoomCodeSheet open={page.roomCodeOpen} onClose={page.closeRoomCode} roomCode={page.roomCode} />
      <FriendInviteSheet
        open={page.friendInviteModalOpen}
        onClose={page.closeFriendInviteModal}
        friends={page.inviteFriends}
        invitingIds={page.invitingIds}
        onInviteFriend={page.inviteFriend}
      />
      <KickSheet page={page} />
      <StartBlockedSheet message={page.startBlockedMessage} onClose={page.dismissStartBlockedMessage} />
      {page.settingsOpen ? (
        <SettingsEditSheet
          settingsForm={page.settingsForm}
          formResetKey={page.settingsFormResetKey}
          isSaving={page.isSavingSettings}
          onSubmit={page.submitSettings}
          onCancel={page.closeSettings}
          settingsError={page.settingsError}
          hasPendingSettingsResult={page.hasPendingSettingsResult}
        />
      ) : null}
    </div>
  )
}
