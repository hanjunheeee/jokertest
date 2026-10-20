import { useNavigate } from "react-router-dom"
import MyPageLayout from "@/domains/user/components/MyPageLayout.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import UserPageChrome from "@/domains/user/components/UserPageChrome.jsx"

export default function MyPage() {
  const navigate = useNavigate()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* 마이페이지 전체 배경 이미지입니다. */}
      <UserPageBackground />

      {/* 마이페이지 실제 내용 영역입니다. */}
      <MyPageLayout />

      {/* 로비로 돌아가는 뒤로가기 버튼입니다. */}
      <UserPageChrome onBack={() => navigate("/lobby")} />
    </div>
  )
}
