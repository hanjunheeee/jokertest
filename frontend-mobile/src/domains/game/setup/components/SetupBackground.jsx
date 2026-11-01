// 방 설정 화면 배경 그림 (서서히 밝아짐, 세로 화면에선 가운데를 잘라 씀)
// pages/GameSetupPage가 씀
import { motion } from "framer-motion"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"

// 배경 그림 + 글씨가 읽히게 살짝 어둡게
export default function SetupBackground() {
  return (
    <>
      <motion.img
        src={publicAsset(GAME_SETUP_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-black/35" />
    </>
  )
}
