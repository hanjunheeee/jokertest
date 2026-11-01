// 고른 상품 가격 묶음 (충전 상품은 결제→지급(+보너스), 가격 미정은 문구, 나머지는 골드)
// detail/ItemDetail이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { isStorePricePending } from "@/domains/store/constants/storeItems.js"
import {
    DETAIL_META_DIVIDER_CLASS,
    DETAIL_PRICE_AMOUNT_CLASS,
    DETAIL_PRICE_GROUP_CLASS,
    DETAIL_PRICE_ICON_CLASS,
    DETAIL_PRICE_LABEL_CLASS,
    DETAIL_PRICE_TEXT_CLASS,
} from "@/domains/store/constants/storeLayoutStyle.js"

// 재화 단위 글자
const CURRENCY_UNIT = { KRW: "원", DIAMOND: "다이아", GOLD: "골드" }
// 금액 + 단위 (원화만 천 단위 쉼표, 데스크톱과 같음)
const formatAmount = (amount, currency) =>
    `${currency === "KRW" ? amount.toLocaleString("ko-KR") : amount} ${CURRENCY_UNIT[currency] ?? currency}`

// 데스크톱 StoreSelectedItemDetail 가격 묶음과 같은 판단·같은 모양 class
export default function DetailPrice({ item }) {
    return (
        <div className={`${DETAIL_PRICE_GROUP_CLASS} min-w-0`}>
            <span className={DETAIL_PRICE_LABEL_CLASS}>{item.kind ? "결제" : "구매 가격"}</span>
            {item.kind ? (
                <span className={DETAIL_PRICE_AMOUNT_CLASS}>
                    <span data-testid="currency-pay">{formatAmount(item.payAmount, item.payCurrency)}</span>
                    <span className={DETAIL_META_DIVIDER_CLASS}>→</span>
                    <span data-testid="currency-grant">지급 {formatAmount(item.grantAmount, item.grantCurrency)}</span>
                    {item.bonusAmount > 0 ? (
                        <span data-testid="currency-bonus"> · 보너스 +{formatAmount(item.bonusAmount, item.grantCurrency)}</span>
                    ) : null}
                </span>
            ) : isStorePricePending(item) ? (
                <span className={DETAIL_PRICE_TEXT_CLASS}>{item.priceAmount}</span>
            ) : (
                <>
                    <PublicAsset src={STORE_ASSETS.currencyIcon} alt="" className={DETAIL_PRICE_ICON_CLASS} />
                    <span className={DETAIL_PRICE_AMOUNT_CLASS}>{item.priceAmount} 골드</span>
                </>
            )}
        </div>
    )
}
