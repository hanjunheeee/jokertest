import PublicAsset from "@/shared/ui/PublicAsset"
import ProfileBorderZoomIllustration from "@/shared/ui/profileBorderZoom/ProfileBorderZoomIllustration.jsx"
import {
  PROFILE_BORDER_ZOOM_CLOSE_BTN_CLASS,
  PROFILE_BORDER_ZOOM_CLOSE_BTN_IMG_CLASS,
  PROFILE_BORDER_ZOOM_CLOSE_BUTTON_SRC,
  PROFILE_BORDER_ZOOM_PANEL_CLASS,
  PROFILE_BORDER_ZOOM_TITLE_CLASS,
} from "@/shared/ui/profileBorderZoom/profileBorderZoomLayout.js"

/** 프로필 테두리 클로즈업 팝업 — 프레임·닫기 버튼 */
export default function ProfileBorderZoomPanel({ item, onClose }) {
  return (
    <div className={PROFILE_BORDER_ZOOM_PANEL_CLASS}>
      <button
        type="button"
        aria-label="프로필 테두리 확대 보기 닫기"
        onClick={onClose}
        className={PROFILE_BORDER_ZOOM_CLOSE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={PROFILE_BORDER_ZOOM_CLOSE_BUTTON_SRC}
          alt=""
          className={PROFILE_BORDER_ZOOM_CLOSE_BTN_IMG_CLASS}
        />
      </button>

      <ProfileBorderZoomIllustration src={item.icon} label={item.label} />
      <p className={PROFILE_BORDER_ZOOM_TITLE_CLASS}>{item.label}</p>
    </div>
  )
}
