import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import MyPageLayout from "@/domains/user/components/MyPageLayout.jsx"
import { MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import { MotionBackButton } from "@/shared/ui/BackButton.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }

export default function MyPage() {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-svh w-full overflow-x-hidden overflow-y-auto bg-black">
      <motion.img
        src={publicAsset(MY_PAGE_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <MyPageLayout />

      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={BG_FADE_TRANSITION}
        onClick={() => navigate("/lobby")}
        className="fixed bottom-[2.5%] left-[2.5%] z-20 sm:bottom-[3%] sm:left-[3%]"
      />
    </div>
  )
}
