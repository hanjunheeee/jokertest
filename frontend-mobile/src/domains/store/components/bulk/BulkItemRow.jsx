// 일괄구매 목록 한 줄 (그림·이름·가격)
// bulk/BulkModal이 상품마다 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { isStorePricePending } from "@/domains/store/constants/storeItems.js"
import {
    ITEM_IMG_CLASS,
    ITEM_IMG_WRAP_CLASS,
    ITEM_INFO_CLASS,
    ITEM_NAME_CLASS,
    ITEM_PRICE_AMOUNT_CLASS,
    ITEM_PRICE_CLASS,
    ITEM_PRICE_ICON_CLASS,
    ITEM_ROW_CLASS,
} from "@/domains/store/constants/storeBulkPurchaseLayout.js"

// 가격 미정이면 문구만, 아니면 골드 아이콘과 가격 (데스크톱 StoreBulkPurchaseItemRow와 같음)
export default function BulkItemRow({ item, displayIcon }) {
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
                            <PublicAsset src={STORE_ASSETS.currencyIcon} alt="" className={ITEM_PRICE_ICON_CLASS} />
                            <span className={ITEM_PRICE_AMOUNT_CLASS}>{item.priceAmount}</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
