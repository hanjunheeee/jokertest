// 게임 설정 화면 배경 그림 (서서히 밝아짐)
// GameSetupPage가 씀
import { motion } from "framer-motion"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 배경 그림
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
