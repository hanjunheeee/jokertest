import PublicAsset from "@/shared/ui/PublicAsset"
import {
  STORE_SKIN_ZOOM_ILLUSTRATION_CLASS,
  STORE_SKIN_ZOOM_ILLUSTRATION_WRAP_CLASS,
} from "../../constants/storeSkinZoomLayout.js"

/** 스킨 확대 팝업 — 전신 일러스트 영역 */
export default function StoreSkinZoomIllustration({ src, name }) {
  return (
    <div className={STORE_SKIN_ZOOM_ILLUSTRATION_WRAP_CLASS}>
      <PublicAsset src={src} alt={name} className={STORE_SKIN_ZOOM_ILLUSTRATION_CLASS} />
    </div>
  )
}
