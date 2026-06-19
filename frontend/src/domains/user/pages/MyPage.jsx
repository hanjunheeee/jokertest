import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import MyPageLayout from "@/domains/user/components/MyPageLayout.jsx"
import { MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import {
  BACK_BUTTON_PAGE_POSITION_CLASS,
  MotionBackButton,
} from "@/shared/ui/BackButton.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }

export default function MyPage() {
  const navigate = useNavigate()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(MY_PAGE_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="pointer-events-none absolute inset-x-0 bottom-0 top-0 h-full min-h-full w-full object-cover object-bottom"
        draggable={false}
      />

      <MyPageLayout />

      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={BG_FADE_TRANSITION}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-20`}
      />
    </div>
  )
}
