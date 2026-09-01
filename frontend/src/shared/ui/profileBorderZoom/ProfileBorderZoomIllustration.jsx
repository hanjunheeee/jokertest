import PublicAsset from "@/shared/ui/PublicAsset"
import {
  PROFILE_BORDER_ZOOM_ILLUSTRATION_CLASS,
  PROFILE_BORDER_ZOOM_ILLUSTRATION_WRAP_CLASS,
} from "@/shared/ui/profileBorderZoom/profileBorderZoomLayout.js"

/** 프로필 테두리 클로즈업 — 테두리 이미지 */
export default function ProfileBorderZoomIllustration({ src, label }) {
  return (
    <div className={PROFILE_BORDER_ZOOM_ILLUSTRATION_WRAP_CLASS}>
      <PublicAsset src={src} alt={label} className={PROFILE_BORDER_ZOOM_ILLUSTRATION_CLASS} />
    </div>
  )
}
