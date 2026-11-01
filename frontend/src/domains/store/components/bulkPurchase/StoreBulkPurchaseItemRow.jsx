import PublicAsset from "@/shared/ui/PublicAsset"
import { isStorePricePending } from "../../constants/storeItems.js"
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  ITEM_IMG_CLASS,
  ITEM_IMG_WRAP_CLASS,
  ITEM_INFO_CLASS,
  ITEM_NAME_CLASS,
  ITEM_PRICE_AMOUNT_CLASS,
  ITEM_PRICE_CLASS,
  ITEM_PRICE_ICON_CLASS,
  ITEM_ROW_CLASS,
} from "../../constants/storeBulkPurchaseLayout.js"

export default function StoreBulkPurchaseItemRow({ item, displayIcon = item.icon }) {
  return (
    <div className={ITEM_ROW_CLASS}>
      <div className={ITEM_IMG_WRAP_CLASS}>
        <PublicAsset src={displayIcon} alt="" className={ITEM_IMG_CLASS} />
      </div>

      <div className={ITEM_INFO_CLASS}>
        <p className={ITEM_NAME_CLASS}>{item.name}</p>
        <div className={ITEM_PRICE_CLASS}>
          {isStorePricePending(item) ? (
            <span className={ITEM_PRICE_AMOUNT_CLASS}>{item.priceAmount}</span>
          ) : (
            <>
              <PublicAsset
                src={STORE_ASSETS.currencyIcon}
                alt=""
                className={ITEM_PRICE_ICON_CLASS}
              />
              <span className={ITEM_PRICE_AMOUNT_CLASS}>{item.priceAmount}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
