// 보유 재화 칸 (골드·다이아, 데스크톱 상점 StoreCurrencyBalance와 같은 양피지 틀·구분선)
// 로비 TopBar가 지갑 값을 넣어 씀 (데스크톱 로비엔 없는 칸이라 모양은 상점 것을 따름)
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { CURRENCY_DIVIDER_CLASS, CURRENCY_FRAME_CLASS } from "@/domains/store/constants/storeLayoutStyle.js"
import CurrencyItem from "@m/domains/lobby/components/top/CurrencyItem.jsx"

// 폰 세로는 칸 폭이 좁아 두 칸을 위아래로 쌓고 구분선도 가로로 눕힘
export default function CurrencyBalance({ balanceGold, balanceDiamond, status, retry }) {
    return (
        <div className="shrink-0" aria-label="보유 재화">
            <div className={`${CURRENCY_FRAME_CLASS} flex-col !gap-1 land:flex-row land:!gap-3 md:flex-row md:!gap-3`}>
                <CurrencyItem icon={STORE_ASSETS.currencyIcon} label="무료 재화" amount={balanceGold} status={status} onRetry={retry} />
                <div className={`${CURRENCY_DIVIDER_CLASS} !h-px !w-full land:!h-4 land:!w-px md:!h-5 md:!w-px`} aria-hidden="true" />
                <CurrencyItem icon={STORE_ASSETS.premiumCurrencyIcon} label="유료 재화" amount={balanceDiamond} status={status} onRetry={retry} />
            </div>
        </div>
    )
}
