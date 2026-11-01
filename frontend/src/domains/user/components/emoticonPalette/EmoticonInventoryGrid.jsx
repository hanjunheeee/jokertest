// 이모티콘 판 목록 (스크롤 + 자체 스크롤바)
// EmoticonInventorySection이 씀
import { useRef } from "react"

import EmoticonPlateButton from "@/domains/user/components/emoticonPalette/EmoticonPlateButton.jsx"
import {
  GRID_CLASS,
  GRID_ITEM_CLASS,
  GRID_SCROLLBAR_CLASS,
  GRID_SCROLL_CLASS,
  GRID_SCROLL_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

// 보유한 것만 누를 수 있게 판마다 보유 여부를 넘김
export default function EmoticonInventoryGrid({ items, ownedIds, disabled, onAssign }) {
  const scrollRef = useRef(null)

  return (
    <div className={GRID_SCROLL_WRAP_CLASS}>
      <div ref={scrollRef} className={GRID_SCROLL_CLASS}>
        <ul aria-label="이모티콘 목록" className={GRID_CLASS}>
          {items.map((item) => (
            <li key={item.id} className={GRID_ITEM_CLASS}>
              <EmoticonPlateButton
                item={item}
                owned={ownedIds.has(item.id)}
                disabled={disabled}
                onAssign={onAssign}
              />
            </li>
          ))}
        </ul>
      </div>
      <Scrollbar scrollRef={scrollRef} className={GRID_SCROLLBAR_CLASS} />
    </div>
  )
}
