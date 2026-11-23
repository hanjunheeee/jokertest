// 상점 하단 줄 (왼쪽 보유 재화·쿠폰, 오른쪽 뒤로 가기) — 상품 판 아래
// pages/StorePage가 씀
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import CurrencyBalance from "./CurrencyBalance.jsx"
import CouponButton from "./CouponButton.jsx"
import { STORE_SHOW_COUPON_BUTTON } from "@/domains/store/constants/storeLayoutStyle.js"

// 위 줄 그림 버튼 (누르는 칸 44px, 폰 폭에 소리 막대 자리가 없어 음소거 아이콘만)
const ICON_BTN_CLASS = "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
const NO_OUTLINE = { outline: "none" }

// 영상 끝나기 전엔 숨기고 누르기 막음, 등장 움직임은 데스크톱 재화 표시와 같은 값
export default function StoreTopBar({ visible, onBack, balanceGold, balanceDiamond, economyStatus, onRetryEconomy }) {
    return (
        <motion.div
            className="relative z-30 flex shrink-0 items-center gap-1.5 border-t border-[#c4a574]/25 bg-[linear-gradient(#2a1d14,#140c08)] px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 land:pt-1"
            initial={{ opacity: 0, y: 8 }}
            animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={UI_REVEAL_TRANSITION}
            style={{ pointerEvents: visible ? "auto" : "none" }}
        >
            <CurrencyBalance
                balanceGold={balanceGold}
                balanceDiamond={balanceDiamond}
                status={economyStatus}
                onRetry={onRetryEconomy}
            />
            {STORE_SHOW_COUPON_BUTTON ? <CouponButton /> : null}
            <span aria-hidden="true" className="min-w-0 flex-1" />
            <BackButton
                onClick={onBack}
                className={`${ICON_BTN_CLASS} active:scale-95`}
                iconClassName="block h-11 w-11 select-none object-contain"
                style={NO_OUTLINE}
            />
        </motion.div>
    )
}
