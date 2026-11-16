// 보유 이모티콘 검색·등급 거르기 줄 (검색칸 틀 그림 + 보이는 틀 위에 겹친 투명 select)
// EmoticonPalettePage가 씀
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import { FILTER_CHEVRON_CLASS, FILTER_SELECT_CLASS } from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { GRADE_FILTERS } from "@/domains/user/constants/emoticonPaletteText.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 불러오기 전엔 둘 다 잠금, 세로 컴팩트(32px)
export default function Toolbar({ page }) {
  const disabled = !page.isReady

  return (
    <div className="flex shrink-0 items-stretch gap-1.5">
      <div className="relative h-8 min-w-0 flex-1">
        <PublicAsset
          src={EMOTICON_PALETTE_ASSETS.searchInput}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 block h-full w-full select-none object-fill"
        />
        {/* 안내 글 /75·잠금 흐림 70%: 목록을 못 받아 잠긴 채여도 안내 글이 읽힘 */}
        <input
          type="search"
          aria-label="이모티콘 검색"
          value={page.query}
          disabled={disabled}
          onChange={(event) => page.setQuery(event.target.value)}
          placeholder="이모티콘 이름 검색"
          className="absolute inset-0 w-full bg-transparent pl-8 pr-2 font-subheading app-input-text leading-none text-[#f5f0e6] outline-none placeholder:text-xs placeholder:text-[#f5f0e6]/75 disabled:opacity-70"
        />
      </div>

      <div className="relative h-8 w-[5rem] shrink-0">
        <div
          aria-hidden="true"
          className="flex h-full items-center rounded-sm border border-[#8b7355]/55 bg-[#c9b892]/78 px-1.5 py-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_8px_rgba(26,15,10,0.22)]"
        >
          <span className="min-w-0 flex-1 truncate font-subheading text-[0.6875rem] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
            {page.gradeFilter}
          </span>
          <PublicAsset src={EMOTICON_PALETTE_ASSETS.chevronDown} alt="" className={FILTER_CHEVRON_CLASS} />
        </div>
        <select
          aria-label="이모티콘 등급 필터"
          value={page.gradeFilter}
          disabled={disabled}
          onChange={(event) => page.setGradeFilter(event.target.value)}
          className={FILTER_SELECT_CLASS}
        >
          {GRADE_FILTERS.map((grade) => (
            <option key={grade} value={grade}>{grade}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
