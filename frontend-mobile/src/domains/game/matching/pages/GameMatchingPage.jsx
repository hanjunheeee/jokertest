// 대기방 화면 (/game-matching): 배경·위 줄·양피지 판(자리 2열)·바닥 준비/시작 줄·시트들
// app/routes/index.jsx가 씀, 값과 동작은 모두 데스크톱 useMatchingPage에서 받음
import { useState } from "react"
import { useMatchingPage } from "@/domains/game/matching/hooks/useMatchingPage.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { useSlotCards } from "../hooks/useSlotCards.js"
import MatchingBackdrop from "../components/layout/MatchingBackdrop.jsx"
import MatchingTopBar from "../components/layout/MatchingTopBar.jsx"
import MatchingBoard from "../components/layout/MatchingBoard.jsx"
import ActionBar from "../components/actions/ActionBar.jsx"
import HostMenuSheet from "../components/menu/HostMenuSheet.jsx"
import RoomCodeSheet from "../components/roomCode/RoomCodeSheet.jsx"
import FriendInviteSheet from "../components/friendInvite/FriendInviteSheet.jsx"
import KickSheet from "../components/kick/KickSheet.jsx"
import StartBlockedSheet from "../components/startBlocked/StartBlockedSheet.jsx"
import SettingsEditSheet from "../components/settingsEdit/SettingsEditSheet.jsx"

// 대기방 페이지
export default function GameMatchingPage() {
  const page = useMatchingPage()
  const cards = useSlotCards(page.slots)
  const [hostMenuOpen, setHostMenuOpen] = useState(false)

  // 방장 메뉴는 데스크톱 방장 버튼 줄과 같은 조건 (설정 변경 가능 또는 방장)
  const showHostMenu = page.canEditSettings || page.isKickHost

  // 친구 버튼은 열고 닫기 둘 다 (데스크톱 친구 버튼과 같음)
  const toggleFriendInvite = () => {
    if (page.friendInviteModalOpen) page.closeFriendInviteModal()
    else page.openFriendInviteModal()
  }

  return (
    <div className="relative min-h-full w-full">
      <MatchingBackdrop visible={page.uiVisible} />

      <div className="relative flex min-h-full flex-col">
        <MatchingTopBar
          visible={page.uiVisible}
          partyCount={page.partyCount}
          onBack={page.handleBack}
          canOpenFriendInvite={page.canOpenFriendInvite}
          friendInviteOpen={page.friendInviteModalOpen}
          onToggleFriendInvite={toggleFriendInvite}
          showHostMenu={showHostMenu}
          onOpenHostMenu={() => setHostMenuOpen(true)}
        />

        <div className="flex-1 px-3 pt-1 pb-4 land:px-6 md:px-8 md:pt-6">
          <MatchingBoard
            visible={page.uiVisible}
            cards={cards}
            waitingMessage={page.waitingMessage}
            onRoomCodeOpen={page.openRoomCode}
          />
        </div>
      </div>

      <ShellBottom>
        <ActionBar page={page} />
      </ShellBottom>

      <HostMenuSheet
        open={hostMenuOpen && showHostMenu}
        onClose={() => setHostMenuOpen(false)}
        canEditSettings={page.canEditSettings}
        isKickHost={page.isKickHost}
        canKick={page.canKick}
        onOpenSettings={page.openSettings}
        onOpenKickModal={page.openKickModal}
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
