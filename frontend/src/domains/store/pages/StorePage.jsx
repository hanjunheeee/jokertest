// 파일 역할: StorePage.jsx - 라우터에서 렌더링되는 페이지입니다.
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import StorePanel from "@/domains/store/components/StorePanel.jsx"
import { STORE_ASSETS } from "../constants/storeAssets.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { BG_FADE_TRANSITION, UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 로비에서 진입하는 상점 화면입니다.
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

      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
      />
    </div>
  )
}
