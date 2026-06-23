import { motion } from "framer-motion"
import InGamePlayerBoard from "../components/board/InGamePlayerBoard.jsx"
import InGameChatPanel from "../components/chat/InGameChatPanel.jsx"
import { INGAME_ASSETS } from "../constants/ingameAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function InGamePage() {
  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(INGAME_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <InGamePlayerBoard />
      <InGameChatPanel />
    </div>
  )
}
