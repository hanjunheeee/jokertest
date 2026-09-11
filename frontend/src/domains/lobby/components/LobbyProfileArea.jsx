// 파일 역할: LobbyProfileArea.jsx - 화면을 구성하는 컴포넌트입니다.
import { LOBBY_PROFILE_SHORTCUT_CLASS } from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import MyPageBannerButton from "@/domains/user/components/MyPageBannerButton.jsx"

// 로비 오른쪽 위의 마이프로필 배너 영역입니다.
export default function LobbyProfileArea({ profile, loading, onMyPage, onAccount }) {
  if (loading || !profile) return null

  return (
    <div className={LOBBY_PROFILE_SHORTCUT_CLASS}>
      {/* F-13(AC-05): 이전에는 showProfilePortrait를 넘기지 않아 로비 배너가 텍스트만
          보여주고 실제 장착 사진·테두리를 전혀 그리지 않았다. BannerProfilePortrait가
          profileCustomization store(서버 loadout 거울)에서 이미 실제 값을 읽으므로,
          이 플래그만 켜면 별도 배선 없이 로비에서도 실제 계정 초상이 보인다. */}
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
