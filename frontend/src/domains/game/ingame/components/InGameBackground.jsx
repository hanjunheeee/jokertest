/**
 * 인게임 배경 — DAY/기타는 낮, NIGHT는 밤 이미지로 crossfade.
 */
import { motion } from "framer-motion"
import { INGAME_ASSETS } from "../constants/ingameAssets.js"
import { useInGameStore } from "../store/ingameStore.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

const INGAME_BG_IMAGE_CLASS = "absolute inset-0 h-full w-full object-cover object-center"

export default function InGameBackground() {
  const phase = useInGameStore((s) => s.state?.phase)
  const isNight = phase === "NIGHT"

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <motion.img
        src={publicAsset(INGAME_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: isNight ? 0 : 1 }}
        transition={BG_FADE_TRANSITION}
        className={INGAME_BG_IMAGE_CLASS}
        draggable={false}
      />
      <motion.img
        src={publicAsset(INGAME_ASSETS.bgNight)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: isNight ? 1 : 0 }}
        transition={BG_FADE_TRANSITION}
        className={INGAME_BG_IMAGE_CLASS}
        draggable={false}
      />
    </div>
  )
}
