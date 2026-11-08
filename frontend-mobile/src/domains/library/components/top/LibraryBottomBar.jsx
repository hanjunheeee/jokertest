// 하단 줄: 왼쪽 책갈피 · 오른쪽 뒤로 (마이페이지와 같은 높이)
import { motion } from "framer-motion"
import {
    INNER_REVEAL_ANIMATE,
    INNER_REVEAL_DELAYS,
    INNER_REVEAL_INIT,
    INNER_REVEAL_TRANSITION,
} from "@/domains/library/constants/libraryEntranceMotion.js"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import { BOTTOM_BACK_BTN_CLASS } from "@m/shared/ui/button/BottomBackFixed.jsx"
import BookmarkTabs from "@m/domains/library/components/top/BookmarkTabs.jsx"

// flex 흐름: 책 프레임 아래 전용 줄 (fixed 아님 → 책이 침범하지 않음)
const WRAP_CLASS =
    "relative z-10 flex shrink-0 items-end justify-between gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 land:pb-1"

const BACK_ICON_CLASS = "block h-full w-full select-none object-contain"

export default function LibraryBottomBar({ activeTabId, onTabChange, onBack }) {
    return (
        <div className={WRAP_CLASS}>
            <motion.div
                className="relative z-20 -translate-y-2.5 flex shrink-0 justify-start land:translate-y-0"
                initial={INNER_REVEAL_INIT}
                animate={INNER_REVEAL_ANIMATE}
                transition={{ ...INNER_REVEAL_TRANSITION, delay: INNER_REVEAL_DELAYS.bookmarks }}
            >
                <BookmarkTabs activeTabId={activeTabId} onTabChange={onTabChange} />
            </motion.div>
            <BackButton onClick={onBack} label="로비로 돌아가기" className={BOTTOM_BACK_BTN_CLASS} iconClassName={BACK_ICON_CLASS} />
        </div>
    )
}
