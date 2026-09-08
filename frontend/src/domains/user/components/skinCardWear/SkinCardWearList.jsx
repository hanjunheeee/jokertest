import { useRef } from "react"
import { isSkinCardWearItemEquipped } from "@/domains/user/constants/skinCardWear/skinCardWearCatalog.js"
import {
  SKIN_CARD_WEAR_LIST_BODY_CLASS,
  SKIN_CARD_WEAR_LIST_CLASS,
  SKIN_CARD_WEAR_LIST_COLUMN_CLASS,
  SKIN_CARD_WEAR_LIST_SCROLL_WRAP_CLASS,
  SKIN_CARD_WEAR_LIST_SCROLLBAR_CLASS,
} from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
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
    <aside className={SKIN_CARD_WEAR_LIST_COLUMN_CLASS} aria-label="스킨&카드 목록">
      <div className={SKIN_CARD_WEAR_LIST_SCROLL_WRAP_CLASS}>
        <div ref={scrollRef} className={SKIN_CARD_WEAR_LIST_BODY_CLASS}>
          <div className={SKIN_CARD_WEAR_LIST_CLASS}>
            {items.map((item) => (
              <SkinCardWearListItem
                key={item.id}
                item={item}
                selected={selectedItemId === item.id}
                equipped={isSkinCardWearItemEquipped(item, appliedSkinsByJob, appliedCardFrameId)}
                onSelect={onSelectItem}
              />
            ))}
          </div>
        </div>

        <Scrollbar scrollRef={scrollRef} className={SKIN_CARD_WEAR_LIST_SCROLLBAR_CLASS} />
      </div>
    </aside>
  )
}
