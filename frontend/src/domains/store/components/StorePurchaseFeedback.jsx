// 구매 결과 안내 줄 (확인 중·완료·거절·결과 모름 + 결과 확인·다시 시도 버튼)
// StorePanel(구매 단추 바로 아래)·StoreBulkPurchaseSummary(일괄구매 합계)가 씀

// 글 줄 글자색: p는 전역 글자색(검정)이 먼저 먹어 칸 글자색을 안 물려받음 → 줄마다 정해야 어두운 바탕에서 보임
const LINE_CLASS = "text-[#f3dfb4]"

// 구매 상태 하나를 받아 안내 문구와 버튼을 보임
export default function StorePurchaseFeedback({ state, onCheck, onRetry }) {
  // 상태별 문구 (막힘·가격 바뀜은 문구 없이 오류 글만)
  const messages = {
    pending: "구매 결과를 확인하고 있습니다…",
    confirmed: "구매가 완료되었습니다.",
    rejected: "구매가 거부되었습니다. 재화는 차감되지 않았습니다.",
    unknown: "구매 결과 확인이 필요합니다.",
  }
  // 빈 상태에 오류도 없으면 안 보임
  if (state.status === "idle" && !state.error) return null
  return (
    <div role="status" className="rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]">
      {/* 막힘·가격 바뀜은 상태 문구가 없어 빈 첫 줄이 안 생기게 있을 때만 */}
      {messages[state.status] ? <p className={LINE_CLASS}>{messages[state.status]}</p> : null}
      {state.error ? <p className={LINE_CLASS}>{state.error}</p> : null}
      {/* 결과 모름이면 결과 확인, 결과 모름·거절이면 다시 시도 */}
      {state.status === "unknown" ? <button type="button" className="mr-4 underline" onClick={onCheck}>결과 확인</button> : null}
      {["unknown", "rejected"].includes(state.status) ? <button type="button" className="underline" onClick={onRetry}>다시 시도</button> : null}
    </div>
  )
}
