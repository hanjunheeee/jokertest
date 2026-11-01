// 이모티콘 이름 검색칸 (틀 그림 + input)
// EmoticonInventorySection이 씀
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  SEARCH_FRAME_CLASS,
  SEARCH_INPUT_CLASS,
  SEARCH_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 불러오기 전엔 잠금
export default function EmoticonSearchInput({ value, disabled, onChange }) {
  return (
    <div className={SEARCH_WRAP_CLASS}>
      <PublicAsset
        src={EMOTICON_PALETTE_ASSETS.searchInput}
        alt=""
        className={SEARCH_FRAME_CLASS}
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label="이모티콘 검색"
        value={value}
        disabled={disabled}
        onChange={onChange}
        placeholder="이모티콘 이름 검색"
        className={SEARCH_INPUT_CLASS}
      />
    </div>
  )
}
