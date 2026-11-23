// 방 설정 화면 배경 그림 (화면 전체 고정 — shell 바닥·광고 줄까지 비침)
// pages/GameSetupPage가 씀, ModeBackdrop과 같은 방식
import { motion } from "framer-motion"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"

export default function SetupBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 bg-black" aria-hidden="true">
      <motion.img
        src={publicAsset(GAME_SETUP_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="h-full w-full object-cover object-center"
        draggable={false}
      />
    </div>
  )
}