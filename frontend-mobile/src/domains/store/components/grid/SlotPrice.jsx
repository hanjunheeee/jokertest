// 상품 칸 아래 가격 줄 (충전 상품은 다이아·원, 가격 미정은 문구, 나머지는 골드)
// grid/ItemSlot이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { isStorePricePending } from "@/domains/store/constants/storeItems.js"
import {
    SLOT_PRICE_AMOUNT_CLASS,
    SLOT_PRICE_ICON_CLASS,
    SLOT_PRICE_SELECTED_CLASS,
    SLOT_PRICE_TEXT_CLASS,
    STORE_SLOT_PRICE_CLASS,
} from "@/domains/store/constants/storeLayoutStyle.js"

// 데스크톱 StoreSlotPrice와 같은 판단·같은 모양 class
export default function SlotPrice({ item, selected }) {
    const { priceAmount } = item
    return (
        <div className={`${STORE_SLOT_PRICE_CLASS} ${selected ? SLOT_PRICE_SELECTED_CLASS : ""}`}>
            {item.kind ? (
                item.payCurrency === "DIAMOND" ? (
                    <>
                        <PublicAsset src={STORE_ASSETS.premiumCurrencyIcon} alt="" className={SLOT_PRICE_ICON_CLASS} />
                        <span className={SLOT_PRICE_AMOUNT_CLASS}>{item.payAmount}</span>
                    </>
                ) : (
                    <span className={SLOT_PRICE_TEXT_CLASS}>{item.payAmount.toLocaleString("ko-KR")}원</span>
                )
            ) : isStorePricePending({ priceAmount }) ? (
                <span className={SLOT_PRICE_TEXT_CLASS}>{priceAmount}</span>
            ) : (
                <>
                    <PublicAsset src={STORE_ASSETS.currencyIcon} alt="" className={SLOT_PRICE_ICON_CLASS} />
                    <span className={SLOT_PRICE_AMOUNT_CLASS}>{priceAmount}</span>
                </>
            )}
        </div>
    )
}
