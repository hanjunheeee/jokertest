import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  EMOTICON_PALETTE_PLATE_NAMEPLATE_CLASS,
  EMOTICON_PALETTE_PLATE_NAMEPLATE_IMG_CLASS,
  EMOTICON_PALETTE_PLATE_NAMEPLATE_LABEL_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const CURSOR_OFFSET_X = 14
const CURSOR_OFFSET_Y = 12

export default function EmoticonPlateNameplate({ name, x, y }) {
  return (
    <span
      className={EMOTICON_PALETTE_PLATE_NAMEPLATE_CLASS}
      style={{ left: x + CURSOR_OFFSET_X, top: y + CURSOR_OFFSET_Y }}
      aria-hidden="true"
    >
      <PublicAsset
        src={EMOTICON_PALETTE_ASSETS.nameplate}
        alt=""
        className={EMOTICON_PALETTE_PLATE_NAMEPLATE_IMG_CLASS}
      />
      <span className={EMOTICON_PALETTE_PLATE_NAMEPLATE_LABEL_CLASS}>{name}</span>
    </span>
  )
}
