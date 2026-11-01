// 팔레트 저장·취소 그림 버튼
// EmoticonWheelSection이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  IMG_BTN_CLASS,
  IMG_BTN_IMG_CLASS,
  IMG_BTN_LABEL_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

// 그림 위에 글자
export default function EmoticonPaletteImageButton({ label, src, disabled, onClick, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={IMG_BTN_CLASS}
    >
      <PublicAsset src={src} alt="" className={IMG_BTN_IMG_CLASS} />
      <span className={IMG_BTN_LABEL_CLASS}>{label}</span>
    </button>
  )
}
