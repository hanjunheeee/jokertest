// 계정 관리 화면 (/account: 닉네임 · 비밀번호 바꾸기 · Discord 연결)
// app/routes/index.jsx가 씀, Discord 연결 뒤 백엔드가 이 주소로 돌려보냄

import { useNavigate } from "react-router-dom"
import AccountPanel from "@m/domains/user/components/account/AccountPanel.jsx"
import { ACCOUNT_FRAME_WRAP_CLASS } from "@m/domains/user/constants/accountFormLayout.js"
import ScreenFrame from "@m/domains/user/components/mypage/ScreenFrame.jsx"

// 뒤로는 마이페이지로 (데스크톱과 같음)
export default function AccountPage() {
    const navigate = useNavigate()

    return (
        <ScreenFrame title="계정 관리" backAtBottom onBack={() => navigate("/mypage")}>
            <div className={ACCOUNT_FRAME_WRAP_CLASS}>
                <AccountPanel />
            </div>
        </ScreenFrame>
    )
}
