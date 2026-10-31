import { useNavigate } from "react-router-dom"
import AccountPanel from "@/domains/user/components/AccountPanel.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import UserPageChrome from "@/domains/user/components/UserPageChrome.jsx"

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
