// 계정 관리 화면 (/account: 배경 + 계정 패널 + 뒤로·소리 조절)
// 라우터(app/routes)가 씀
import { useNavigate } from "react-router-dom"
import AccountPanel from "@/domains/user/components/AccountPanel.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import UserPageChrome from "@/domains/user/components/UserPageChrome.jsx"

// 뒤로는 마이페이지로
export default function AccountPage() {
  const navigate = useNavigate()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <UserPageBackground />

      <AccountPanel />

      <UserPageChrome onBack={() => navigate("/mypage")} />
    </div>
  )
}
