import { motion } from "framer-motion"
import {
  ACCOUNT_PANEL_BOX_CLASS,
  ACCOUNT_PANEL_CONTENT_CLASS,
  ACCOUNT_PANEL_TITLE_CLASS,
  ACCOUNT_PANEL_WRAP_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import NicknameSection from "@/domains/user/components/AccountPanel/NicknameSection.jsx"
import PasswordSection from "@/domains/user/components/AccountPanel/PasswordSection.jsx"
import { useAccountForm } from "@/domains/user/hooks/useAccountForm.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 계정 관리 패널의 전체 조립 컴포넌트입니다.
// 입력 상태와 저장 로직은 useAccountForm이 담당하고, 이 파일은 화면 배치만 담당합니다.
export default function AccountPanel() {
  const {
    nickname,
    setNickname,
    nicknameMsg,
    nicknameLoading,
    handleNicknameSubmit,
    pwForm,
    handlePwChange,
    pwMsg,
    pwLoading,
    handlePasswordSubmit,
  } = useAccountForm()

  return (
    <motion.div
      className={ACCOUNT_PANEL_WRAP_CLASS}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={UI_REVEAL_TRANSITION}
    >
      <div className={ACCOUNT_PANEL_BOX_CLASS}>
        <h2 className={ACCOUNT_PANEL_TITLE_CLASS}>계정 관리</h2>

        <div className={ACCOUNT_PANEL_CONTENT_CLASS}>
          <NicknameSection
            nickname={nickname}
            setNickname={setNickname}
            nicknameMsg={nicknameMsg}
            nicknameLoading={nicknameLoading}
            onSubmit={handleNicknameSubmit}
          />

          <PasswordSection
            pwForm={pwForm}
            handlePwChange={handlePwChange}
            pwMsg={pwMsg}
            pwLoading={pwLoading}
            onSubmit={handlePasswordSubmit}
          />
        </div>
      </div>
    </motion.div>
  )
}
