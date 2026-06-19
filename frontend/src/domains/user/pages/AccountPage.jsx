/**
 * 계정 관리 페이지.
 *
 * 마이페이지와 동일한 배경을 공유해 두 화면이 연속된 공간처럼 느껴지도록 합니다.
 * 실제 폼 제어는 AccountPanel → useAccountForm으로 위임합니다.
 */
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import AccountPanel from "../components/AccountPanel.jsx"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function AccountPage() {
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

      <AccountPanel />

      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={BG_FADE_TRANSITION}
        onClick={() => navigate("/mypage")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-20`}
      />
    </div>
  )
}
