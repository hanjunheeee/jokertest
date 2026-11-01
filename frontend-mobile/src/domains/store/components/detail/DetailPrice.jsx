// 고른 상품 가격 줄 (충전 상품은 결제→지급(+보너스), 가격 미정은 문구, 나머지는 골드)
// detail/DetailSheet가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { isStorePricePending } from "@/domains/store/constants/storeItems.js"

// 재화 단위 글자
const CURRENCY_UNIT = { KRW: "원", DIAMOND: "다이아", GOLD: "골드" }
// 금액 + 단위 (원화만 천 단위 쉼표, 데스크톱과 같음)
const formatAmount = (amount, currency) =>
    `${currency === "KRW" ? amount.toLocaleString("ko-KR") : amount} ${CURRENCY_UNIT[currency] ?? currency}`

const LABEL_CLASS = "app-text-scaled [--app-text-size:0.92rem] font-bold text-[#3d1810]"
const AMOUNT_CLASS = "app-text-scaled [--app-text-size:1.02rem] font-bold tabular-nums text-[#140c08]"

// 데스크톱 StoreSelectedItemDetail 가격 줄과 같은 판단 (바탕이 밝아 글자만 진하게)
export default function DetailPrice({ item }) {
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-subheading">
            <span className={LABEL_CLASS}>{item.kind ? "결제" : "구매 가격"}</span>
            {item.kind ? (
                <span className={AMOUNT_CLASS}>
                    <span data-testid="currency-pay">{formatAmount(item.payAmount, item.payCurrency)}</span>
                    <span className="mx-1.5 text-[#8b7355]/70">→</span>
                    <span data-testid="currency-grant">지급 {formatAmount(item.grantAmount, item.grantCurrency)}</span>
                    {item.bonusAmount > 0 ? (
                        <span data-testid="currency-bonus"> · 보너스 +{formatAmount(item.bonusAmount, item.grantCurrency)}</span>
                    ) : null}
                </span>
            ) : isStorePricePending(item) ? (
                <span className={AMOUNT_CLASS}>{item.priceAmount}</span>
            ) : (
                <>
                    <PublicAsset src={STORE_ASSETS.currencyIcon} alt="" className="block h-5 w-auto shrink-0 select-none object-contain" />
                    <span className={AMOUNT_CLASS}>{item.priceAmount} 골드</span>
                </>
            )}
        </div>
    )
}
