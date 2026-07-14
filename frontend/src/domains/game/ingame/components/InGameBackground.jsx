// 파일 역할: InGameBackground.jsx - 화면을 구성하는 컴포넌트입니다.
import { motion } from "framer-motion"
import { INGAME_ASSETS } from "../constants/ingameAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

/** 인게임 배경 이미지만 담당합니다. */
export default function InGameBackground() {
  return (
    <motion.img
      src={publicAsset(INGAME_ASSETS.bg)}
      alt=""
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BG_FADE_TRANSITION}
      className="absolute inset-0 h-full w-full object-cover object-center"
      draggable={false}
    />
  )
}
