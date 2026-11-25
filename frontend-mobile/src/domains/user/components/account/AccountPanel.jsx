// 계정 관리 패널 (로그인 틀 그림 안에 닉네임 · 이메일 · 비밀번호 · 회원 탈퇴 · Discord 연결)
// AccountPage가 씀, 폼 값은 데스크톱 useAccountForm 그대로

import { motion } from "framer-motion"
import { useAccountForm } from "@/domains/user/hooks/useAccountForm.js"
import { useMyAccount } from "@/domains/user/hooks/member/useMyAccount.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import {
    ACCOUNT_PANEL_STACK_CLASS,
    ACCOUNT_PARCHMENT_EXTRA_BOTTOM_CLASS,
    ACCOUNT_PARCHMENT_FRAME_BOX_CLASS,
    getAccountParchmentFrameStyle,
} from "@m/domains/user/constants/accountFormLayout.js"
import DiscordSection from "./DiscordSection.jsx"
import EmailSection from "./EmailSection.jsx"
import WithdrawSection from "./WithdrawSection.jsx"
import NicknameSection from "./NicknameSection.jsx"
import PasswordSection from "./PasswordSection.jsx"

const FRAME_STYLE = getAccountParchmentFrameStyle()
export default function AccountPanel() {
    const form = useAccountForm()
    const { account, setEmail } = useMyAccount()

    return (
        <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={UI_REVEAL_TRANSITION}
        >
            <div className={`${ACCOUNT_PANEL_STACK_CLASS} ${ACCOUNT_PARCHMENT_FRAME_BOX_CLASS}`} style={FRAME_STYLE}>
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
                <div className={ACCOUNT_PARCHMENT_EXTRA_BOTTOM_CLASS} aria-hidden="true" />
            </div>
        </motion.div>
    )
}
