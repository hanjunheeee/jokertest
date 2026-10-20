import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  EMOTICON_PALETTE_IMAGE_BTN_CLASS,
  EMOTICON_PALETTE_IMAGE_BTN_IMG_CLASS,
  EMOTICON_PALETTE_IMAGE_BTN_LABEL_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

export default function EmoticonPaletteImageButton({ label, src, disabled, onClick, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={EMOTICON_PALETTE_IMAGE_BTN_CLASS}
    >
      <PublicAsset src={src} alt="" className={EMOTICON_PALETTE_IMAGE_BTN_IMG_CLASS} />
      <span className={EMOTICON_PALETTE_IMAGE_BTN_LABEL_CLASS}>{label}</span>
    </button>
  )
}
