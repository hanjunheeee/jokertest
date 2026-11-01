// 상품 한 칸 (보유중 표시·이름·그림·가격 + 옆 보조 버튼)
// StoreItemGrid가 상품마다 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import StoreItemSlotName from "../StoreItemSlotName.jsx"
import StoreSlotPrice from "./StoreSlotPrice.jsx"
import StoreSlotZoomButtons from "./StoreSlotZoomButtons.jsx"
import {
  STORE_ITEM_SLOT_BTN_CLASS,
  STORE_ITEM_SLOT_WRAP_CLASS,
  STORE_SLOT_CARD_CLASS,
  STORE_SLOT_CARD_SELECTED_CLASS,
  STORE_SLOT_IMAGE_CLASS,
  STORE_SLOT_IMAGE_WRAP_CLASS,
  STORE_SLOT_TOP_CLASS,
} from "../../../constants/storeLayoutStyle.js"

export default function StoreItemSlot({
  item,
  icon,
  name,
  priceAmount,
  selected,
  previewDead,
  owned = false,
  onSelect,
  onToggleDeadPreview,
  onOpenSkinZoom,
  onOpenProfileBorderZoom,
}) {
  return (
    <div className={STORE_ITEM_SLOT_WRAP_CLASS}>
      <button
        type="button"
        onClick={onSelect}
        className={STORE_ITEM_SLOT_BTN_CLASS}
        style={{ outline: "none" }}
        aria-pressed={selected}
      >
        <div className={`${STORE_SLOT_CARD_CLASS} ${selected ? STORE_SLOT_CARD_SELECTED_CLASS : ""}`}>
          {owned ? (
            <span
              className="absolute left-1 top-1 z-10 rounded-sm bg-[#2a1810]/78 px-1.5 py-0.5 app-text-scaled [--app-text-size:clamp(0.6rem,0.82vw,0.68rem)] font-bold text-[#f5f0e6]"
              aria-hidden="true"
            >
              보유중
            </span>
          ) : null}
          <div className={STORE_SLOT_TOP_CLASS}>
            <StoreItemSlotName>{name}</StoreItemSlotName>
            <div className={STORE_SLOT_IMAGE_WRAP_CLASS}>
              <PublicAsset src={icon} alt="" className={STORE_SLOT_IMAGE_CLASS} />
            </div>
          </div>

          <StoreSlotPrice item={item} priceAmount={priceAmount} selected={selected} />
        </div>
      </button>

      <StoreSlotZoomButtons
        item={item}
        name={name}
        previewDead={previewDead}
        onToggleDeadPreview={onToggleDeadPreview}
        onOpenSkinZoom={onOpenSkinZoom}
        onOpenProfileBorderZoom={onOpenProfileBorderZoom}
      />
    </div>
  )
}
