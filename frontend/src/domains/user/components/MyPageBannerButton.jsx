import { LOBBY_ASSETS } from "@/domains/lobby/constants/lobbyAssets.js"
import BannerMainButton from "@/domains/user/components/MyPageBannerButton/BannerMainButton.jsx"
import SettingsGearButton from "@/domains/user/components/MyPageBannerButton/SettingsGearButton.jsx"
import {
  LOBBY_BANNER_WIDTH_CLASS,
  LOBBY_TEXT_PANEL_INSET,
  MY_PAGE_BANNER_ROOT_CLASS,
} from "@/domains/user/constants/myPageBannerStyle.js"

// 마이페이지 배너 버튼의 최종 조립 컴포넌트입니다.
// 배너 본체와 설정 톱니 버튼을 같이 보여줄지 여기서 결정합니다.
export default function MyPageBannerButton({
  onClick,
  onSettingsClick,
  profile,
  showText = true,
  showProfilePortrait = false,
  showSettingsIcon = false,
  bannerSrc = LOBBY_ASSETS.myPageButton,
  textPanelInset = LOBBY_TEXT_PANEL_INSET,
  className = LOBBY_BANNER_WIDTH_CLASS,
}) {
  // 설정 버튼까지 보여줘야 하는지 판단합니다.
  // 아이콘을 보여달라고 했고, 실제 클릭 함수도 있을 때만 설정 버튼을 렌더링합니다.
  const hasSettingsControl = showSettingsIcon && typeof onSettingsClick === "function"

  if (hasSettingsControl) {
    return (
      <div className={`${MY_PAGE_BANNER_ROOT_CLASS} ${className}`}>
        {/* 배너 전체는 마이페이지로 이동하는 큰 버튼 역할을 합니다. */}
        <BannerMainButton
          onClick={onClick}
          bannerSrc={bannerSrc}
          showText={showText}
          showProfilePortrait={showProfilePortrait}
          profile={profile}
          textPanelInset={textPanelInset}
          className="!w-full"
        />
        {/* 설정 톱니는 배너 위에 겹쳐 올라가는 별도 버튼입니다. */}
        <SettingsGearButton onClick={onSettingsClick} />
      </div>
    )
  }

  // 설정 버튼이 없을 때는 배너 본체만 그대로 반환합니다.
  return (
    <BannerMainButton
      onClick={onClick}
      bannerSrc={bannerSrc}
      showText={showText}
      showProfilePortrait={showProfilePortrait}
      profile={profile}
      textPanelInset={textPanelInset}
      className={className}
    />
  )
}
