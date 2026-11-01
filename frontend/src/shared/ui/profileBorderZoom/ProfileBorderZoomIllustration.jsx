import PublicAsset from "@/shared/ui/PublicAsset"
import {
  ILLUSTRATION_CLASS,
  ILLUSTRATION_WRAP_CLASS,
} from "@/shared/ui/profileBorderZoom/profileBorderZoomLayout.js"

export default function ProfileBorderZoomIllustration({ src, label }) {
  return (
    <div className={ILLUSTRATION_WRAP_CLASS}>
      <PublicAsset src={src} alt={label} className={ILLUSTRATION_CLASS} />
    </div>
  )
}
