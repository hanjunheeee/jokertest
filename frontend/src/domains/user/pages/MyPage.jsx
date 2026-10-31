import { useNavigate } from "react-router-dom"
import MyPageLayout from "@/domains/user/components/MyPageLayout.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import UserPageChrome from "@/domains/user/components/UserPageChrome.jsx"

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
