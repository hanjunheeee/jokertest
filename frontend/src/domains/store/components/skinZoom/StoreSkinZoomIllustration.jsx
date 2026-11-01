// 스킨 전신 그림 한 장
// StoreSkinZoomPanel이 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  ILLUSTRATION_CLASS,
  ILLUSTRATION_WRAP_CLASS,
} from "../../constants/storeSkinZoomLayout.js"

// 그림 설명(alt)엔 스킨 이름을 넣음 (화면 읽기 프로그램용)
export default function StoreSkinZoomIllustration({ src, name }) {
  return (
    <div className={ILLUSTRATION_WRAP_CLASS}>
      <PublicAsset src={src} alt={name} className={ILLUSTRATION_CLASS} />
    </div>
  )
}
