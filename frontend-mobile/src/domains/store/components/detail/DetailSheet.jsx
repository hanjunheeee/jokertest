// 고른 상품 설명 시트 (그림·이름·분류·등급·설명·가격·구매 버튼·구매 결과)
// pages/StorePage가 상품 칸을 누르면 엶 (데스크톱 패널 아래 설명 칸 대신)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { getItemDisplayIcon } from "@/domains/store/constants/storeItems.js"
import { storePurchase } from "@/domains/store/store/storePurchase.store.js"
import { isPurchaseDisabled } from "@/domains/store/utils/storePanel.js"
import BottomSheet from "../sheet/BottomSheet.jsx"
import PurchaseFeedback from "../feedback/PurchaseFeedback.jsx"
import DetailPrice from "./DetailPrice.jsx"
import DetailZoomAction from "./DetailZoomAction.jsx"
import PurchaseButton from "./PurchaseButton.jsx"

// 버튼 잠금·글자·보유 표시는 데스크톱 StorePanel이 설명 칸에 넘기는 값과 같은 식
export default function DetailSheet({ open, onClose, panel }) {
    const item = panel.currentItem
    const { bulkMode, ownedItemIds } = panel

    return (
        <BottomSheet open={open && Boolean(item)} title={item?.name ?? ""} closeLabel="상품 설명 닫기" onClose={onClose}>
            {item ? (
                <section className="flex flex-col gap-3" aria-label="선택한 아이템 정보">
                    <div className="flex items-center gap-3 land:gap-4">
                        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#1a0f0a]/08 land:h-24 land:w-24">
                            <PublicAsset
                                src={getItemDisplayIcon(item, panel.isDeadPreview(item.id))}
                                alt=""
                                className="block h-full w-full select-none object-contain"
                            />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1 font-subheading">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <p className="app-text-scaled [--app-text-size:1.1rem] font-extrabold leading-tight text-[#140c08]">{item.name}</p>
                                {item.tag ? (
                                    <span className="rounded-sm bg-[#2a1810]/18 px-1.5 py-0.5 app-text-scaled [--app-text-size:0.72rem] font-bold text-[#6b3a28]">
                                        {item.tag}
                                    </span>
                                ) : null}
                            </div>
                            <p className="app-text-scaled [--app-text-size:0.85rem] font-bold text-[#6b4a32]">
                                {item.category}
                                <span className="mx-1.5 text-[#8b7355]/70">·</span>
                                {item.grade}
                            </p>
                            <DetailZoomAction
                                item={item}
                                previewDead={panel.isDeadPreview(item.id)}
                                onToggleDeadPreview={panel.toggleDeadPreview}
                                onOpenSkinZoom={panel.openSkinZoom}
                                onOpenProfileBorderZoom={panel.openProfileBorderZoom}
                            />
                        </div>
                    </div>

                    {item.description ? (
                        <p className="font-subheading app-text-scaled [--app-text-size:0.88rem] leading-relaxed text-[#3d2a1c]">{item.description}</p>
                    ) : null}

                    <PurchaseFeedback state={panel.purchaseState} onCheck={storePurchase.check} onRetry={storePurchase.retry} />

                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md bg-[#1a0f0a]/10 px-3 py-2">
                        <DetailPrice item={item} />
                        <PurchaseButton
                            onClick={panel.handlePurchaseClick}
                            owned={!bulkMode && ownedItemIds.has(item.id)}
                            label={bulkMode ? null : panel.purchaseLabel}
                            disabled={isPurchaseDisabled({
                                currentItem: item,
                                bulkMode,
                                bulkSelectedIds: panel.bulkSelectedIds,
                                ownedItemIds,
                                purchaseLocked: panel.purchaseLocked,
                                economyStatus: panel.economyStatus,
                            })}
                        />
                    </div>
                </section>
            ) : null}
        </BottomSheet>
    )
}
