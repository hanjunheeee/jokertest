// 위 줄 보유 재화 (골드·다이아, 불러오는 중 ··· / 실패면 재시도 버튼)
// top/StoreTopBar가 경제 스토어 값을 넣어 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"

const AMOUNT_CLASS =
    "font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold tabular-nums text-[#2a1810]"

// 재화 한 칸 (데스크톱 StoreCurrencyItem과 같은 상태 셋)
function CurrencyItem({ icon, amount, label, status, onRetry }) {
    const isError = status === "error"
    const isReady = status === "ready"
    const ariaLabel = isReady
        ? `${label} ${amount}`
        : isError
            ? `${label} 불러오기 실패, 다시 시도하려면 선택하세요`
            : `${label} 불러오는 중`

    return (
        <div className="flex min-w-0 items-center gap-1" aria-label={ariaLabel}>
            <PublicAsset src={icon} alt="" className="block h-5 w-auto shrink-0 select-none object-contain" />
            {isError ? (
                // 누르는 자리 44px 높이 맞춤
                <button
                    type="button"
                    onClick={onRetry}
                    className={`${AMOUNT_CLASS} -my-2 min-h-11 cursor-pointer border-0 bg-transparent px-1 underline decoration-dotted underline-offset-2`}
                >
                    재시도
                </button>
            ) : (
                <span className={AMOUNT_CLASS} aria-hidden={!isReady}>
                    {isReady ? amount.toLocaleString() : "···"}
                </span>
            )}
        </div>
    )
}

// 골드(무료)·다이아(유료) 두 칸을 양피지 알약 하나에
export default function CurrencyBalance({ balanceGold = 0, balanceDiamond = 0, status = "idle", onRetry }) {
    return (
        <div
            className="flex h-9 items-center gap-2 rounded-md border border-[#8b7355]/50 bg-[#f5f0e6]/88 px-2.5 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.55),_0_4px_14px_rgba(26,15,10,0.24)]"
            aria-label="보유 재화"
        >
            <CurrencyItem icon={STORE_ASSETS.currencyIcon} amount={balanceGold} label="무료 재화" status={status} onRetry={onRetry} />
            <div className="h-4 w-px shrink-0 bg-[#2a1810]/20" aria-hidden="true" />
            <CurrencyItem icon={STORE_ASSETS.premiumCurrencyIcon} amount={balanceDiamond} label="유료 재화" status={status} onRetry={onRetry} />
        </div>
    )
}
