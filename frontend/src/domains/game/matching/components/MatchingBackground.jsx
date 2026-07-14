// 파일 역할: MatchingBackground.jsx - 화면을 구성하는 컴포넌트입니다.
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

/** 매칭 대기 화면의 배경 이미지만 담당합니다. */
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
