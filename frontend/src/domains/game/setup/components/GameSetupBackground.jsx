import { motion } from "framer-motion"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function GameSetupBackground() {
  return (
    <motion.img
      src={publicAsset(GAME_SETUP_ASSETS.bg)}
      alt=""
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BG_FADE_TRANSITION}
      className="absolute inset-0 h-full w-full object-cover object-center"
      draggable={false}
    />
  )
}
