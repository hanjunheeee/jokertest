import { useState } from "react"
import { useNavigate } from "react-router-dom"
import LobbyBackground from "@/domains/lobby/components/LobbyBackground.jsx"
import LobbyContentLayer from "@/domains/lobby/components/LobbyContentLayer.jsx"
import LobbyFriendArea from "@/domains/lobby/components/LobbyFriendArea.jsx"
import LobbyMenuArea from "@/domains/lobby/components/LobbyMenuArea.jsx"
import LobbyProfileArea from "@/domains/lobby/components/LobbyProfileArea.jsx"
import { LOBBY_PAGE_ROOT_CLASS } from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import { useLobbyIntro } from "@/domains/lobby/hooks/useLobbyIntro.js"
import { useMyProfile } from "@/domains/user/hooks/useMyProfile.js"

export default function LobbyPage() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useMyProfile()
  const { bgVideoRef, audioRef, uiVisible, skipIntro } = useLobbyIntro()

  // 친구 목록 패널이 열려 있는지 표시합니다.
  // 친구 데이터/핸들러는 더 이상 여기서 구독하지 않습니다 — FriendListPanel이
  // open 여부를 받아서 직접 useFriendListSync를 호출합니다.
  const [friendListOpen, setFriendListOpen] = useState(false)

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
        <LobbyFriendArea
          audioRef={audioRef}
          friendListOpen={friendListOpen}
          onOpenFriendList={() => setFriendListOpen(true)}
          onCloseFriendList={() => setFriendListOpen(false)}
        />
      </LobbyContentLayer>
    </div>
  )
}
