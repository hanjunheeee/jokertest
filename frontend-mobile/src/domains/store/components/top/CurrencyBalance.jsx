// 위 줄 보유 재화 (골드·다이아, 불러오는 중 ··· / 실패면 재시도 버튼)
// top/StoreTopBar가 경제 스토어 값을 넣어 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import {
    CURRENCY_AMOUNT_CLASS,
    CURRENCY_DIVIDER_CLASS,
    CURRENCY_FRAME_CLASS,
    CURRENCY_ICON_CLASS,
    CURRENCY_ITEM_CLASS,
} from "@/domains/store/constants/storeLayoutStyle.js"

// 재화 한 칸 (데스크톱 StoreCurrencyItem과 같은 상태 셋·같은 모양 class)
function CurrencyItem({ icon, amount, label, status, onRetry }) {
    const isError = status === "error"
    const isReady = status === "ready"
    const ariaLabel = isReady
        ? `${label} ${amount}`
        : isError
            ? `${label} 불러오기 실패, 다시 시도하려면 선택하세요`
            : `${label} 불러오는 중`

    return (
        <div className={`${CURRENCY_ITEM_CLASS} min-w-0`} aria-label={ariaLabel}>
            <PublicAsset src={icon} alt="" className={CURRENCY_ICON_CLASS} />
            {isError ? (
                // 누르는 자리 44px 높이 맞춤
                <button
                    type="button"
                    onClick={onRetry}
                    className={`${CURRENCY_AMOUNT_CLASS} -my-3 min-h-11 cursor-pointer border-0 bg-transparent px-1 underline decoration-dotted underline-offset-2`}
                >
                    재시도
                </button>
            ) : (
                <span className={CURRENCY_AMOUNT_CLASS} aria-hidden={!isReady}>
                    {isReady ? amount.toLocaleString() : "···"}
                </span>
            )}
        </div>
    )
}

// 골드(무료)·다이아(유료) 두 칸, 틀은 데스크톱 재화 틀 그대로
export default function CurrencyBalance({ balanceGold = 0, balanceDiamond = 0, status = "idle", onRetry }) {
    return (
        <div className={`${CURRENCY_FRAME_CLASS} min-w-0`} aria-label="보유 재화">
            <CurrencyItem icon={STORE_ASSETS.currencyIcon} amount={balanceGold} label="무료 재화" status={status} onRetry={onRetry} />
            <div className={CURRENCY_DIVIDER_CLASS} aria-hidden="true" />
            <CurrencyItem icon={STORE_ASSETS.premiumCurrencyIcon} amount={balanceDiamond} label="유료 재화" status={status} onRetry={onRetry} />
        </div>
    )
}
