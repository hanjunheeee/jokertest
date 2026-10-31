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
