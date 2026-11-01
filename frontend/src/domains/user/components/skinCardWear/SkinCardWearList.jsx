import { useRef } from "react"
import { isItemEquipped } from "../../constants/skinCardWear/skinCardWearCatalog.js"
import {
  LIST_BODY_CLASS,
  LIST_CLASS,
  LIST_COLUMN_CLASS,
  LIST_SCROLL_WRAP_CLASS,
  LIST_SCROLLBAR_CLASS,
} from "../../constants/skinCardWear/skinCardWearLayout.js"
import Scrollbar from "../../../../shared/ui/Scrollbar.jsx"
import SkinCardWearListItem from "./SkinCardWearListItem.jsx"

export default function SkinCardWearList({
  items,
  selectedItemId,
  appliedSkinsByJob,
  appliedCardFrameId,
  onSelectItem,
}) {
  const scrollRef = useRef(null)

  return (
    <aside className={LIST_COLUMN_CLASS} aria-label="스킨&카드 목록">
      <div className={LIST_SCROLL_WRAP_CLASS}>
        <div ref={scrollRef} className={LIST_BODY_CLASS}>
          <div className={LIST_CLASS}>
            {items.map((item) => (
              <SkinCardWearListItem
                key={item.id}
                item={item}
                selected={selectedItemId === item.id}
                equipped={isItemEquipped(item, appliedSkinsByJob, appliedCardFrameId)}
                owned={item.owned !== false}
                onSelect={onSelectItem}
              />
            ))}
          </div>
        </div>

        <Scrollbar scrollRef={scrollRef} className={LIST_SCROLLBAR_CLASS} />
      </div>
    </aside>
  )
}
