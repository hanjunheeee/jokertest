import { useRef } from "react"

import EmoticonPlateButton from "@/domains/user/components/emoticonPalette/EmoticonPlateButton.jsx"
import {
  EMOTICON_PALETTE_GRID_CLASS,
  EMOTICON_PALETTE_GRID_ITEM_CLASS,
  EMOTICON_PALETTE_GRID_SCROLLBAR_CLASS,
  EMOTICON_PALETTE_GRID_SCROLL_CLASS,
  EMOTICON_PALETTE_GRID_SCROLL_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function EmoticonInventoryGrid({ items, ownedIds, disabled, onAssign }) {
  const scrollRef = useRef(null)

  return (
    <div className={EMOTICON_PALETTE_GRID_SCROLL_WRAP_CLASS}>
      <div ref={scrollRef} className={EMOTICON_PALETTE_GRID_SCROLL_CLASS}>
        <ul aria-label="이모티콘 목록" className={EMOTICON_PALETTE_GRID_CLASS}>
          {items.map((item) => (
            <li key={item.id} className={EMOTICON_PALETTE_GRID_ITEM_CLASS}>
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
      <Scrollbar scrollRef={scrollRef} className={EMOTICON_PALETTE_GRID_SCROLLBAR_CLASS} />
    </div>
  )
}
