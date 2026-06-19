/**
 * 마이페이지.
 *
 * 유저 프로필/전적/꾸미기 요소를 MyPageLayout으로 조합하는 라우트 단위 화면입니다.
 */
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import MyPageLayout from "@/domains/user/components/MyPageLayout.jsx"
import { MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

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
