// 상품 칸 목록 (위 줄·빈 목록 안내·상품 칸 격자)
// pages/StorePage가 씀, 칸 하나는 grid/ItemSlot
import { getItemDisplayIcon } from "@/domains/store/constants/storeItems.js"
import GridToolbar from "./GridToolbar.jsx"
import ItemSlot from "./ItemSlot.jsx"

// 폰 세로 3칸, 가로·태블릿은 더 많이
const GRID_CLASS = "grid grid-cols-3 gap-x-2 gap-y-3 md:grid-cols-4 land:grid-cols-6 lg:grid-cols-6"

// 선택 규칙은 데스크톱 StoreItemGrid 그대로, 일반 모드에서 고르면 설명 시트도 엶
export default function ItemGrid({
    items,
    selectedItemId,
    onSelectItem,
    onOpenDetail,
    deadPreviewIds,
    onToggleDeadPreview,
    onOpenSkinZoom,
    onOpenProfileBorderZoom,
    showBulkPurchase = true,
    showSkinNotice = false,
    bulkMode = false,
    bulkSelectedIds,
    ownedItemIds,
    selectionDisabled = false,
    onBulkModeChange,
    onBulkSelectionChange,
}) {
    // 잠겨 있으면 무시, 일괄구매 중엔 충전 상품·보유 상품 빼고 고른 목록에 넣고 뺌
    const handleSelectItem = (item) => {
        if (selectionDisabled) return
        if (bulkMode && !item.kind && !ownedItemIds.has(item.id)) {
            onBulkSelectionChange?.(item.id)
        }
        onSelectItem(item)
        if (!bulkMode) onOpenDetail?.()
    }

    // 일괄구매면 고른 목록에 있는지, 아니면 고른 한 상품인지
    const isItemSelected = (itemId) => (bulkMode ? bulkSelectedIds.has(itemId) : selectedItemId === itemId)

    if (items.length === 0) {
        return (
            <div className="flex min-h-48 w-full items-center justify-center px-4" role="status">
                <p className="text-center font-display app-text-scaled [--app-text-size:1.35rem] font-medium leading-snug text-[#2a1810]/55">
                    준비된 상품이 없습니다.
                </p>
            </div>
        )
    }

    return (
        <div className="relative">
            {showBulkPurchase ? (
                <GridToolbar showSkinNotice={showSkinNotice} active={bulkMode} onToggle={() => onBulkModeChange?.(!bulkMode)} />
            ) : null}
            <div className={GRID_CLASS}>
                {items.map((item) => (
                    <ItemSlot
                        key={item.id}
                        item={item}
                        icon={getItemDisplayIcon(item, deadPreviewIds.has(item.id))}
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
        </div>
    )
}
