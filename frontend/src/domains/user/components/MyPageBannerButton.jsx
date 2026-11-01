// 마이페이지 배너 버튼 (배너 틀·닉네임·초상, 톱니가 있으면 계정 설정 버튼)
// 로비 프로필 영역·MyPageLayout·시험이 씀
import BannerMainButton from "./MyPageBannerButton/BannerMainButton.jsx"
import SettingsGearButton from "./MyPageBannerButton/SettingsGearButton.jsx"
import { MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import {
  LOBBY_BANNER_WIDTH_CLASS,
  LOBBY_TEXT_PANEL_INSET,
  BANNER_FRAME_IMG_CLASS,
  ROOT_CLASS,
} from "../constants/myPageBannerStyle.js"

// 톱니를 켜고 처리 함수도 있을 때만 톱니 버튼을 겹침
export default function MyPageBannerButton({
  onClick,
  onSettingsClick,
  profile,
  showText = true,
  showProfilePortrait = false,
  showSettingsIcon = false,
  bannerSrc = MY_PAGE_ASSETS.myPageButtonFrame,
  bannerImageClassName = BANNER_FRAME_IMG_CLASS,
  textPanelInset = LOBBY_TEXT_PANEL_INSET,
  className = LOBBY_BANNER_WIDTH_CLASS,
}) {
  const hasSettingsControl = showSettingsIcon && typeof onSettingsClick === "function"

  // 톱니 있음: 바깥 틀 안에 배너 + 톱니
  if (hasSettingsControl) {
    return (
      <div className={`${ROOT_CLASS} ${className}`}>
        <BannerMainButton
          onClick={onClick}
          bannerSrc={bannerSrc}
          bannerImageClassName={bannerImageClassName}
          showText={showText}
          showProfilePortrait={showProfilePortrait}
          profile={profile}
          textPanelInset={textPanelInset}
          className="!w-full"
        />
        <SettingsGearButton onClick={onSettingsClick} />
      </div>
    )
  }

  // 톱니 없음: 배너만
  return (
    <BannerMainButton
      onClick={onClick}
      bannerSrc={bannerSrc}
      bannerImageClassName={bannerImageClassName}
      showText={showText}
      showProfilePortrait={showProfilePortrait}
      profile={profile}
      textPanelInset={textPanelInset}
      className={className}
    />
  )
}
