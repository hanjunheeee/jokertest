import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  EMOTICON_PALETTE_SEARCH_FRAME_CLASS,
  EMOTICON_PALETTE_SEARCH_INPUT_CLASS,
  EMOTICON_PALETTE_SEARCH_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function EmoticonSearchInput({ value, disabled, onChange }) {
  return (
    <div className={EMOTICON_PALETTE_SEARCH_WRAP_CLASS}>
      <PublicAsset
        src={EMOTICON_PALETTE_ASSETS.searchInput}
        alt=""
        className={EMOTICON_PALETTE_SEARCH_FRAME_CLASS}
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label="이모티콘 검색"
        value={value}
        disabled={disabled}
        onChange={onChange}
        placeholder="이모티콘 이름 검색"
        className={EMOTICON_PALETTE_SEARCH_INPUT_CLASS}
      />
    </div>
  )
}
