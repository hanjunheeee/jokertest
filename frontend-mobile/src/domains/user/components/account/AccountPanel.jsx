// 계정 관리 패널 (로그인 틀 그림 안에 닉네임 · 이메일 · 비밀번호 · 회원 탈퇴 · Discord 연결)
// AccountPage가 씀, 폼 값은 데스크톱 useAccountForm 그대로

import { motion } from "framer-motion"
import { useAccountForm } from "@/domains/user/hooks/useAccountForm.js"
import { useMyAccount } from "@/domains/user/hooks/member/useMyAccount.js"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import DiscordSection from "./DiscordSection.jsx"
import EmailSection from "./EmailSection.jsx"
import WithdrawSection from "./WithdrawSection.jsx"
import NicknameSection from "./NicknameSection.jsx"
import PasswordSection from "./PasswordSection.jsx"

// 틀 그림(403×625) 9칸 자르기: 위 가면 장식·네 모서리는 그대로, 가운데 양피지만 늘어남
// 값은 그림 px, 그리는 폭은 틀 폭 기준(cqi = 그림 px / 4.03)
const FRAME_STYLE = {
    borderStyle: "solid",
    borderColor: "transparent",
    borderWidth: "1px",
    borderImageSource: `url("${publicAsset(LOGIN_ASSETS.frame)}")`,
    borderImageSlice: "160 50 70 50 fill",
    borderImageWidth: "35.5cqi 11cqi 15.5cqi 11cqi",
    borderImageRepeat: "stretch",
    // 내용은 가면 장식 바로 아래부터 (모바일에서 안쪽 여백·최소 높이 축소)
    padding: "32cqi 9cqi 11cqi",
    minHeight: "174cqi",
}

// 내용이 길면 틀이 세로로 늘어나고 화면이 스크롤 (틀 안 스크롤 없음)
export default function AccountPanel() {
    const form = useAccountForm()
    // 이메일·비번 유무 (이메일 바꾸기·탈퇴 본인 확인 칸 고르기)
    const { account, setEmail } = useMyAccount()

    return (
        <motion.div
            className="w-full [container-type:inline-size]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={UI_REVEAL_TRANSITION}
        >
            <div className="flex w-full flex-col gap-2.5" style={FRAME_STYLE}>
                <NicknameSection
                    nickname={form.nickname}
                    setNickname={form.setNickname}
                    nicknameMsg={form.nicknameMsg}
                    nicknameLoading={form.nicknameLoading}
                    onSubmit={form.handleNicknameSubmit}
                />
                <EmailSection account={account} onChanged={setEmail} />
                <PasswordSection
                    pwForm={form.pwForm}
                    handlePwChange={form.handlePwChange}
                    pwMsg={form.pwMsg}
                    pwLoading={form.pwLoading}
                    onSubmit={form.handlePasswordSubmit}
                />
                <WithdrawSection account={account} />
                <DiscordSection />
            </div>
        </motion.div>
    )
}
