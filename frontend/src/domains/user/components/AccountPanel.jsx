// 계정 관리 패널 (닉네임·비밀번호 바꾸기·Discord 연결, 로그인 틀 그림을 같이 씀)
// AccountPage가 씀
import { motion } from "framer-motion"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import {
  CONTENT_CLASS,
  FRAME_CONTENT_CLASS,
  FRAME_IMG_CLASS,
  FRAME_INSET,
  FRAME_SHELL_CLASS,
  POSITION_CLASS,
  SCROLL_CLASS,
  WRAP_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import NicknameSection from "@/domains/user/components/AccountPanel/NicknameSection.jsx"
import PasswordSection from "@/domains/user/components/AccountPanel/PasswordSection.jsx"
import DiscordAccountLink from "@/domains/user/components/DiscordAccountLink.jsx"
import { useAccountForm } from "@/domains/user/hooks/useAccountForm.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 두 폼 값은 useAccountForm에서 받아 칸마다 넘김
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
    <div className={POSITION_CLASS}>
      <motion.div
        className={WRAP_CLASS}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={UI_REVEAL_TRANSITION}
      >
      <div className={FRAME_SHELL_CLASS}>
        <PublicAsset src={LOGIN_ASSETS.frame} alt="" className={FRAME_IMG_CLASS} />

        <div
          className={FRAME_CONTENT_CLASS}
          style={FRAME_INSET}
        >
          <div className={SCROLL_CLASS}>
            <div className={CONTENT_CLASS}>
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

              <DiscordAccountLink />
            </div>
          </div>
        </div>
      </div>
      </motion.div>
    </div>
  )
}
