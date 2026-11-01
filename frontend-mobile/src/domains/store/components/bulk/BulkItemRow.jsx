// 일괄구매 목록 한 줄 (그림·이름·가격)
// bulk/BulkSheet가 상품마다 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { isStorePricePending } from "@/domains/store/constants/storeItems.js"

// 색은 데스크톱 storeBulkPurchaseLayout 값 그대로 (그 상수 class는 모바일 css에 안 만들어져서 여기 적음)
const PRICE_CLASS = "font-subheading app-text-scaled [--app-text-size:0.82rem] font-bold tabular-nums text-[#5c554d]"

// 가격 미정이면 문구만, 아니면 골드 아이콘과 가격
export default function BulkItemRow({ item, displayIcon }) {
    return (
        <div className="flex min-w-0 items-center gap-2.5 rounded-sm bg-[#1a0f0a]/[0.08] px-2.5 py-2">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[#1a0f0a]/[0.06]">
                <PublicAsset src={displayIcon} alt="" className="block h-full w-full select-none object-contain object-center" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="line-clamp-2 font-subheading app-text-scaled [--app-text-size:0.92rem] font-extrabold leading-snug text-[#140c08]">
                    {item.name}
                </p>
                <div className="flex items-center gap-1">
                    {isStorePricePending(item) ? (
                        <span className={PRICE_CLASS}>{item.priceAmount}</span>
                    ) : (
                        <>
                            <PublicAsset src={STORE_ASSETS.currencyIcon} alt="" className="block h-3.5 w-3.5 shrink-0 select-none object-contain" />
                            <span className={PRICE_CLASS}>{item.priceAmount}</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
