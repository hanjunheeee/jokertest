// 상품 한 칸 (보유중 표시·이름·그림·가격 + 오른쪽 위 보조 버튼)
// grid/ItemGrid가 상품마다 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { SLOT_CARD_CLASS, SLOT_CARD_SELECTED_CLASS, SLOT_TOP_CLASS } from "./slotStyle.js"
import { isPlayerCardStoreItem, isProfileBorderStoreItem, isSkinStoreItem } from "@/domains/store/constants/storeItems.js"
import SlotName from "./SlotName.jsx"
import SlotPrice from "./SlotPrice.jsx"
import SlotZoomButton from "./SlotZoomButton.jsx"

// 칸 카드 모양은 데스크톱 값 그대로(slotStyle), 그림 칸은 폰 폭에 맞춘 정사각
export default function ItemSlot({
    item,
    icon,
    selected,
    previewDead,
    owned = false,
    onSelect,
    onToggleDeadPreview,
    onOpenSkinZoom,
    onOpenProfileBorderZoom,
}) {
    const hasZoom = isPlayerCardStoreItem(item) || isSkinStoreItem(item) || isProfileBorderStoreItem(item)

    return (
        <div className="relative w-full min-w-0">
            <button
                type="button"
                onClick={onSelect}
                className="flex w-full min-w-0 cursor-pointer flex-col border-0 bg-transparent p-0 text-left active:opacity-90"
                style={{ outline: "none" }}
                aria-pressed={selected}
            >
                <div className={`${SLOT_CARD_CLASS} ${selected ? SLOT_CARD_SELECTED_CLASS : ""}`}>
                    {/* 보유한 상품은 왼쪽 아래(그림 위)에 보유중 표시 */}
                    {owned ? (
                        <span
                            className="absolute bottom-9 left-1 z-10 rounded-sm bg-[#2a1810]/78 px-1.5 py-0.5 app-text-scaled [--app-text-size:0.66rem] font-bold text-[#f5f0e6]"
                            aria-hidden="true"
                        >
                            보유중
                        </span>
                    ) : null}
                    <div className={SLOT_TOP_CLASS}>
                        <SlotName name={item.name} reserveRight={hasZoom} />
                        <div className="my-1 flex aspect-square w-full items-center justify-center md:aspect-[5/4] land:aspect-[4/3]">
                            <PublicAsset src={icon} alt="" className="block h-full w-full select-none object-contain object-center" />
                        </div>
                    </div>
                    <SlotPrice item={item} selected={selected} />
                </div>
            </button>

            <SlotZoomButton
                item={item}
                previewDead={previewDead}
                onToggleDeadPreview={onToggleDeadPreview}
                onOpenSkinZoom={onOpenSkinZoom}
                onOpenProfileBorderZoom={onOpenProfileBorderZoom}
            />
        </div>
    )
}
