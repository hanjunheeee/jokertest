// 책 프레임 상단 중앙 목차 그림 (지금 탭 이름)
// book/BookSheet.jsx가 씀
import { motion } from "framer-motion"
import { getLibraryTab } from "@/domains/library/constants/libraryTabs.js"
import {
  INNER_REVEAL_ANIMATE,
  INNER_REVEAL_DELAYS,
  INNER_REVEAL_INIT,
  INNER_REVEAL_TRANSITION,
} from "@/domains/library/constants/libraryEntranceMotion.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { BOOK_TOC_IMG_CLASS, BOOK_TOC_WRAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

export default function BookTableOfContents({ activeTabId }) {
  const activeTab = getLibraryTab(activeTabId)

  return (
    <motion.div
      className={BOOK_TOC_WRAP_CLASS}
      initial={INNER_REVEAL_INIT}
      animate={INNER_REVEAL_ANIMATE}
      transition={{ ...INNER_REVEAL_TRANSITION, delay: INNER_REVEAL_DELAYS.toc }}
    >
      <PublicAsset src={activeTab.tocSrc} alt={activeTab.label} className={BOOK_TOC_IMG_CLASS} />
    </motion.div>
  )
}
