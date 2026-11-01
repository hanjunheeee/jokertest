// 마이페이지 화면 (/mypage: 배경 + 마이페이지 본문 + 뒤로·소리 조절)
// 라우터(app/routes)가 씀
import { useNavigate } from "react-router-dom"
import MyPageLayout from "@/domains/user/components/MyPageLayout.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import UserPageChrome from "@/domains/user/components/UserPageChrome.jsx"

// 뒤로는 로비로
export default function MyPage() {
  const navigate = useNavigate()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <UserPageBackground />

      <MyPageLayout />

      <UserPageChrome onBack={() => navigate("/lobby")} />
    </div>
  )
}
