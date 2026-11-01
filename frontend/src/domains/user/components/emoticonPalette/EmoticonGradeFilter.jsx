// 이모티콘 등급 거르기 칸 (보이는 틀 + 투명 select)
// EmoticonInventorySection이 씀
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  FILTER_CHEVRON_CLASS,
  FILTER_FRAME_CLASS,
  FILTER_LABEL_CLASS,
  FILTER_SELECT_CLASS,
  FILTER_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 보이는 틀은 화면 읽기에서 숨기고, 실제 고르기는 위에 겹친 투명 select가 맡음
export default function EmoticonGradeFilter({ value, disabled, options, onChange }) {
  return (
    <div className={FILTER_WRAP_CLASS}>
      <div className={FILTER_FRAME_CLASS} aria-hidden="true">
        <span className={FILTER_LABEL_CLASS}>{value}</span>
        <PublicAsset
          src={EMOTICON_PALETTE_ASSETS.chevronDown}
          alt=""
          className={FILTER_CHEVRON_CLASS}
        />
      </div>
      <select
        aria-label="이모티콘 등급 필터"
        value={value}
        disabled={disabled}
        onChange={onChange}
        className={FILTER_SELECT_CLASS}
      >
        {options.map((grade) => (
          <option key={grade} value={grade}>{grade}</option>
        ))}
      </select>
    </div>
  )
}
