// 가게 상품 칸 목록 (위 줄·빈 목록 안내·상품 칸들, 칸 하나는 grid/ 아래)
// StorePanel이 씀
import StoreGridToolbar from "./grid/StoreGridToolbar.jsx"
import StoreItemSlot from "./grid/StoreItemSlot.jsx"
import { getItemDisplayIcon } from "../../constants/storeItems.js"
import {
  STORE_EMPTY_GRID_CLASS,
  EMPTY_MSG_CLASS,
  STORE_GRID_CLASS,
} from "../../constants/storeLayoutStyle.js"

// 상품 칸 목록, 일괄구매 중이면 고른 목록 기준으로 선택 표시
export default function StoreItemGrid({
  items,
  selectedItemId,
  onSelectItem,
  deadPreviewIds = new Set(),
  onToggleDeadPreview,
  onOpenSkinZoom,
  onOpenProfileBorderZoom,
  showBulkPurchase = true,
  showSkinNotice = false,
  bulkMode = false,
  bulkSelectedIds = new Set(),
  ownedItemIds = new Set(),
  selectionDisabled = false,
  onBulkModeChange,
  onBulkSelectionChange,
}) {
  // 일괄구매 켜고 끄기
  const toggleBulkMode = () => {
    onBulkModeChange?.(!bulkMode)
  }

  // 잠겨 있으면 무시, 일괄구매 중엔 충전 상품·보유 상품 빼고 고른 목록에 넣고 뺌
  const handleSelectItem = (item) => {
    if (selectionDisabled) return
    if (bulkMode && !item.kind && !ownedItemIds.has(item.id)) {
      onBulkSelectionChange?.(item.id)
    }

    onSelectItem(item)
  }

  // 일괄구매면 고른 목록에 있는지, 아니면 고른 한 상품인지
  const isItemSelected = (itemId) =>
    bulkMode ? bulkSelectedIds.has(itemId) : selectedItemId === itemId

  const isEmpty = items.length === 0

  return (
    <div className="relative shrink-0">
      {/* 상품이 있고 일괄구매를 보일 분류일 때만 위 줄 */}
      {!isEmpty && showBulkPurchase ? (
        <StoreGridToolbar showSkinNotice={showSkinNotice} active={bulkMode} onToggle={toggleBulkMode} />
      ) : null}

      {isEmpty ? (
        <div className={STORE_EMPTY_GRID_CLASS} role="status">
          <p className={EMPTY_MSG_CLASS}>준비된 상품이 없습니다.</p>
        </div>
      ) : (
        <div className={STORE_GRID_CLASS}>
          {items.map((item) => (
            <StoreItemSlot
              key={item.id}
              item={item}
              icon={getItemDisplayIcon(item, deadPreviewIds.has(item.id))}
              name={item.name}
              priceAmount={item.priceAmount}
              selected={isItemSelected(item.id)}
              previewDead={deadPreviewIds.has(item.id)}
              owned={ownedItemIds.has(item.id)}
              onSelect={() => handleSelectItem(item)}
              onToggleDeadPreview={() => onToggleDeadPreview?.(item.id)}
              onOpenSkinZoom={onOpenSkinZoom}
              onOpenProfileBorderZoom={onOpenProfileBorderZoom}
            />
          ))}
        </div>
      )}
    </div>
  )
}
