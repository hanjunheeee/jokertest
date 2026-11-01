// 상점 위 줄 (왼쪽 뒤로 가기, 오른쪽 보유 재화·배경음)
// pages/StorePage가 씀, 데스크톱 왼쪽 아래 뒤로 가기·오른쪽 위 재화·오른쪽 아래 소리를 한 줄로 모음
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import MuteToggle from "@m/shared/ui/sound/MuteToggle.jsx"
import CurrencyBalance from "./CurrencyBalance.jsx"

// 위 줄 그림 버튼 (누르는 칸 44px, 폰 폭에 소리 막대 자리가 없어 음소거 아이콘만)
const ICON_BTN_CLASS = "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
const NO_OUTLINE = { outline: "none" }

// 영상 끝나기 전엔 숨기고 누르기 막음, 등장 움직임은 데스크톱 재화 표시와 같은 값
export default function StoreTopBar({ visible, onBack, balanceGold, balanceDiamond, economyStatus, onRetryEconomy }) {
    return (
        <motion.div
            className="relative z-30 flex shrink-0 items-center gap-1.5 px-2 pt-1 land:pt-0.5"
            initial={{ opacity: 0, y: -8 }}
            animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
            transition={UI_REVEAL_TRANSITION}
            style={{ pointerEvents: visible ? "auto" : "none" }}
        >
            <BackButton
                onClick={onBack}
                className={`${ICON_BTN_CLASS} active:scale-95`}
                iconClassName="block h-11 w-11 select-none object-contain"
                style={NO_OUTLINE}
            />
            <span aria-hidden="true" className="min-w-0 flex-1" />
            <CurrencyBalance
                balanceGold={balanceGold}
                balanceDiamond={balanceDiamond}
                status={economyStatus}
                onRetry={onRetryEconomy}
            />
            <MuteToggle className={`${ICON_BTN_CLASS} disabled:opacity-50`} iconClassName="block h-10 w-10 select-none object-contain" style={NO_OUTLINE} />
        </motion.div>
    )
}
