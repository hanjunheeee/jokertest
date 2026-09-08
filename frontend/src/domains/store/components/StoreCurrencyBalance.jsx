import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../constants/storeAssets.js"
import { STORE_CURRENCY_PREVIEW } from "../constants/storeCurrencyPreview.js"
import {
  STORE_CURRENCY_AMOUNT_CLASS,
  STORE_CURRENCY_DIVIDER_CLASS,
  STORE_CURRENCY_FRAME_CLASS,
  STORE_CURRENCY_ICON_CLASS,
  STORE_CURRENCY_ITEM_CLASS,
  STORE_CURRENCY_POSITION_CLASS,
} from "../constants/storeLayoutStyle.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 무료·유료 재화 잔액 한 칸입니다.
function StoreCurrencyItem({ icon, amount, label }) {
  return (
    <div className={STORE_CURRENCY_ITEM_CLASS} aria-label={`${label} ${amount}`}>
      <PublicAsset src={icon} alt="" className={STORE_CURRENCY_ICON_CLASS} />
      <span className={STORE_CURRENCY_AMOUNT_CLASS}>{amount}</span>
    </div>
  )
}

/** 상점 우측 상단의 보유 재화(무료·유료) 표시 UI입니다. */
export default function StoreCurrencyBalance({
  visible = true,
  freeAmount = STORE_CURRENCY_PREVIEW.free,
  premiumAmount = STORE_CURRENCY_PREVIEW.premium,
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
          amount={freeAmount}
          label="무료 재화"
        />
        <div className={STORE_CURRENCY_DIVIDER_CLASS} aria-hidden="true" />
        <StoreCurrencyItem
          icon={STORE_ASSETS.premiumCurrencyIcon}
          amount={premiumAmount}
          label="유료 재화"
        />
      </div>
    </motion.div>
  )
}
