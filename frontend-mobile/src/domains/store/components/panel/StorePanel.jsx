// 상점 판 (구매 알림·상품 칸·고른 상품 설명·분류 목록), 상태는 데스크톱 useStorePanel을 페이지가 넘김
// pages/StorePage가 씀 (데스크톱 StorePanel 자리)
import { motion } from "framer-motion"
import { getItemDisplayIcon } from "@/domains/store/constants/storeItems.js"
import { PANEL_SCROLL_AREA_CLASS } from "@/domains/store/constants/storeLayoutStyle.js"
import { storePurchase } from "@/domains/store/store/storePurchase.store.js"
import { isPurchaseDisabled, isRealPurchaseCategory } from "@/domains/store/utils/storePanel.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PurchaseFeedback from "../feedback/PurchaseFeedback.jsx"
import ItemGrid from "../grid/ItemGrid.jsx"
import ItemDetail from "../detail/ItemDetail.jsx"
import CategoryList from "./CategoryList.jsx"

// 판 바탕: 데스크톱 상점 틀 그림은 가로 비율이라 세로 폰에 못 늘려서, 틀 안쪽 양피지 색을 CSS로
const PANEL_CLASS =
    "flex min-h-0 flex-1 flex-col rounded-lg border border-[#2a1810]/45 bg-[linear-gradient(180deg,#e4d3b5_0%,#d3bd99_100%)] p-2 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.35),inset_0_0_24px_rgba(90,60,30,0.18),0_8px_24px_rgba(0,0,0,0.35)]"

// 폰 세로는 분류 줄이 위(order), 가로·태블릿은 데스크톱처럼 오른쪽 세로 목록 (DOM 순서는 데스크톱과 같음)
const MAIN_ROW_CLASS = "flex min-h-0 flex-1 flex-col gap-2 md:flex-row md:gap-3 land:flex-row land:gap-2"
const GRID_COLUMN_CLASS = "order-2 flex min-h-0 min-w-0 flex-1 flex-col md:order-1 land:order-1"
const SIDEBAR_CLASS =
    "order-1 shrink-0 md:order-2 md:w-[26%] md:border-l md:border-[#2a1810]/28 md:pl-3 land:order-2 land:w-[10.5rem] land:border-l land:border-[#2a1810]/28 land:pl-2"

// 영상 끝나기 전엔 숨기고 누르기 막음, 일괄구매 중엔 보유 표시·기본 지급 문구를 끔 (데스크톱과 같음)
export default function StorePanel({ visible, panel }) {
    const { activeCategory, currentItem, bulkMode, ownedItemIds } = panel

    return (
        <motion.div
            className="relative z-20 flex min-h-0 flex-1 flex-col px-2 pt-1 pb-2"
            initial={{ opacity: 0, y: 10 }}
            animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={UI_REVEAL_TRANSITION}
            style={{ pointerEvents: visible ? "auto" : "none" }}
            aria-hidden={!visible}
        >
            <div className={PANEL_CLASS}>
                <PurchaseFeedback className="mb-2" state={panel.purchaseState} onCheck={storePurchase.check} onRetry={storePurchase.retry} />
                <div className={MAIN_ROW_CLASS}>
                    <div className={GRID_COLUMN_CLASS}>
                        <div className={PANEL_SCROLL_AREA_CLASS}>
                            {/* 인게임 재화 분류엔 일괄구매 숨김, 스킨 분류엔 안내 문구 */}
                            <ItemGrid
                                items={panel.visibleItems}
                                selectedItemId={currentItem?.id ?? null}
                                onSelectItem={panel.setSelectedItem}
                                deadPreviewIds={panel.deadPreviewIds}
                                onToggleDeadPreview={panel.toggleDeadPreview}
                                onOpenSkinZoom={panel.openSkinZoom}
                                onOpenProfileBorderZoom={panel.openProfileBorderZoom}
                                showBulkPurchase={isRealPurchaseCategory(activeCategory)}
                                showSkinNotice={activeCategory === "스킨"}
                                bulkMode={bulkMode}
                                bulkSelectedIds={panel.bulkSelectedIds}
                                ownedItemIds={ownedItemIds}
                                selectionDisabled={panel.selectionLocked}
                                onBulkModeChange={panel.handleBulkModeChange}
                                onBulkSelectionChange={panel.handleBulkSelectionChange}
                            />
                        </div>

                        {currentItem ? (
                            <ItemDetail
                                item={currentItem}
                                displayIcon={getItemDisplayIcon(currentItem, panel.isDeadPreview(currentItem.id))}
                                onPurchaseClick={panel.handlePurchaseClick}
                                owned={!bulkMode && ownedItemIds.has(currentItem.id)}
                                purchaseLabel={bulkMode ? null : panel.purchaseLabel}
                                purchaseDisabled={isPurchaseDisabled({
                                    currentItem,
                                    bulkMode,
                                    bulkSelectedIds: panel.bulkSelectedIds,
                                    ownedItemIds,
                                    purchaseLocked: panel.purchaseLocked,
                                    economyStatus: panel.economyStatus,
                                })}
                            />
                        ) : null}
                    </div>

                    <aside className={SIDEBAR_CLASS}>
                        <CategoryList
                            categories={panel.categories}
                            activeCategory={activeCategory}
                            onSelectCategory={panel.selectCategory}
                        />
                    </aside>
                </div>
            </div>
        </motion.div>
    )
}
