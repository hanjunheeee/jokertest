import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import StorePanel from "@/domains/store/components/StorePanel.jsx"
import { STORE_ASSETS } from "../constants/storeAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { publicAsset } from "@/shared/utils/publicAsset.js"

const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

export default function StorePage() {
  const navigate = useNavigate()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(STORE_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={UI_REVEAL_TRANSITION}
        className="absolute inset-0"
      >
        <StorePanel />
      </motion.div>

      <motion.button
        type="button"
        aria-label="뒤로 가기"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/lobby")}
        className="absolute bottom-[2.5%] left-[2.5%] z-30 block w-[clamp(4.75rem,7.5vw,6.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:left-[3%]"
      >
        <PublicAsset
          src={STORE_ASSETS.backButton}
          alt=""
          className="block h-auto w-full select-none"
        />
      </motion.button>
    </div>
  )
}
