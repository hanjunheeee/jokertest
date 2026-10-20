import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  EMOTICON_PALETTE_FILTER_CHEVRON_CLASS,
  EMOTICON_PALETTE_FILTER_FRAME_CLASS,
  EMOTICON_PALETTE_FILTER_LABEL_CLASS,
  EMOTICON_PALETTE_FILTER_SELECT_CLASS,
  EMOTICON_PALETTE_FILTER_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function EmoticonGradeFilter({ value, disabled, options, onChange }) {
  return (
    <div className={EMOTICON_PALETTE_FILTER_WRAP_CLASS}>
      <div className={EMOTICON_PALETTE_FILTER_FRAME_CLASS} aria-hidden="true">
        <span className={EMOTICON_PALETTE_FILTER_LABEL_CLASS}>{value}</span>
        <PublicAsset
          src={EMOTICON_PALETTE_ASSETS.chevronDown}
          alt=""
          className={EMOTICON_PALETTE_FILTER_CHEVRON_CLASS}
        />
      </div>
      <select
        aria-label="이모티콘 등급 필터"
        value={value}
        disabled={disabled}
        onChange={onChange}
        className={EMOTICON_PALETTE_FILTER_SELECT_CLASS}
      >
        {options.map((grade) => (
          <option key={grade} value={grade}>{grade}</option>
        ))}
      </select>
    </div>
  )
}
