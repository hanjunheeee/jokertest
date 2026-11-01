import { PROFILE_SHORTCUT_CLASS } from "@/shared/constants/lobbyLayoutStyle.js"
import MyPageBannerButton from "@/domains/user/components/MyPageBannerButton.jsx"

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
