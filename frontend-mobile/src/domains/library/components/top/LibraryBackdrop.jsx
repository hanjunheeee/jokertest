// 서고 뒷배경 그림 (데스크톱과 같은 그림·같은 서서히 보임, 덮개 없음)
// pages/LibraryPage.jsx가 씀
import { motion } from "framer-motion"
import { LIBRARY_ASSETS } from "@/domains/library/constants/libraryAssets.js"
import { LIBRARY_BG_IMAGE_CLASS } from "@/domains/library/constants/libraryLayoutStyle.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const MotionAsset = motion.create(PublicAsset)

// 들어올 때 서서히 보임, 누르기는 안 받음
export default function LibraryBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <MotionAsset
        src={LIBRARY_ASSETS.bg}
        alt=""
        className={LIBRARY_BG_IMAGE_CLASS}
        draggable={false}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
      />
    </div>
  )
}
