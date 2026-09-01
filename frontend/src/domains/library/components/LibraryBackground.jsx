import { motion } from "framer-motion"
import { LIBRARY_ASSETS } from "@/domains/library/constants/libraryAssets.js"
import { LIBRARY_BG_IMAGE_CLASS } from "@/domains/library/constants/libraryLayoutStyle.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

/** 기억의 서고 페이지 뒷배경 */
export default function LibraryBackground() {
  return (
    <motion.img
      src={publicAsset(LIBRARY_ASSETS.bg)}
      alt=""
      className={LIBRARY_BG_IMAGE_CLASS}
      draggable={false}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BG_FADE_TRANSITION}
    />
  )
}
