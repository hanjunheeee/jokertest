// 재화 거래 내역 (서버 장부 최근 거래, 서버가 준 순서·값 그대로, 실패면 다시 불러오기)
// feedback/CurrencyFeedback이 인게임 재화 분류일 때 씀, 데스크톱 StoreCurrencyHistory와 같은 판단 (폰이라 목록 높이만 낮춤)
import { currencyHistory, HISTORY_LIMIT, useCurrencyHistory } from "@/domains/store/store/currencyHistory.store.js"
import { formatHistoryAmount, formatHistoryTime, historyCurrencyLabel, historyReasonLabel } from "@/domains/store/utils/currencyView.js"

const BOX_CLASS = "rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]"
const ACTION_CLASS =
    "min-h-11 cursor-pointer border-0 bg-transparent px-1 font-subheading text-sm font-bold text-[#f3dfb4] underline underline-offset-2"

// 불러오는 중·실패·없음·목록 중 하나를 보임
export default function CurrencyHistory() {
    const { status, transactions } = useCurrencyHistory()
    return (
        <section aria-label="재화 거래 내역" data-testid="currency-history" className={BOX_CLASS}>
            <p className="font-bold text-[#f3dfb4]">최근 거래 내역 (최근 {HISTORY_LIMIT}건까지)</p>
            {status === "idle" || status === "loading" ? <p role="status" className="text-[#f3dfb4]">거래 내역을 불러오는 중입니다…</p> : null}
            {status === "error" ? (
                <p role="alert" className="text-[#f3dfb4]">
                    거래 내역을 불러오지 못했습니다.{" "}
                    <button type="button" className={ACTION_CLASS} onClick={() => currencyHistory.load()}>내역 다시 불러오기</button>
                </p>
            ) : null}
            {status === "ready" && transactions.length === 0 ? <p role="status" className="text-[#f3dfb4]">거래 내역이 없습니다.</p> : null}
            {status === "ready" && transactions.length > 0 ? (
                <ul className="max-h-16 overflow-y-auto">
                    {transactions.map((entry) => (
                        <li key={String(entry.id)} data-testid="currency-transaction" className="flex flex-wrap gap-x-2 text-[#f3dfb4]">
                            <time dateTime={entry.createdAt}>{formatHistoryTime(entry.createdAt)}</time>
                            <span>{historyReasonLabel(entry.reason)}</span>
                            <span>{historyCurrencyLabel(entry.currency)} {formatHistoryAmount(entry.amount)}</span>
                            <span>잔액 {entry.balanceAfter.toLocaleString()}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    )
}
