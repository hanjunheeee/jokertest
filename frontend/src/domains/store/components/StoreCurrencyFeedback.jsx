// 재화 상품 안내 줄 (다이아 충전 진행·골드 구매 결과·재화 상품 목록 상태 + 결과 확인·새로고침 버튼, 거래 내역은 따로)
// StorePanel이 씀, 문구·버튼 판단은 utils/currencyView.js (모바일 CurrencyFeedback과 같은 판단)
import { goldFeedbackOf, topupFeedbackOf } from "../utils/currencyView.js"
import StoreCurrencyHistory from "./StoreCurrencyHistory.jsx"

const FEEDBACK_CLASS = "rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]"
const ACTION_CLASS = "mr-4 underline disabled:opacity-50"

// 충전 진행 안내, 지급 대기·결과 모름이면 결과 확인 버튼
function TopupFeedback({ currency, onCheck }) {
  const view = topupFeedbackOf(currency)
  if (!view) return null
  return (
    <div role="status" data-testid="topup-feedback" className={FEEDBACK_CLASS}>
      <p>{view.message}</p>
      {view.notes.map((note) => <p key={note}>{note}</p>)}
      {view.canCheck ? <button type="button" className={ACTION_CLASS} onClick={() => onCheck()}>결과 확인</button> : null}
    </div>
  )
}

// 골드 구매 결과 안내, 결과 확인·다시 시도·새 조건 확인·충전하러 가기 버튼
function GoldFeedback({ state, currencyPanel, onCheck, onRetry, onGoTopup }) {
  const view = goldFeedbackOf(state, currencyPanel.goldProduct)
  if (!view) return null
  return (
    <div role="status" data-testid="gold-feedback" className={FEEDBACK_CLASS}>
      {view.message ? <p>{view.message}</p> : null}
      {view.detail ? <p>{view.detail}</p> : null}
      {view.canCheck ? <button type="button" className={ACTION_CLASS} onClick={onCheck}>결과 확인</button> : null}
      {view.canRetry ? <button type="button" className={ACTION_CLASS} onClick={onRetry}>다시 시도</button> : null}
      {/* 새 목록을 받은 뒤에만 새 조건 확인 */}
      {view.canAcceptPrice ? (
        <button type="button" className={ACTION_CLASS} disabled={!currencyPanel.priceRechecked || !currencyPanel.goldProduct}
          onClick={currencyPanel.acceptGoldPrice}>새 조건 확인</button>
      ) : null}
      {view.canGoTopup ? <button type="button" className={ACTION_CLASS} onClick={onGoTopup}>다이아 충전하러 가기</button> : null}
    </div>
  )
}

// 재화 상품 목록 상태 (새로고침·실패 다시 시도·빈 목록 안내), 요청 중엔 버튼 잠금
function CurrencyListControls({ currency, onReload }) {
  const loading = currency.productsStatus === "loading"
  return (
    <div className={FEEDBACK_CLASS} data-testid="currency-list-controls">
      <button type="button" className={ACTION_CLASS} disabled={loading} onClick={() => onReload()}>상품 목록 새로고침</button>
      {currency.productsStatus === "error" ? (
        <span role="alert">
          상품 목록을 불러오지 못했습니다.{" "}
          <button type="button" className={ACTION_CLASS} disabled={loading} onClick={() => onReload()}>다시 시도</button>
        </span>
      ) : null}
      {currency.productsStatus === "ready" && currency.products.length === 0 ? (
        <span role="status">판매 중인 재화 상품이 없습니다.</span>
      ) : null}
    </div>
  )
}

// 골드 구매 안내·충전 안내·(재화 분류일 때) 목록 상태·거래 내역을 차례로 보임
export default function StoreCurrencyFeedback({ panel, onCheck, onRetry }) {
  const { currencyPanel, purchaseState, activeCategory } = panel
  return (
    <>
      <GoldFeedback state={purchaseState} currencyPanel={currencyPanel} onCheck={onCheck} onRetry={onRetry} onGoTopup={panel.goToDiamondTopup} />
      <TopupFeedback currency={currencyPanel.currency} onCheck={currencyPanel.checkTopup} />
      {activeCategory === currencyPanel.categoryName ? (
        <>
          <CurrencyListControls currency={currencyPanel.currency} onReload={currencyPanel.reloadProducts} />
          <StoreCurrencyHistory />
        </>
      ) : null}
    </>
  )
}
