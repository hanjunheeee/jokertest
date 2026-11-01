// 일괄구매 창의 고른 상품 목록 (스크롤)
// StoreBulkPurchasePanel이 씀
import { getItemDisplayIcon } from "../../constants/storeItems.js"
import { LIST_CLASS } from "../../constants/storeBulkPurchaseLayout.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import StoreBulkPurchaseItemRow from "./StoreBulkPurchaseItemRow.jsx"

// 사망 미리보기 중인 카드는 그 그림 그대로 보임
export default function StoreBulkPurchaseItemList({ items, deadPreviewIds = new Set() }) {
  return (
    <div
      className={`${LIST_CLASS} ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`}
      aria-label="선택한 상품 목록"
    >
      {items.map((item) => (
        <StoreBulkPurchaseItemRow
          key={item.id}
          item={item}
          displayIcon={getItemDisplayIcon(item, deadPreviewIds.has(item.id))}
        />
      ))}
    </div>
  )
}
