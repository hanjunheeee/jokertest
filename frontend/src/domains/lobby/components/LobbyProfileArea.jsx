// 파일 역할: LobbyProfileArea.jsx - 화면을 구성하는 컴포넌트입니다.
import { LOBBY_PROFILE_SHORTCUT_CLASS } from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import MyPageBannerButton from "@/domains/user/components/MyPageBannerButton.jsx"

// 로비 오른쪽 위의 마이프로필 배너 영역입니다.
export default function LobbyProfileArea({ profile, loading, onMyPage, onAccount }) {
  if (loading || !profile) return null

  return (
    <div className={LOBBY_PROFILE_SHORTCUT_CLASS}>
      <MyPageBannerButton
        onClick={onMyPage}
        onSettingsClick={onAccount}
        showSettingsIcon
        profile={profile}
      />
    </div>
  )
}
