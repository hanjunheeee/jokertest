// 구매 결과 안내 줄 (확인 중·완료·거절·결과 모름 + 결과 확인·다시 시도 버튼)
// pages/StorePage·detail/DetailSheet·bulk/BulkSheet가 씀

// 상태별 문구 (막힘·가격 바뀜은 문구 없이 오류 글만, 데스크톱 StorePurchaseFeedback과 같음)
const MESSAGES = {
    pending: "구매 결과를 확인하고 있습니다…",
    confirmed: "구매가 완료되었습니다.",
    rejected: "구매가 거부되었습니다. 재화는 차감되지 않았습니다.",
    unknown: "구매 결과 확인이 필요합니다.",
}

const ACTION_CLASS =
    "min-h-11 cursor-pointer border-0 bg-transparent px-1 font-subheading text-sm font-bold text-[#f3dfb4] underline underline-offset-2"

// 빈 상태에 오류도 없으면 안 보임
export default function PurchaseFeedback({ state, onCheck, onRetry, className = "" }) {
    if (state.status === "idle" && !state.error) return null

    return (
        <div role="status" className={`rounded border border-[#9c793d] bg-[#241a10]/95 px-3 py-2 text-sm text-[#f3dfb4] ${className}`}>
            {MESSAGES[state.status] ? <p className="text-[#f3dfb4]">{MESSAGES[state.status]}</p> : null}
            {state.error ? <p className="text-[#f3dfb4]">{state.error}</p> : null}
            {/* 결과 모름이면 결과 확인, 결과 모름·거절이면 다시 시도 */}
            {["unknown", "rejected"].includes(state.status) ? (
                <div className="mt-1 flex gap-4">
                    {state.status === "unknown" ? (
                        <button type="button" className={ACTION_CLASS} onClick={onCheck}>결과 확인</button>
                    ) : null}
                    <button type="button" className={ACTION_CLASS} onClick={onRetry}>다시 시도</button>
                </div>
            ) : null}
        </div>
    )
}
