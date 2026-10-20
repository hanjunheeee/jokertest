import { useNavigate } from "react-router-dom"
import AccountPanel from "@/domains/user/components/AccountPanel.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import UserPageChrome from "@/domains/user/components/UserPageChrome.jsx"

export default function AccountPage() {
  const navigate = useNavigate()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* 계정 관리 페이지 전체 배경 이미지입니다. */}
      <UserPageBackground />

      {/* 닉네임/비밀번호를 변경하는 계정 관리 패널입니다. */}
      <AccountPanel />

      {/* 마이페이지로 돌아가는 뒤로가기 버튼입니다. */}
      <UserPageChrome onBack={() => navigate("/mypage")} />
    </div>
  )
}
