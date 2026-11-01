// 확대 창 안 테두리 그림 칸
// ProfileBorderZoomPanel이 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  ILLUSTRATION_CLASS,
  ILLUSTRATION_WRAP_CLASS,
} from "@/shared/ui/profileBorderZoom/profileBorderZoomLayout.js"

// label을 그림 alt로도 씀 (화면 읽기용)
export default function ProfileBorderZoomIllustration({ src, label }) {
  return (
    <div className={ILLUSTRATION_WRAP_CLASS}>
      <PublicAsset src={src} alt={label} className={ILLUSTRATION_CLASS} />
    </div>
  )
}
