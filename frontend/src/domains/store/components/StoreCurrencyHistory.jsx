// 재화 거래 내역 (서버 장부 최근 거래, 서버가 준 순서·값 그대로, 실패면 다시 불러오기)
// StoreCurrencyFeedback이 인게임 재화 분류일 때 씀, 잔액 합산은 안 함 (현재 잔액은 위 재화 표시가 맡음)
import { currencyHistory, HISTORY_LIMIT, useCurrencyHistory } from "../store/currencyHistory.store.js"
import { formatHistoryAmount, formatHistoryTime, historyCurrencyLabel, historyReasonLabel } from "../utils/currencyView.js"

const BOX_CLASS = "rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]"

// 불러오는 중·실패·없음·목록 중 하나를 보임
export default function StoreCurrencyHistory() {
  const { status, transactions } = useCurrencyHistory()
  return (
    <section aria-label="재화 거래 내역" data-testid="currency-history" className={BOX_CLASS}>
      <p className="font-semibold">최근 거래 내역 (최근 {HISTORY_LIMIT}건까지)</p>
      {status === "idle" || status === "loading" ? <p role="status">거래 내역을 불러오는 중입니다…</p> : null}
      {status === "error" ? (
        <p role="alert">
          거래 내역을 불러오지 못했습니다.{" "}
          <button type="button" className="underline" onClick={() => currencyHistory.load()}>내역 다시 불러오기</button>
        </p>
      ) : null}
      {status === "ready" && transactions.length === 0 ? <p role="status">거래 내역이 없습니다.</p> : null}
      {status === "ready" && transactions.length > 0 ? (
        <ul className="max-h-16 overflow-y-auto">
          {transactions.map((entry) => (
            <li key={String(entry.id)} data-testid="currency-transaction" data-transaction-id={String(entry.id)} className="flex flex-wrap gap-x-3">
              <time dateTime={entry.createdAt}>{formatHistoryTime(entry.createdAt)}</time>
              <span>{historyReasonLabel(entry.reason)}</span>
              <span>{historyCurrencyLabel(entry.currency)}</span>
              <span data-testid="transaction-amount">{formatHistoryAmount(entry.amount)}</span>
              <span data-testid="transaction-balance">잔액 {entry.balanceAfter.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
