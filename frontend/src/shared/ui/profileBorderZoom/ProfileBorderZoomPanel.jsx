import PublicAsset from "@/shared/ui/PublicAsset"
import ProfileBorderZoomIllustration from "@/shared/ui/profileBorderZoom/ProfileBorderZoomIllustration.jsx"
import {
  CLOSE_BTN_CLASS,
  CLOSE_BTN_IMG_CLASS,
  PROFILE_BORDER_ZOOM_CLOSE_BUTTON_SRC,
  PANEL_CLASS,
  TITLE_CLASS,
} from "@/shared/ui/profileBorderZoom/profileBorderZoomLayout.js"

export default function ProfileBorderZoomPanel({ item, onClose }) {
  return (
    <div className={PANEL_CLASS}>
      <button
        type="button"
        aria-label="프로필 테두리 확대 보기 닫기"
        onClick={onClose}
        className={CLOSE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={PROFILE_BORDER_ZOOM_CLOSE_BUTTON_SRC}
          alt=""
          className={CLOSE_BTN_IMG_CLASS}
        />
      </button>

      <ProfileBorderZoomIllustration src={item.icon} label={item.label} />
      <p className={TITLE_CLASS}>{item.label}</p>
    </div>
  )
}
