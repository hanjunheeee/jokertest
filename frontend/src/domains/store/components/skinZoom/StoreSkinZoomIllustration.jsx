import PublicAsset from "@/shared/ui/PublicAsset"
import {
  STORE_SKIN_ZOOM_ILLUSTRATION_CLASS,
  STORE_SKIN_ZOOM_ILLUSTRATION_WRAP_CLASS,
} from "../../constants/storeSkinZoomLayout.js"

export default function StoreSkinZoomIllustration({ src, name }) {
  return (
    <div className={STORE_SKIN_ZOOM_ILLUSTRATION_WRAP_CLASS}>
      <PublicAsset src={src} alt={name} className={STORE_SKIN_ZOOM_ILLUSTRATION_CLASS} />
    </div>
  )
}
