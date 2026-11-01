// 로비 오른쪽 위 내 프로필 배너 (누르면 마이페이지, 톱니는 계정 화면)
// LobbyPage가 씀
import { PROFILE_SHORTCUT_CLASS } from "@/shared/constants/lobbyLayoutStyle.js"
import MyPageBannerButton from "@/domains/user/components/MyPageBannerButton.jsx"

// 프로필을 받기 전엔 아무것도 안 그림
export default function LobbyProfileArea({ profile, loading, onMyPage, onAccount }) {
  if (loading || !profile) return null

  return (
    <div className={PROFILE_SHORTCUT_CLASS}>
      <MyPageBannerButton
        onClick={onMyPage}
        onSettingsClick={onAccount}
        showSettingsIcon
        showProfilePortrait
        profile={profile}
      />
    </div>
  )
}
