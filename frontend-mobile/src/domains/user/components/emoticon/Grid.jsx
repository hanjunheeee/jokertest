// 이모티콘 판 목록 (데스크톱과 같이 고정 높이 스크롤 + 공용 Scrollbar, 휠·드래그)
// EmoticonPalettePage가 씀
import { useRef } from "react"
import Plate from "@m/domains/user/components/emoticon/Plate.jsx"
import {
  GRID_CLASS,
  GRID_ITEM_CLASS,
  GRID_SCROLLBAR_CLASS,
  GRID_SCROLL_CLASS,
  GRID_SCROLL_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

// 모바일만 열 수 다름 (폰 3·가로 4·넓으면 5)
const LIST_CLASS = `${GRID_CLASS} md:grid-cols-5 land:grid-cols-4`

export default function Grid({ items, ownedIds, disabled, onAssign }) {
  const scrollRef = useRef(null)

  return (
    <div className={`${GRID_SCROLL_WRAP_CLASS} min-w-0`}>
      <div ref={scrollRef} className={GRID_SCROLL_CLASS}>
        <ul aria-label="이모티콘 목록" className={LIST_CLASS}>
          {items.map((item) => (
            <li key={item.id} className={`min-w-0 ${GRID_ITEM_CLASS}`}>
              <Plate item={item} owned={ownedIds.has(item.id)} disabled={disabled} onAssign={onAssign} />
            </li>
          ))}
        </ul>
      </div>
      <Scrollbar scrollRef={scrollRef} className={GRID_SCROLLBAR_CLASS} syncKey={items.length} />
    </div>
  )
}
