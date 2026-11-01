// 상점 화면 (/store): 입장 영상 뒤 위 줄·분류 탭·상품 격자, 설명·일괄구매·확대는 시트
// app/routes/index.jsx가 씀, 상태·구매 흐름은 데스크톱 useStorePanel·storePurchase 그대로
import { useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import { useStorePanel } from "@/domains/store/hooks/useStorePanel.js"
import { storePurchase } from "@/domains/store/store/storePurchase.store.js"
import { isRealPurchaseCategory } from "@/domains/store/utils/storePanel.js"
import StoreBackdrop from "../components/intro/StoreBackdrop.jsx"
import StoreTopBar from "../components/top/StoreTopBar.jsx"
import CategoryTabs from "../components/tabs/CategoryTabs.jsx"
import ItemGrid from "../components/grid/ItemGrid.jsx"
import PurchaseFeedback from "../components/feedback/PurchaseFeedback.jsx"
import BulkBar from "../components/bottom/BulkBar.jsx"
import StoreSheets from "../components/StoreSheets.jsx"

// 상품 격자를 담는 양피지 판 (데스크톱 상점 프레임 안쪽 색, 가로형 틀 그림은 세로에 안 맞아 CSS로)
const PANEL_CLASS =
    "rounded-lg border border-[#2a1810]/45 bg-[linear-gradient(180deg,#e4d3b5_0%,#d3bd99_100%)] p-2.5 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.35),inset_0_0_24px_rgba(90,60,30,0.18),0_8px_24px_rgba(0,0,0,0.35)]"

// 영상이 끝나거나 건너뛰면 화면을 보임, 영상 중엔 누르기 막음
export default function StorePage() {
    const navigate = useNavigate()
    const { bgVideoRef, introDone, skipIntro } = useVideoIntro()
    const balanceGold = useEconomyStore((state) => state.balanceGold)
    const balanceDiamond = useEconomyStore((state) => state.balanceDiamond)
    const retryEconomySummary = useEconomyStore((state) => state.retry)
    const panel = useStorePanel()
    const [detailOpen, setDetailOpen] = useState(false)
    const { activeCategory, currentItem, bulkMode, ownedItemIds } = panel

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
            <StoreBackdrop videoRef={bgVideoRef} introDone={introDone} onSkip={skipIntro} />

            <motion.div
                className="relative z-20 flex min-h-0 flex-1 flex-col"
                initial={{ opacity: 0, y: 10 }}
                animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={UI_REVEAL_TRANSITION}
                style={{ pointerEvents: introDone ? "auto" : "none" }}
                aria-hidden={!introDone}
            >
                <StoreTopBar
                    onBack={() => navigate("/lobby")}
                    balanceGold={balanceGold}
                    balanceDiamond={balanceDiamond}
                    economyStatus={panel.economyStatus}
                    onRetryEconomy={retryEconomySummary}
                    tabs={(
                        <CategoryTabs
                            categories={panel.categories}
                            activeCategory={activeCategory}
                            onSelect={panel.selectCategory}
                        />
                    )}
                />

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-3">
                    <div className={PANEL_CLASS}>
                        <PurchaseFeedback
                            className="mb-2"
                            state={panel.purchaseState}
                            onCheck={storePurchase.check}
                            onRetry={storePurchase.retry}
                        />
                        {/* 인게임 재화 분류엔 일괄구매 숨김, 스킨 분류엔 안내 문구 (데스크톱과 같음) */}
                        <ItemGrid
                            items={panel.visibleItems}
                            selectedItemId={currentItem?.id ?? null}
                            onSelectItem={panel.setSelectedItem}
                            onOpenDetail={() => setDetailOpen(true)}
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
                </div>
            </motion.div>

            {/* 일괄구매 중일 때만 바닥 줄 (확인 시트를 여는 구매 버튼) */}
            {introDone && bulkMode ? <BulkBar panel={panel} /> : null}

            <StoreSheets panel={panel} detailOpen={detailOpen} onCloseDetail={() => setDetailOpen(false)} />
        </div>
    )
}
