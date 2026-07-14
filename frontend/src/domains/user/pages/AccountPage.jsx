import { useNavigate } from "react-router-dom"
import AccountPanel from "@/domains/user/components/AccountPanel.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function AccountPage() {
  const navigate = useNavigate()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* 계정 관리 페이지 전체 배경 이미지입니다. */}
      <UserPageBackground />

      {/* 닉네임/비밀번호를 변경하는 계정 관리 패널입니다. */}
      <AccountPanel />

      {/* 마이페이지로 돌아가는 뒤로가기 버튼입니다. */}
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
