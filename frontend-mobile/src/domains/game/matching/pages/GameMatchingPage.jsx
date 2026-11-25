// 대기방 화면 (/game-matching): 배경·위 줄·방장 버튼/초대코드·매칭 틀·준비/시작 줄·창들
// app/routes/index.jsx가 씀, 값과 동작은 모두 데스크톱 useMatchingPage에서 받음
import { Navigate } from "react-router-dom"
import { useMatchingPage } from "@/domains/game/matching/hooks/useMatchingPage.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { hasCurrentInGame, shouldLeaveMatchingForInGame } from "@/domains/game/matching/utils/shouldLeaveMatchingForInGame.js"
import { useShellBackButton } from "@m/shared/layouts/mobileShellBack.jsx"
import MatchingBackdrop from "../components/layout/MatchingBackdrop.jsx"
import MatchingTopBar from "../components/layout/MatchingTopBar.jsx"
import MatchingFriendInviteBar from "../components/layout/MatchingFriendInviteBar.jsx"
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
  const activeInGame = useInGameStore((s) => shouldLeaveMatchingForInGame(s.gameId, s.state))
  // 끝난 판(ENDED)이라도 지금 판이 있으면 목록으로 안 보냄: 시작 직후 끝난 판은 인게임 이동 뒤 결과 화면으로 감 (데스크톱과 같음)
  const hasGame = useInGameStore((s) => hasCurrentInGame(s.gameId, s.state))
  const page = useMatchingPage()

  useShellBackButton({
    onClick: page.handleBack,
    label: "대기방에서 뒤로",
    enabled: page.uiVisible,
  })

  if (activeInGame) return <Navigate to="/ingame" replace />
  if (!page.canStayOnMatchingPage) return hasGame ? null : <Navigate to="/multiplay" replace />

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
        <MatchingTopBar visible={page.uiVisible} partyCount={page.partyCount} />

        <div className="flex flex-1 flex-col items-center justify-center px-3 pb-3 land:px-6 land:pb-1 md:px-8">
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
          <ActionBar page={page} />
        </div>
      </div>

      <MatchingFriendInviteBar
        visible={page.uiVisible}
        enabled={page.canOpenFriendInvite}
        open={page.friendInviteModalOpen}
        onToggle={toggleFriendInvite}
      />

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
