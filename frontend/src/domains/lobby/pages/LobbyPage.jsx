import { useNavigate, useSearchParams } from "react-router-dom"
import LobbyBackground from "@/domains/lobby/components/LobbyBackground.jsx"
import LobbyContentLayer from "@/domains/lobby/components/LobbyContentLayer.jsx"
import LobbyDiscordButton from "@/domains/lobby/components/LobbyDiscordButton.jsx"
import LobbyFriendArea from "@/domains/lobby/components/LobbyFriendArea.jsx"
import LobbyMenuArea from "@/domains/lobby/components/LobbyMenuArea.jsx"
import LobbyProfileArea from "@/domains/lobby/components/LobbyProfileArea.jsx"
import {
  LOBBY_PAGE_ROOT_CLASS,
  LOBBY_RIGHT_ACTIONS_ROW_CLASS,
} from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import { useLobbyIntro } from "@/domains/lobby/hooks/useLobbyIntro.js"
import { useLobbyNotificationPanels } from "@/domains/lobby/hooks/useLobbyNotificationPanels.js"
import { useMyProfile } from "@/domains/user/hooks/useMyProfile.js"

export default function LobbyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, loading: profileLoading } = useMyProfile()
  const { bgVideoRef, audioRef, uiVisible, skipIntro } = useLobbyIntro()

  // 친구 목록 패널과 알림 모달의 열림 상태·대상 재진입 신호는 이 훅이 소유합니다.
  // 친구 데이터/핸들러는 여기서 구독하지 않습니다 — FriendListPanel이 open 여부를 받아서
  // 직접 useFriendListSync를 호출합니다.
  //
  // F-17: 알림 모달의 열림 여부는 **알림 store**가 소유하므로 계정 전환·로그아웃이 목록과
  // 모달을 함께 정리합니다. 알림에서 "요청 보러 가기"로 들어오면
  // ?notificationRequestId=<원본 요청 id>가 붙고, 같은 대상으로 다시 들어와도(질의가 같아도)
  // 이동 신호로 친구 패널이 다시 열립니다(AC-02/AC-05).
  const {
    notificationsOpen,
    openNotifications,
    closeNotifications,
    friendListOpen,
    openFriendList,
    closeFriendList,
    friendRequestTargetId,
    handleNotificationNavigate,
  } = useLobbyNotificationPanels({ searchParams, navigate })

  // 디스코드 버튼은 우하단 친구 목록 버튼 열 왼쪽에 나란히 놓습니다.
  const discordSlotClass =
    `absolute bottom-4 right-[clamp(5rem,9vw,7.5rem)] z-10 sm:bottom-6 ${LOBBY_RIGHT_ACTIONS_ROW_CLASS}`

  return (
    <div className={LOBBY_PAGE_ROOT_CLASS}>
      <LobbyBackground
        bgVideoRef={bgVideoRef}
        audioRef={audioRef}
        uiVisible={uiVisible}
        onSkipIntro={skipIntro}
      />

      <LobbyContentLayer visible={uiVisible}>
        <LobbyMenuArea />
        <LobbyProfileArea
          profile={profile}
          loading={profileLoading}
          onMyPage={() => navigate("/mypage")}
          onAccount={() => navigate("/account")}
        />
        <div className={discordSlotClass}>
          <LobbyDiscordButton />
        </div>
        <LobbyFriendArea
          audioRef={audioRef}
          friendListOpen={friendListOpen}
          onOpenFriendList={openFriendList}
          onCloseFriendList={closeFriendList}
          notificationsOpen={notificationsOpen}
          onOpenNotifications={openNotifications}
          onCloseNotifications={closeNotifications}
          onNotificationNavigate={handleNotificationNavigate}
          friendRequestTargetId={friendRequestTargetId}
        />
      </LobbyContentLayer>
    </div>
  )
}
