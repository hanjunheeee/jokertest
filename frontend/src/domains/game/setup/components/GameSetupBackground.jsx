// 파일 역할: GameSetupBackground.jsx - 화면을 구성하는 컴포넌트입니다.
import { motion } from "framer-motion"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

/** 게임 만들기 화면의 배경 이미지만 담당합니다. */
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
