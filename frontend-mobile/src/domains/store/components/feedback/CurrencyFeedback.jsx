// 재화 상품 안내 줄 (다이아 충전 진행·골드 구매 결과·재화 상품 목록 상태 + 결과 확인·새로고침 버튼)
// panel/StorePanel이 씀, 문구·버튼 판단은 데스크톱 utils/currencyView.js 그대로 (버튼만 손가락 크기)
import { goldFeedbackOf, topupFeedbackOf } from "@/domains/store/utils/currencyView.js"
import CurrencyHistory from "./CurrencyHistory.jsx"

const BOX_CLASS = "rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]"
const ACTION_CLASS =
    "min-h-11 cursor-pointer border-0 bg-transparent px-1 font-subheading text-sm font-bold text-[#f3dfb4] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

// 버튼 여러 개를 한 줄에 (없으면 줄 안 만듦)
function Actions({ children }) {
    const shown = (Array.isArray(children) ? children : [children]).filter(Boolean)
    if (shown.length === 0) return null
    return <div className="mt-1 flex flex-wrap gap-x-4">{shown}</div>
}

// 충전 진행 안내, 지급 대기·결과 모름이면 결과 확인 버튼
function TopupFeedback({ currency, onCheck }) {
    const view = topupFeedbackOf(currency)
    if (!view) return null
    return (
        <div role="status" data-testid="topup-feedback" className={BOX_CLASS}>
            <p className="text-[#f3dfb4]">{view.message}</p>
            {view.notes.map((note) => <p key={note} className="text-[#f3dfb4]">{note}</p>)}
            <Actions>
                {view.canCheck ? <button key="check" type="button" className={ACTION_CLASS} onClick={() => onCheck()}>결과 확인</button> : null}
            </Actions>
        </div>
    )
}

// 골드 구매 결과 안내, 결과 확인·다시 시도·새 조건 확인·충전하러 가기 버튼
function GoldFeedback({ state, currencyPanel, onCheck, onRetry, onGoTopup }) {
    const view = goldFeedbackOf(state, currencyPanel.goldProduct)
    if (!view) return null
    return (
        <div role="status" data-testid="gold-feedback" className={BOX_CLASS}>
            {view.message ? <p className="text-[#f3dfb4]">{view.message}</p> : null}
            {view.detail ? <p className="text-[#f3dfb4]">{view.detail}</p> : null}
            <Actions>
                {view.canCheck ? <button key="check" type="button" className={ACTION_CLASS} onClick={onCheck}>결과 확인</button> : null}
                {view.canRetry ? <button key="retry" type="button" className={ACTION_CLASS} onClick={onRetry}>다시 시도</button> : null}
                {/* 새 목록을 받은 뒤에만 새 조건 확인 */}
                {view.canAcceptPrice ? (
                    <button key="accept" type="button" className={ACTION_CLASS}
                        disabled={!currencyPanel.priceRechecked || !currencyPanel.goldProduct}
                        onClick={currencyPanel.acceptGoldPrice}>새 조건 확인</button>
                ) : null}
                {view.canGoTopup ? <button key="topup" type="button" className={ACTION_CLASS} onClick={onGoTopup}>다이아 충전하러 가기</button> : null}
            </Actions>
        </div>
    )
}

// 재화 상품 목록 상태 (새로고침·실패 다시 시도·빈 목록 안내), 요청 중엔 버튼 잠금
function CurrencyListControls({ currency, onReload }) {
    const loading = currency.productsStatus === "loading"
    return (
        <div className={`${BOX_CLASS} flex flex-wrap items-center gap-x-3`} data-testid="currency-list-controls">
            <button type="button" className={ACTION_CLASS} disabled={loading} onClick={() => onReload()}>상품 목록 새로고침</button>
            {currency.productsStatus === "error" ? (
                <span role="alert" className="text-[#f3dfb4]">
                    상품 목록을 불러오지 못했습니다.{" "}
                    <button type="button" className={ACTION_CLASS} disabled={loading} onClick={() => onReload()}>다시 시도</button>
                </span>
            ) : null}
            {currency.productsStatus === "ready" && currency.products.length === 0 ? (
                <span role="status" className="text-[#f3dfb4]">판매 중인 재화 상품이 없습니다.</span>
            ) : null}
        </div>
    )
}

// 골드 구매 안내·충전 안내·(재화 분류일 때) 목록 상태·거래 내역을 차례로 보임
export default function CurrencyFeedback({ panel, onCheck, onRetry, className = "" }) {
    const { currencyPanel, purchaseState, activeCategory } = panel
    return (
        <div className={`flex flex-col gap-1 empty:hidden ${className}`}>
            <GoldFeedback state={purchaseState} currencyPanel={currencyPanel} onCheck={onCheck} onRetry={onRetry} onGoTopup={panel.goToDiamondTopup} />
            <TopupFeedback currency={currencyPanel.currency} onCheck={currencyPanel.checkTopup} />
            {activeCategory === currencyPanel.categoryName ? (
                <>
                    <CurrencyListControls currency={currencyPanel.currency} onReload={currencyPanel.reloadProducts} />
                    <CurrencyHistory />
                </>
            ) : null}
        </div>
    )
}
