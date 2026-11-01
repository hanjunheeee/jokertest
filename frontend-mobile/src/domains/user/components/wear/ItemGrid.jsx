// 스킨·카드 목록 (폰 2열·태블릿 3열, 기본 스크롤)
// WearSheet가 씀
import ItemButton from "@m/domains/user/components/wear/ItemButton.jsx"
import { isItemEquipped } from "@/domains/user/constants/skinCardWear/skinCardWearCatalog.js"

// 칸마다 고름·착용 중·보유 여부를 계산해 넘김
export default function ItemGrid({ items, selectedItemId, appliedSkinsByJob, appliedCardFrameId, onSelectItem }) {
  return (
    <div aria-label="스킨&카드 목록" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 land:grid-cols-2">
        {items.map((item) => (
          <ItemButton
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
  )
}
