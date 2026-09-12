import { useEffect, useState } from "react"
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
import { useMyProfile } from "@/domains/user/hooks/useMyProfile.js"
import { NOTIFICATION_FRIEND_REQUEST_PARAM } from "@/domains/notifications/constants/notificationTargets.js"

export default function LobbyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, loading: profileLoading } = useMyProfile()
  const { bgVideoRef, audioRef, uiVisible, skipIntro } = useLobbyIntro()

  // 친구 목록 패널이 열려 있는지 표시합니다.
  // 친구 데이터/핸들러는 더 이상 여기서 구독하지 않습니다 — FriendListPanel이
  // open 여부를 받아서 직접 useFriendListSync를 호출합니다.
  const [friendListOpen, setFriendListOpen] = useState(false)

  // F-17(AC-01): 알림 모달 열림 상태. 목록·미확인 수는 알림 store가 소유하므로 여기서는
  // 열림 여부만 든다.
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  // F-17(AC-02): 알림에서 "요청 보러 가기"로 들어오면 ?notificationRequestId=<원본 요청 id>가
  // 붙는다. 이 값으로 요청을 새로 만들거나 자동 수락하지 않는다 — 친구 패널을 "요청 수락"
  // 탭으로 열고, 실제 incomingRequests에서 같은 request_id를 찾아 그 행을 가리킬 뿐이다.
  // 처리된 요청이라 목록에 없으면 패널이 "처리됨·대상 없음"을 안내한다.
  const rawTargetRequestId = searchParams.get(NOTIFICATION_FRIEND_REQUEST_PARAM)
  const friendRequestTargetId = /^\d+$/.test(rawTargetRequestId ?? "")
    ? Number(rawTargetRequestId)
    : null

  useEffect(() => {
    if (friendRequestTargetId === null) return
    setFriendListOpen(true)
  }, [friendRequestTargetId])

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
          onOpenFriendList={() => setFriendListOpen(true)}
          onCloseFriendList={() => setFriendListOpen(false)}
          notificationsOpen={notificationsOpen}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onCloseNotifications={() => setNotificationsOpen(false)}
          onNotificationNavigate={(path) => {
            // 이동하면 모달은 닫는다. 대상이 로비 자신이어도 같은 경로로 다시 들어와
            // 위 useEffect가 친구 패널을 연다.
            setNotificationsOpen(false)
            navigate(path)
          }}
          friendRequestTargetId={friendRequestTargetId}
        />
      </LobbyContentLayer>
    </div>
  )
}
