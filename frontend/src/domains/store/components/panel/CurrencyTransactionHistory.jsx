import { currencyHistory, HISTORY_LIMIT, useCurrencyHistory } from "../../store/currencyHistory.store.js"

const REASON_LABELS = { DIAMOND_TOPUP: "다이아 충전", GOLD_PURCHASE: "골드 구매" }
const CURRENCY_LABELS = { DIAMOND: "다이아", GOLD: "골드" }
const boxClass = "rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]"

const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR")
}
const formatAmount = (amount) => (amount > 0 ? `+${amount.toLocaleString()}` : amount.toLocaleString())

export default function CurrencyTransactionHistory() {
  const { status, transactions } = useCurrencyHistory()
  return (
    <section aria-label="재화 거래 내역" data-testid="currency-history" className={boxClass}>
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
        <ul className="max-h-32 overflow-y-auto">
          {transactions.map((entry) => (
            <li
              key={String(entry.id)}
              data-testid="currency-transaction"
              data-transaction-id={String(entry.id)}
              className="flex flex-wrap gap-x-3"
            >
              <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
              <span>{REASON_LABELS[entry.reason] ?? entry.reason}</span>
              <span>{CURRENCY_LABELS[entry.currency] ?? entry.currency}</span>
              <span data-testid="transaction-amount">{formatAmount(entry.amount)}</span>
              <span data-testid="transaction-balance">잔액 {entry.balanceAfter.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
