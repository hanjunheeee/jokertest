// 책 위쪽 목차 그림 (지금 탭 이름)
// book/LibraryBookShell.jsx가 씀
import { motion } from "framer-motion"
import { getLibraryTab } from "../../../../domains/library/constants/libraryTabs.js"
import {
  INNER_REVEAL_ANIMATE,
  INNER_REVEAL_DELAYS,
  INNER_REVEAL_INIT,
  INNER_REVEAL_TRANSITION,
} from "../../../../domains/library/constants/libraryEntranceMotion.js"
import {
  LIBRARY_BOOK_TOC_CLASS,
  BOOK_TOC_IMG_CLASS,
} from "../../../../domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset"

// 지금 탭 목차 그림, 책 다음에 떠오름
export default function LibraryTableOfContents({ activeTabId }) {
  const activeTab = getLibraryTab(activeTabId)

  return (
    <motion.div
      className={LIBRARY_BOOK_TOC_CLASS}
      initial={INNER_REVEAL_INIT}
      animate={INNER_REVEAL_ANIMATE}
      transition={{
        ...INNER_REVEAL_TRANSITION,
        delay: INNER_REVEAL_DELAYS.toc,
      }}
    >
      <PublicAsset
        src={activeTab.tocSrc}
        alt={activeTab.label}
        className={BOOK_TOC_IMG_CLASS}
      />
    </motion.div>
  )
}