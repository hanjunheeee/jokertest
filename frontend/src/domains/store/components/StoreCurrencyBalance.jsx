import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../constants/storeAssets.js"
import {
  STORE_CURRENCY_AMOUNT_CLASS,
  STORE_CURRENCY_DIVIDER_CLASS,
  STORE_CURRENCY_FRAME_CLASS,
  STORE_CURRENCY_ICON_CLASS,
  STORE_CURRENCY_ITEM_CLASS,
  STORE_CURRENCY_POSITION_CLASS,
} from "../constants/storeLayoutStyle.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// F-09 R-IMPL(AC-06 재검토): 이전에는 이 컴포넌트가 서버 값이 오기 전에도
// STORE_CURRENCY_PREVIEW(더미 12,450/320)를 기본값으로 보여줬다 — 실제 브라우저 확인에서
// 실 잔액(8500/1000)이 있는데도 화면에는 끝까지 더미 값만 보였다(부모가 실제 값을 아예
// 넘기지 않았기 때문). 이제 숫자를 절대 기본값으로 삼지 않는다 — status가 "ready"일 때만
// 실제 amount를 보여주고, 그 전(idle/loading)에는 로딩 표시, 실패(error)면 재시도 UI를
// 보여준다("no fake balances").
function StoreCurrencyItem({ icon, amount, label, status, onRetry }) {
  const isError = status === "error"
  const isReady = status === "ready"

  const ariaLabel = isReady
    ? `${label} ${amount}`
    : isError
      ? `${label} 불러오기 실패, 다시 시도하려면 선택하세요`
      : `${label} 불러오는 중`

  return (
    <div className={STORE_CURRENCY_ITEM_CLASS} aria-label={ariaLabel}>
      <PublicAsset src={icon} alt="" className={STORE_CURRENCY_ICON_CLASS} />
      {isError ? (
        <button
          type="button"
          onClick={onRetry}
          className={`${STORE_CURRENCY_AMOUNT_CLASS} cursor-pointer underline decoration-dotted underline-offset-2`}
        >
          재시도
        </button>
      ) : (
        <span className={STORE_CURRENCY_AMOUNT_CLASS} aria-hidden={!isReady}>
          {isReady ? amount.toLocaleString() : "···"}
        </span>
      )}
    </div>
  )
}

/** 상점 우측 상단의 보유 재화(무료·유료) 표시 UI입니다. status가 "ready"일 때만 서버가
 *  돌려준 실제 잔액을 보여주고, 그 전에는 로딩 표시를, 실패하면 재시도 버튼을 보여줍니다
 *  (부모 StorePage가 useEconomyStore의 실 잔액·status·retry를 그대로 전달합니다). */
export default function StoreCurrencyBalance({
  visible = true,
  balanceGold = 0,
  balanceDiamond = 0,
  status = "idle",
  onRetry = () => {},
  className = "",
}) {
  return (
    <motion.div
      className={`${STORE_CURRENCY_POSITION_CLASS} ${className}`}
      initial={{ opacity: 0, y: -8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
      aria-label="보유 재화"
    >
      <div className={STORE_CURRENCY_FRAME_CLASS}>
        <StoreCurrencyItem
          icon={STORE_ASSETS.currencyIcon}
          amount={balanceGold}
          label="무료 재화"
          status={status}
          onRetry={onRetry}
        />
        <div className={STORE_CURRENCY_DIVIDER_CLASS} aria-hidden="true" />
        <StoreCurrencyItem
          icon={STORE_ASSETS.premiumCurrencyIcon}
          amount={balanceDiamond}
          label="유료 재화"
          status={status}
          onRetry={onRetry}
        />
      </div>
    </motion.div>
  )
}
