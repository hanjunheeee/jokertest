// 보유 재화 두 칸 (골드·다이아, 불러오기 실패면 다시 시도 버튼 하나)
// 로비 TopBar가 지갑 값을 넣어 씀
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import CurrencyItem from "@m/domains/lobby/components/top/CurrencyItem.jsx"

// 실패 땐 두 칸 대신 44px 다시 시도 버튼 (작은 숫자 칸은 누르기 어려워서)
export default function CurrencyBalance({ balanceGold, balanceDiamond, status, retry }) {
    if (status === "error") {
        return (
            <button
                type="button"
                onClick={retry}
                aria-label="보유 재화 불러오기 실패, 다시 시도"
                className="min-h-11 shrink-0 cursor-pointer rounded-md border border-[#c9a45c]/50 bg-black/60 px-3 font-subheading text-sm font-bold text-[#ebe2cc] underline decoration-dotted underline-offset-2 active:scale-95"
            >
                재화 다시 불러오기
            </button>
        )
    }

    const ready = status === "ready"

    return (
        <div className="flex shrink-0 flex-col items-stretch gap-1 land:flex-row md:flex-row md:gap-2" aria-label="보유 재화">
            <CurrencyItem icon={STORE_ASSETS.currencyIcon} label="무료 재화" amount={balanceGold} ready={ready} />
            <CurrencyItem icon={STORE_ASSETS.premiumCurrencyIcon} label="유료 재화" amount={balanceDiamond} ready={ready} />
        </div>
    )
}
