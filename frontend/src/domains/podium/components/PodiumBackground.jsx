import { motion } from "framer-motion"
import { PODIUM_ASSETS } from "@/domains/podium/constants/podiumAssets.js"
import { PODIUM_BG_IMAGE_CLASS } from "@/domains/podium/constants/podiumLayoutStyle.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

/** 명예의 전당 페이지 뒷배경 */
export default function PodiumBackground() {
  return (
    <motion.img
      src={publicAsset(PODIUM_ASSETS.background)}
      alt=""
      className={PODIUM_BG_IMAGE_CLASS}
      draggable={false}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BG_FADE_TRANSITION}
    />
  )
}
