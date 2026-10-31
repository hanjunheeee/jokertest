import BannerMainButton from "./MyPageBannerButton/BannerMainButton.jsx"
import SettingsGearButton from "./MyPageBannerButton/SettingsGearButton.jsx"
import { MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import {
  LOBBY_BANNER_WIDTH_CLASS,
  LOBBY_TEXT_PANEL_INSET,
  MY_PAGE_BANNER_FRAME_IMAGE_CLASS,
  MY_PAGE_BANNER_ROOT_CLASS,
} from "../constants/myPageBannerStyle.js"

export default function MyPageBannerButton({
  onClick,
  onSettingsClick,
  profile,
  showText = true,
  showProfilePortrait = false,
  showSettingsIcon = false,
  bannerSrc = MY_PAGE_ASSETS.myPageButtonFrame,
  bannerImageClassName = MY_PAGE_BANNER_FRAME_IMAGE_CLASS,
  textPanelInset = LOBBY_TEXT_PANEL_INSET,
  className = LOBBY_BANNER_WIDTH_CLASS,
}) {
  const hasSettingsControl = showSettingsIcon && typeof onSettingsClick === "function"

  if (hasSettingsControl) {
    return (
      <div className={`${MY_PAGE_BANNER_ROOT_CLASS} ${className}`}>
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
