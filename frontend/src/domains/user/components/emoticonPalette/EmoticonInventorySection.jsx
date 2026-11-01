// 보유 이모티콘 칸 (검색·등급 거르기 줄 + 이모티콘 목록)
// EmoticonPalettePage가 씀
import EmoticonGradeFilter from "@/domains/user/components/emoticonPalette/EmoticonGradeFilter.jsx"
import EmoticonInventoryGrid from "@/domains/user/components/emoticonPalette/EmoticonInventoryGrid.jsx"
import EmoticonSearchInput from "@/domains/user/components/emoticonPalette/EmoticonSearchInput.jsx"
import {
  INVENTORY_SECTION_CLASS,
  TOOLBAR_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { GRADE_FILTERS } from "@/domains/user/constants/emoticonPaletteText.js"

// 불러오기가 끝나기 전엔 검색·거르기·목록 모두 잠금
export default function EmoticonInventorySection({ page }) {
  return (
    <section aria-label="보유 이모티콘" className={INVENTORY_SECTION_CLASS}>
      <div className={TOOLBAR_CLASS}>
        <EmoticonSearchInput
          value={page.query}
          disabled={!page.isReady}
          onChange={(event) => page.setQuery(event.target.value)}
        />
        <EmoticonGradeFilter
          value={page.gradeFilter}
          disabled={!page.isReady}
          options={GRADE_FILTERS}
          onChange={(event) => page.setGradeFilter(event.target.value)}
        />
      </div>

      <EmoticonInventoryGrid
        items={page.visibleItems}
        ownedIds={page.ownedIdSet}
        disabled={!page.isReady}
        onAssign={page.assignItem}
      />
    </section>
  )
}
