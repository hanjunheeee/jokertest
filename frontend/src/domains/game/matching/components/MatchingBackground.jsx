// 대기방 배경 그림
// GameMatchingPage가 씀, 화면 드러날 때 서서히 밝아짐
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 배경 그림 (visible 따라 투명도 바뀜)
export default function MatchingBackground({ visible }) {
  return (
    <motion.img
      src={publicAsset(GAME_MATCHING_ASSETS.bg)}
      alt=""
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={BG_FADE_TRANSITION}
      className="absolute inset-0 h-full w-full object-cover object-center"
      draggable={false}
    />
  )
}
