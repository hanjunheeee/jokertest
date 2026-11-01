// 마우스 옆 이모티콘 이름표
// EmoticonPlateButton이 씀
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  PLATE_NAMEPLATE_CLASS,
  PLATE_NAMEPLATE_IMG_CLASS,
  PLATE_NAMEPLATE_LABEL_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 마우스에서 조금 떨어진 자리
const CURSOR_OFFSET_X = 14
const CURSOR_OFFSET_Y = 12

export default function EmoticonPlateNameplate({ name, x, y }) {
  return (
    <span
      className={PLATE_NAMEPLATE_CLASS}
      style={{ left: x + CURSOR_OFFSET_X, top: y + CURSOR_OFFSET_Y }}
      aria-hidden="true"
    >
      <PublicAsset
        src={EMOTICON_PALETTE_ASSETS.nameplate}
        alt=""
        className={PLATE_NAMEPLATE_IMG_CLASS}
      />
      <span className={PLATE_NAMEPLATE_LABEL_CLASS}>{name}</span>
    </span>
  )
}
