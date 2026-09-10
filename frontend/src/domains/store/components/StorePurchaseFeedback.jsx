export default function StorePurchaseFeedback({ state, onCheck, onRetry }) {
  const messages = {
    pending: "구매 결과를 확인하고 있습니다…",
    confirmed: "구매가 완료되었습니다.",
    rejected: "구매가 거부되었습니다. 재화는 차감되지 않았습니다.",
    unknown: "구매 결과 확인이 필요합니다.",
  }
  if (state.status === "idle" && !state.error) return null
  return (
    <div role="status" className="rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]">
      <p>{messages[state.status]}</p>
      {state.error ? <p>{state.error}</p> : null}
      {state.status === "unknown" ? <button type="button" className="mr-4 underline" onClick={onCheck}>결과 확인</button> : null}
      {["unknown", "rejected"].includes(state.status) ? <button type="button" className="underline" onClick={onRetry}>다시 시도</button> : null}
    </div>
  )
}
