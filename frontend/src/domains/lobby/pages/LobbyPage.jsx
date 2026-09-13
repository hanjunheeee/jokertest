import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import LobbyBackground from "@/domains/lobby/components/LobbyBackground.jsx"
import LobbyContentLayer from "@/domains/lobby/components/LobbyContentLayer.jsx"
import LobbyFriendArea from "@/domains/lobby/components/LobbyFriendArea.jsx"
import LobbyMenuArea from "@/domains/lobby/components/LobbyMenuArea.jsx"
import LobbyProfileArea from "@/domains/lobby/components/LobbyProfileArea.jsx"
import { LOBBY_PAGE_ROOT_CLASS } from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import { useLobbyIntro } from "@/domains/lobby/hooks/useLobbyIntro.js"
import { useLobbyNotificationPanels } from "@/domains/lobby/hooks/useLobbyNotificationPanels.js"
import ProfileEditOverlay from "@/domains/user/components/profileEdit/ProfileEditOverlay.jsx"
import { useMyProfile } from "@/domains/user/hooks/useMyProfile.js"

export default function LobbyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, loading: profileLoading } = useMyProfile()
  const { bgVideoRef, audioRef, uiVisible, skipIntro } = useLobbyIntro()

  // F-18(AC-04): 마이페이지와 **같은** 프로필 편집 모달을 로비에서도 연다. 열림 상태만
  // 여기서 소유하고(MyPageLayout.jsx와 동일한 소비 방식), 저장·반영은 기존 공용 경로
  // (useProfileBorderEditor → economy store → profileCustomization store → 배너 초상)를
  // 그대로 쓴다 — 새 편집기나 새 저장 경로를 만들지 않는다.
  const [profileEditOpen, setProfileEditOpen] = useState(false)

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
          onEditProfile={() => setProfileEditOpen(true)}
        />
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

      <ProfileEditOverlay open={profileEditOpen} onClose={() => setProfileEditOpen(false)} />
    </div>
  )
}
