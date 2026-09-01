import { getStoreItemDisplayIcon } from "../../constants/storeItems.js"
import { STORE_BULK_PURCHASE_LIST_CLASS } from "../../constants/storeBulkPurchaseLayout.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import StoreBulkPurchaseItemRow from "./StoreBulkPurchaseItemRow.jsx"

/** 일괄구매 확인 — 선택 상품 목록 */
export default function StoreBulkPurchaseItemList({ items, deadPreviewIds = new Set() }) {
  return (
    <div
      className={`${STORE_BULK_PURCHASE_LIST_CLASS} ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`}
      aria-label="선택한 상품 목록"
    >
      {items.map((item) => (
        <StoreBulkPurchaseItemRow
          key={item.id}
          item={item}
          displayIcon={getStoreItemDisplayIcon(item, deadPreviewIds.has(item.id))}
        />
      ))}
    </div>
  )
}
