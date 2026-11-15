// 로비 화면: 배경·메뉴·친구 칸·알림 창을 한데 모음, 들어올 때 남은 판·대기방 자리 정리
// 데스크톱·모바일 경로(routes)가 씀
import { useNavigate, useSearchParams } from "react-router-dom"
import LobbyBackground from "@/domains/lobby/components/LobbyBackground.jsx"
import LobbyContentLayer from "@/domains/lobby/components/LobbyContentLayer.jsx"
import LobbyFriendArea from "@/domains/lobby/components/LobbyFriendArea.jsx"
import LobbyMenuArea from "@/domains/lobby/components/LobbyMenuArea.jsx"
import LobbyProfileArea from "@/domains/lobby/components/LobbyProfileArea.jsx"
import { LOBBY_PAGE_ROOT_CLASS } from "@/shared/constants/lobbyLayoutStyle.js"
import { useLobbyIntro } from "@/domains/lobby/hooks/useLobbyIntro.js"
import { useLobbyNotificationPanels } from "@/domains/lobby/hooks/useLobbyNotificationPanels.js"
import { useMyProfile } from "@/shared/hooks/useMyProfile.js"
import { useLobbyEntryCleanup } from "@/domains/game/shared/hooks/useLobbyEntryCleanup.js"

export default function LobbyPage() {
  const navigate = useNavigate()
  // 들어올 때 서버가 남은 판·대기방 자리를 지움 (판 중 산 사람이면 판 화면으로)
  useLobbyEntryCleanup()
  const [searchParams] = useSearchParams()
  const { profile, loading: profileLoading } = useMyProfile()
  const { bgVideoRef, uiVisible, skipIntro } = useLobbyIntro()

  const {
    notificationsOpen,
    openNotifications,
    closeNotifications,
    friendListOpen,
    openFriendList,
    closeFriendList,
    friendRequestTargetId,
    gameInviteTargetId,
    handleNotificationNavigate,
  } = useLobbyNotificationPanels({ searchParams, navigate })

  return (
    <div className={LOBBY_PAGE_ROOT_CLASS}>
      <LobbyBackground
        bgVideoRef={bgVideoRef}
        uiVisible={uiVisible}
        onSkipIntro={skipIntro}
      />

      <LobbyContentLayer visible={uiVisible}>
        <LobbyMenuArea />
        <LobbyProfileArea
          profile={profile}
          loading={profileLoading}
          onMyPage={() => navigate("/mypage")}
        />
        <LobbyFriendArea
          friendListOpen={friendListOpen}
          onOpenFriendList={openFriendList}
          onCloseFriendList={closeFriendList}
          notificationsOpen={notificationsOpen}
          onOpenNotifications={openNotifications}
          onCloseNotifications={closeNotifications}
          onNotificationNavigate={handleNotificationNavigate}
          friendRequestTargetId={friendRequestTargetId}
          gameInviteTargetId={gameInviteTargetId}
        />
      </LobbyContentLayer>
    </div>
  )
}
