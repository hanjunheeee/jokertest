import PublicAsset from "@/shared/ui/PublicAsset"
import {
  ILLUSTRATION_CLASS,
  ILLUSTRATION_WRAP_CLASS,
} from "../../constants/storeSkinZoomLayout.js"

export default function StoreSkinZoomIllustration({ src, name }) {
  return (
    <div className={ILLUSTRATION_WRAP_CLASS}>
      <PublicAsset src={src} alt={name} className={ILLUSTRATION_CLASS} />
    </div>
  )
}
