// 상품 한 칸 (보유중 표시·이름·그림·가격 + 오른쪽 위 보조 버튼)
// grid/ItemGrid가 상품마다 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
    ITEM_SLOT_BTN_CLASS,
    ITEM_SLOT_WRAP_CLASS,
    SLOT_CARD_SELECTED_CLASS,
    SLOT_IMG_WRAP_CLASS,
    STORE_SLOT_CARD_CLASS,
    STORE_SLOT_IMAGE_CLASS,
    STORE_SLOT_TOP_CLASS,
} from "@/domains/store/constants/storeLayoutStyle.js"
import SlotName from "./SlotName.jsx"
import SlotPrice from "./SlotPrice.jsx"
import SlotZoomButton from "./SlotZoomButton.jsx"

// 칸 모양은 데스크톱 상수 그대로, 보조 버튼은 칸 버튼 밖에 둠 (버튼 안에 버튼을 넣지 않기 위함)
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
    return (
        <div className={`${ITEM_SLOT_WRAP_CLASS} min-w-0`}>
            <button
                type="button"
                onClick={onSelect}
                className={ITEM_SLOT_BTN_CLASS}
                style={{ outline: "none" }}
                aria-pressed={selected}
            >
                <div className={`${STORE_SLOT_CARD_CLASS} ${selected ? SLOT_CARD_SELECTED_CLASS : ""}`}>
                    {/* 보유한 상품은 왼쪽 위에 보유중 표시 (데스크톱과 같은 자리·모양) */}
                    {owned ? (
                        <span
                            className="absolute left-1 top-1 z-10 rounded-sm bg-[#2a1810]/78 px-1.5 py-0.5 app-text-scaled [--app-text-size:0.66rem] font-bold text-[#f5f0e6]"
                            aria-hidden="true"
                        >
                            보유중
                        </span>
                    ) : null}
                    <div className={STORE_SLOT_TOP_CLASS}>
                        <SlotName name={item.name} />
                        <div className={SLOT_IMG_WRAP_CLASS}>
                            <PublicAsset src={icon} alt="" className={STORE_SLOT_IMAGE_CLASS} />
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
