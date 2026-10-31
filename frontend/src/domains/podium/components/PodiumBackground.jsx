import { motion } from "framer-motion"
import { PODIUM_ASSETS } from "../constants/podiumAssets.js"
import { PODIUM_BG_IMAGE_CLASS } from "../constants/podiumLayoutStyle.js"
import { BG_FADE_TRANSITION } from "../../../shared/constants/pageTransitions.js"
import { publicAsset } from "../../../shared/utils/publicAsset.js"

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
