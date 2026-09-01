import PublicAsset from "@/shared/ui/PublicAsset"
import { isStorePricePending } from "../../constants/storeItems.js"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import {
  STORE_BULK_PURCHASE_ITEM_IMAGE_CLASS,
  STORE_BULK_PURCHASE_ITEM_IMAGE_WRAP_CLASS,
  STORE_BULK_PURCHASE_ITEM_INFO_CLASS,
  STORE_BULK_PURCHASE_ITEM_NAME_CLASS,
  STORE_BULK_PURCHASE_ITEM_PRICE_AMOUNT_CLASS,
  STORE_BULK_PURCHASE_ITEM_PRICE_CLASS,
  STORE_BULK_PURCHASE_ITEM_PRICE_ICON_CLASS,
  STORE_BULK_PURCHASE_ITEM_ROW_CLASS,
} from "../../constants/storeBulkPurchaseLayout.js"

/** 일괄구매 확인 — 선택 상품 한 줄 */
export default function StoreBulkPurchaseItemRow({ item, displayIcon = item.icon }) {
  return (
    <div className={STORE_BULK_PURCHASE_ITEM_ROW_CLASS}>
      <div className={STORE_BULK_PURCHASE_ITEM_IMAGE_WRAP_CLASS}>
        <PublicAsset src={displayIcon} alt="" className={STORE_BULK_PURCHASE_ITEM_IMAGE_CLASS} />
      </div>

      <div className={STORE_BULK_PURCHASE_ITEM_INFO_CLASS}>
        <p className={STORE_BULK_PURCHASE_ITEM_NAME_CLASS}>{item.name}</p>
        <div className={STORE_BULK_PURCHASE_ITEM_PRICE_CLASS}>
          {isStorePricePending(item) ? (
            <span className={STORE_BULK_PURCHASE_ITEM_PRICE_AMOUNT_CLASS}>{item.priceAmount}</span>
          ) : (
            <>
              <PublicAsset
                src={STORE_ASSETS.currencyIcon}
                alt=""
                className={STORE_BULK_PURCHASE_ITEM_PRICE_ICON_CLASS}
              />
              <span className={STORE_BULK_PURCHASE_ITEM_PRICE_AMOUNT_CLASS}>{item.priceAmount}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
