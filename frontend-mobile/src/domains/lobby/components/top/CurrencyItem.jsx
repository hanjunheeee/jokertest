// 재화 한 칸 (그림 + 숫자, 받기 전엔 ···, 실패면 칸마다 재시도 버튼)
// CurrencyBalance가 씀, 글·읽기 이름은 데스크톱 상점 StoreCurrencyItem과 같음
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { CURRENCY_AMOUNT_CLASS, CURRENCY_ICON_CLASS, CURRENCY_ITEM_CLASS } from "@/domains/store/constants/storeLayoutStyle.js"

// 재시도는 누르는 칸만 44px로 키우고 위아래 음수 여백으로 틀 높이는 그대로 둠
export default function CurrencyItem({ icon, label, amount, status, onRetry }) {
    const isError = status === "error"
    const isReady = status === "ready"

    const ariaLabel = isReady
        ? `${label} ${amount}`
        : isError
            ? `${label} 불러오기 실패, 다시 시도하려면 선택하세요`
            : `${label} 불러오는 중`

    return (
        <div className={CURRENCY_ITEM_CLASS} aria-label={ariaLabel}>
            <PublicAsset src={icon} alt="" className={CURRENCY_ICON_CLASS} />
            {isError ? (
                <button
                    type="button"
                    onClick={onRetry}
                    className={`${CURRENCY_AMOUNT_CLASS} -my-3 min-h-11 min-w-11 cursor-pointer border-0 bg-transparent p-0 underline decoration-dotted underline-offset-2`}
                >
                    재시도
                </button>
            ) : (
                <span className={`${CURRENCY_AMOUNT_CLASS} ml-auto max-w-[6rem] truncate`} aria-hidden={!isReady}>
                    {isReady ? amount.toLocaleString() : "···"}
                </span>
            )}
        </div>
    )
}
