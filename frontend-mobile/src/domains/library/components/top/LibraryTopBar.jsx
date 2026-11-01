// 서고 위 줄 (뒤로·지금 탭 목차 그림·소리 조절 + 탭 책갈피), 폰 가로에선 한 줄로 합침
// pages/LibraryPage.jsx가 씀, 등장 순서·늦는 시간은 데스크톱 책 등장 상수 (목차 → 책갈피 → 뒤로)
import { motion } from "framer-motion"
import { getLibraryTab } from "@/domains/library/constants/libraryTabs.js"
import {
  BACK_BTN_REVEAL_DELAY,
  INNER_REVEAL_ANIMATE,
  INNER_REVEAL_DELAYS,
  INNER_REVEAL_INIT,
  INNER_REVEAL_TRANSITION,
} from "@/domains/library/constants/libraryEntranceMotion.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"
import BookmarkTabs from "@m/domains/library/components/top/BookmarkTabs.jsx"
import { TAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 책 안쪽 칸과 같은 떠오름, 늦는 시간만 다름
const reveal = (delay) => ({
  initial: INNER_REVEAL_INIT,
  animate: INNER_REVEAL_ANIMATE,
  transition: { ...INNER_REVEAL_TRANSITION, delay },
})

// 뒤로는 로비로 (데스크톱과 같음), 목차 그림이 화면 제목 노릇
export default function LibraryTopBar({ activeTabId, onTabChange, onBack }) {
  const activeTab = getLibraryTab(activeTabId)

  return (
    <header className="relative z-10 flex shrink-0 flex-col gap-1 px-3 pt-2 land:flex-row land:items-center land:gap-3 land:pt-1">
      <div className="flex items-center justify-between gap-2 land:contents">
        {/* 뒤로 가기는 내용 다음에 늦게 보임 (데스크톱 MotionBackButton 값) */}
        <motion.div
          className="shrink-0"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...UI_REVEAL_TRANSITION, delay: BACK_BTN_REVEAL_DELAY }}
        >
          <BackButton onClick={onBack} className={`${TAP_CLASS} w-12 shrink-0`} iconClassName="block h-auto w-full select-none" />
        </motion.div>
        <motion.h1 className="m-0 flex min-w-0 flex-1 justify-center land:flex-none" {...reveal(INNER_REVEAL_DELAYS.toc)}>
          <PublicAsset
            src={activeTab.tocSrc}
            alt={activeTab.label}
            className="block h-10 w-auto max-w-full select-none object-contain"
          />
        </motion.h1>
        <div className="land:order-last land:ml-auto">
          <SoundControl look="library" />
        </div>
      </div>
      <motion.div className="flex justify-center land:justify-start" {...reveal(INNER_REVEAL_DELAYS.bookmarks)}>
        <BookmarkTabs activeTabId={activeTabId} onTabChange={onTabChange} />
      </motion.div>
    </header>
  )
}
