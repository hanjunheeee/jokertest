import PublicAsset from "@/shared/ui/PublicAsset"
import { isStorePricePending } from "../../constants/storeItems.js"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import {
  STORE_DETAIL_IMAGE_CLASS,
  STORE_DETAIL_IMAGE_WRAP_CLASS,
  STORE_DETAIL_INFO_CLASS,
  STORE_DETAIL_META_CLASS,
  STORE_DETAIL_META_DIVIDER_CLASS,
  STORE_DETAIL_NAME_CLASS,
  STORE_DETAIL_NAME_ROW_CLASS,
  STORE_DETAIL_PRICE_AMOUNT_CLASS,
  STORE_DETAIL_PRICE_GROUP_CLASS,
  STORE_DETAIL_PRICE_ICON_CLASS,
  STORE_DETAIL_PRICE_LABEL_CLASS,
  STORE_DETAIL_PRICE_ROW_CLASS,
  STORE_DETAIL_PRICE_TEXT_CLASS,
  STORE_DETAIL_ROW_CLASS,
  STORE_DETAIL_SECTION_CLASS,
  STORE_DETAIL_TAG_CLASS,
  STORE_PURCHASE_BTN_CLASS,
  STORE_PURCHASE_BTN_IMAGE_CLASS,
  STORE_PURCHASE_LABEL_CLASS,
} from "../../constants/storeLayoutStyle.js"

// 선택한 아이템을 구매하는 버튼입니다.
function StorePurchaseButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={`${STORE_PURCHASE_BTN_CLASS} ${disabled ? "cursor-not-allowed opacity-45" : "hover:opacity-90"}`}
      style={{ outline: "none" }}
      aria-label="구매"
      disabled={disabled}
      onClick={onClick}
    >
      <PublicAsset
        src={STORE_ASSETS.purchaseButton}
        alt=""
        className={STORE_PURCHASE_BTN_IMAGE_CLASS}
      />
      <span className={STORE_PURCHASE_LABEL_CLASS}>구매</span>
    </button>
  )
}

/** 상점 하단의 선택 상품 상세 정보 패널입니다. */
export default function StoreSelectedItemDetail({
  item,
  displayIcon = item.icon,
  onPurchaseClick,
  purchaseDisabled = false,
}) {
  return (
    <section className={STORE_DETAIL_SECTION_CLASS} aria-label="선택한 아이템 정보">
      <div className={STORE_DETAIL_ROW_CLASS}>
        <div className={STORE_DETAIL_IMAGE_WRAP_CLASS}>
          <PublicAsset src={displayIcon} alt="" className={STORE_DETAIL_IMAGE_CLASS} />
        </div>

        <div className={STORE_DETAIL_INFO_CLASS}>
          <div className={STORE_DETAIL_NAME_ROW_CLASS}>
            <h2 className={STORE_DETAIL_NAME_CLASS}>{item.name}</h2>
            {item.tag ? <span className={STORE_DETAIL_TAG_CLASS}>{item.tag}</span> : null}
          </div>

          <p className={STORE_DETAIL_META_CLASS}>
            {item.category}
            <span className={STORE_DETAIL_META_DIVIDER_CLASS}>·</span>
            {item.grade}
          </p>

          <div className={STORE_DETAIL_PRICE_ROW_CLASS}>
            <div className={STORE_DETAIL_PRICE_GROUP_CLASS}>
              <span className={STORE_DETAIL_PRICE_LABEL_CLASS}>구매 가격</span>
              {isStorePricePending(item) ? (
                <span className={STORE_DETAIL_PRICE_TEXT_CLASS}>{item.priceAmount}</span>
              ) : (
                <>
                  <PublicAsset
                    src={STORE_ASSETS.currencyIcon}
                    alt=""
                    className={STORE_DETAIL_PRICE_ICON_CLASS}
                  />
                  <span className={STORE_DETAIL_PRICE_AMOUNT_CLASS}>{item.priceAmount}</span>
                </>
              )}
            </div>

            <StorePurchaseButton onClick={onPurchaseClick} disabled={purchaseDisabled} />
          </div>
        </div>
      </div>
    </section>
  )
}
