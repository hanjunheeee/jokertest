// 가게 패널 (재화 목록 상태·상품 칸·고른 상품 설명과 단추 아래 구매 안내·분류 사이드바, 상태는 useStorePanel)
// StorePage가 씀
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import StoreItemGrid from "./StoreItemGrid.jsx"
import StoreSelectedItemDetail from "./StoreSelectedItemDetail.jsx"
import StoreSidebar from "./StoreSidebar.jsx"
import StorePanelOverlays from "./StorePanelOverlays.jsx"
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import { getItemDisplayIcon } from "../../constants/storeItems.js"
import { storePurchase } from "../../store/storePurchase.store.js"
import {
  STORE_PANEL_CLASS,
  PANEL_CONTENT_CLASS,
  STORE_PANEL_FRAME_CLASS,
  PANEL_GRID_COLUMN_CLASS,
  STORE_PANEL_INNER_PAD,
  PANEL_MAIN_ROW_CLASS,
  PANEL_SCROLL_AREA_CLASS,
  PANEL_SIDEBAR_CLASS,
} from "../../constants/storeLayoutStyle.js"
import { useStorePanel } from "../../hooks/useStorePanel.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import {
  isRealPurchaseCategory, panelPurchaseBlockOf, splitCurrencyFeedbackPanel, topupReturnNotesOf,
} from "../../utils/storePanel.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import StorePurchaseFeedback from "../StorePurchaseFeedback.jsx"
import StoreCurrencyFeedback from "../StoreCurrencyFeedback.jsx"

// 결제 실패 복귀 덧붙임 글 칸 (재화 안내 칸과 같은 색)
const RETURN_NOTES_CLASS = "rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]"

// 구매 결과 안내 묶음: 일반 구매 결과·골드 구매/충전 결과·결제 실패 복귀 덧붙임 글
function PurchaseResults({ panel, resultOnly }) {
  const returnNotes = topupReturnNotesOf(panel.currencyPanel.currency)
  return (
    <>
      {/* 골드 구매 기록이면 재화 안내가 대신 보임 */}
      {panel.purchaseState.kind !== "GOLD" && <StorePurchaseFeedback state={panel.purchaseState} onCheck={storePurchase.check} onRetry={storePurchase.retry} />}
      <StoreCurrencyFeedback panel={resultOnly} onCheck={storePurchase.check} onRetry={storePurchase.retry} />
      {returnNotes.length ? (
        <div role="status" data-testid="topup-return-notes" className={RETURN_NOTES_CLASS}>
          {returnNotes.map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}
    </>
  )
}

// 영상 끝나기 전엔 숨기고 누르기 막음, 확대·일괄구매 창은 패널 밖에 붙임
export default function StorePanel({ visible = true }) {
  const panel = useStorePanel()
  const { activeCategory, currentItem, bulkMode, ownedItemIds } = panel
  const balanceGold = useEconomyStore((state) => state.balanceGold)
  // 단추 잠금과 꺼진 까닭 (잔액 미리 검사 포함)
  const block = currentItem ? panelPurchaseBlockOf(panel, balanceGold) : null
  // 고른 상품이 있으면 구매 결과는 단추 아래, 판 위엔 재화 목록 상태만 (없으면 전부 판 위)
  const { listOnly, resultOnly } = splitCurrencyFeedbackPanel(panel)
  const resultFeedback = <PurchaseResults panel={panel} resultOnly={resultOnly} />

  return (
    <>
      <motion.div
        className={STORE_PANEL_CLASS}
        initial={{ opacity: 0, y: 10 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={UI_REVEAL_TRANSITION}
        style={{ pointerEvents: visible ? "auto" : "none" }}
      >
        <div className="relative w-full">
          <PublicAsset src={STORE_ASSETS.panelFrame} alt="" className={STORE_PANEL_FRAME_CLASS} />

          <div className={PANEL_CONTENT_CLASS} style={STORE_PANEL_INNER_PAD}>
            {currentItem ? null : resultFeedback}
            <StoreCurrencyFeedback panel={listOnly} onCheck={storePurchase.check} onRetry={storePurchase.retry} />
            <div className={PANEL_MAIN_ROW_CLASS}>
              <div className={PANEL_GRID_COLUMN_CLASS}>
                <div
                  className={`${PANEL_SCROLL_AREA_CLASS} ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`}
                >
                  {/* 인게임 재화 분류엔 일괄구매 숨김, 스킨 분류엔 안내 문구 */}
                  <StoreItemGrid
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

                {/* 일괄구매 중엔 보유 표시·기본 지급 문구를 끔 */}
                {currentItem ? (
                  <StoreSelectedItemDetail
                    item={currentItem}
                    displayIcon={getItemDisplayIcon(
                      currentItem,
                      panel.isDeadPreview(currentItem.id),
                    )}
                    onPurchaseClick={panel.handlePurchaseClick}
                    owned={!bulkMode && ownedItemIds.has(currentItem.id)}
                    purchaseLabel={bulkMode ? null : panel.purchaseLabel}
                    purchaseDisabled={block.disabled}
                    blockReason={block.reason}
                  >
                    {resultFeedback}
                  </StoreSelectedItemDetail>
                ) : null}
              </div>

              <aside className={PANEL_SIDEBAR_CLASS}>
                <StoreSidebar
                  categories={panel.categories}
                  activeCategory={activeCategory}
                  onSelectCategory={panel.selectCategory}
                />
              </aside>
            </div>
          </div>
        </div>
      </motion.div>

      <StorePanelOverlays panel={panel} />
    </>
  )
}
