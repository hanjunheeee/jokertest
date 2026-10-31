import PublicAsset from "@/shared/ui/PublicAsset"
import StoreItemSlotName from "./StoreItemSlotName.jsx"
import { getStoreItemDisplayIcon, getStoreProfileBorderZoomItem, isPlayerCardStoreItem, isProfileBorderStoreItem, isSkinStoreItem, isStorePricePending } from "../../constants/storeItems.js"
import { STORE_SKIN_CATEGORY_NOTICE } from "../../constants/storeNotices.js"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import {
  STORE_BULK_BTN_CLASS,
  STORE_BULK_BTN_IMAGE_CLASS,
  STORE_BULK_BTN_LABEL_CLASS,
  STORE_BULK_BTN_WRAP_CLASS,
  STORE_EMPTY_GRID_CLASS,
  STORE_EMPTY_MESSAGE_CLASS,
  STORE_GRID_CLASS,
  STORE_SKIN_NOTICE_CLASS,
  STORE_SKIN_NOTICE_ICON_CLASS,
  STORE_SKIN_NOTICE_TEXT_CLASS,
  STORE_ITEM_SLOT_BTN_CLASS,
  STORE_ITEM_SLOT_WRAP_CLASS,
  STORE_PREVIEW_TOGGLE_BTN_CLASS,
  STORE_PREVIEW_TOGGLE_IMG_CLASS,
  STORE_SLOT_CARD_CLASS,
  STORE_SLOT_CARD_SELECTED_CLASS,
  STORE_SLOT_IMAGE_CLASS,
  STORE_SLOT_IMAGE_WRAP_CLASS,
  STORE_SLOT_PRICE_AMOUNT_CLASS,
  STORE_SLOT_PRICE_CLASS,
  STORE_SLOT_PRICE_ICON_CLASS,
  STORE_SLOT_PRICE_SELECTED_CLASS,
  STORE_SLOT_PRICE_TEXT_CLASS,
  STORE_SLOT_TOP_CLASS,
} from "../../constants/storeLayoutStyle.js"

function StoreBulkPurchaseButton({ active, onToggle }) {
  return (
    <button
      type="button"
      className={`${STORE_BULK_BTN_CLASS} hover:opacity-90`}
      style={{ outline: "none" }}
      aria-pressed={active}
      onClick={onToggle}
    >
      <PublicAsset
        src={active ? STORE_ASSETS.purchaseButton : STORE_ASSETS.inactiveButton}
        alt=""
        className={STORE_BULK_BTN_IMAGE_CLASS}
      />
      <span className={STORE_BULK_BTN_LABEL_CLASS}>일괄구매</span>
    </button>
  )
}

function StoreItemSlot({
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
  const showPreviewToggle = isPlayerCardStoreItem(item)
  const showSkinExpandButton = isSkinStoreItem(item)
  const showProfileBorderExpandButton = isProfileBorderStoreItem(item)

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

          <div className={`${STORE_SLOT_PRICE_CLASS} ${selected ? STORE_SLOT_PRICE_SELECTED_CLASS : ""}`}>
            {item.kind ? (
              item.payCurrency === "DIAMOND" ? (
                <>
                  <PublicAsset
                    src={STORE_ASSETS.premiumCurrencyIcon}
                    alt=""
                    className={STORE_SLOT_PRICE_ICON_CLASS}
                  />
                  <span className={STORE_SLOT_PRICE_AMOUNT_CLASS}>{item.payAmount}</span>
                </>
              ) : (
                <span className={STORE_SLOT_PRICE_TEXT_CLASS}>{item.payAmount.toLocaleString("ko-KR")}원</span>
              )
            ) : isStorePricePending({ priceAmount }) ? (
              <span className={STORE_SLOT_PRICE_TEXT_CLASS}>{priceAmount}</span>
            ) : (
              <>
                <PublicAsset
                  src={STORE_ASSETS.currencyIcon}
                  alt=""
                  className={STORE_SLOT_PRICE_ICON_CLASS}
                />
                <span className={STORE_SLOT_PRICE_AMOUNT_CLASS}>{priceAmount}</span>
              </>
            )}
          </div>
        </div>
      </button>

      {showPreviewToggle ? (
        <button
          type="button"
          className={STORE_PREVIEW_TOGGLE_BTN_CLASS}
          style={{ outline: "none" }}
          aria-label={previewDead ? "생존 상태 미리보기" : "사망 상태 미리보기"}
          aria-pressed={previewDead}
          onClick={(event) => {
            event.stopPropagation()
            onToggleDeadPreview?.()
          }}
        >
          <PublicAsset
            src={STORE_ASSETS.previewToggleButton}
            alt=""
            className={STORE_PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}

      {showSkinExpandButton ? (
        <button
          type="button"
          className={STORE_PREVIEW_TOGGLE_BTN_CLASS}
          style={{ outline: "none" }}
          aria-label={`${name} 전신 보기`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenSkinZoom?.(item)
          }}
        >
          <PublicAsset
            src={STORE_ASSETS.expandPreviewButton}
            alt=""
            className={STORE_PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}

      {showProfileBorderExpandButton ? (
        <button
          type="button"
          className={STORE_PREVIEW_TOGGLE_BTN_CLASS}
          style={{ outline: "none" }}
          aria-label={`${name} 프로필 테두리 크게 보기`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenProfileBorderZoom?.(getStoreProfileBorderZoomItem(item))
          }}
        >
          <PublicAsset
            src={STORE_ASSETS.expandPreviewButton}
            alt=""
            className={STORE_PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}
    </div>
  )
}

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
  const toggleBulkMode = () => {
    onBulkModeChange?.(!bulkMode)
  }

  const handleSelectItem = (item) => {
    if (selectionDisabled) return
    if (bulkMode && !item.kind && !ownedItemIds.has(item.id)) {
      onBulkSelectionChange?.(item.id)
    }

    onSelectItem(item)
  }

  const isItemSelected = (itemId) =>
    bulkMode ? bulkSelectedIds.has(itemId) : selectedItemId === itemId

  const isEmpty = items.length === 0

  return (
    <div className="relative shrink-0">
      {!isEmpty && showBulkPurchase ? (
        <div className={STORE_BULK_BTN_WRAP_CLASS}>
          {showSkinNotice ? (
            <p className={STORE_SKIN_NOTICE_CLASS}>
              <PublicAsset
                src={STORE_ASSETS.warningIcon}
                alt=""
                className={STORE_SKIN_NOTICE_ICON_CLASS}
              />
              <span className={STORE_SKIN_NOTICE_TEXT_CLASS}>{STORE_SKIN_CATEGORY_NOTICE}</span>
            </p>
          ) : (
            <span aria-hidden="true" className="min-w-0 flex-1" />
          )}
          <StoreBulkPurchaseButton active={bulkMode} onToggle={toggleBulkMode} />
        </div>
      ) : null}

      {isEmpty ? (
        <div className={STORE_EMPTY_GRID_CLASS} role="status">
          <p className={STORE_EMPTY_MESSAGE_CLASS}>준비된 상품이 없습니다.</p>
        </div>
      ) : (
        <div className={STORE_GRID_CLASS}>
          {items.map((item) => (
            <StoreItemSlot
              key={item.id}
              item={item}
              icon={getStoreItemDisplayIcon(item, deadPreviewIds.has(item.id))}
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
