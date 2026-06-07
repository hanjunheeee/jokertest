import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import GameSetupPanel from "../components/GameSetupPanel.jsx"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { publicAsset } from "@/shared/utils/publicAsset"

const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

/** prototype 화면 구성-일반UI */
export default function GameSetupPage() {
  const navigate = useNavigate()
  const [uiVisible, setUiVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(GAME_SETUP_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <GameSetupPanel
        visible={uiVisible}
        onCreateGame={() => navigate("/game-matching")}
      />

      <motion.button
        type="button"
        aria-label="멀티플레이 선택으로 돌아가기"
        initial={{ opacity: 0, y: 8 }}
        animate={uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/multiplay")}
        className="absolute bottom-[2.5%] left-[2.5%] z-30 block w-[clamp(4.75rem,7.5vw,6.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:left-[3%]"
        style={{ pointerEvents: uiVisible ? "auto" : "none", outline: "none" }}
      >
        <PublicAsset
          src={GAME_SETUP_ASSETS.backButton}
          alt=""
          className="block h-auto w-full select-none"
        />
      </motion.button>
    </div>
  )
}
