import { motion } from "framer-motion"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import {
  ACCOUNT_PANEL_CONTENT_CLASS,
  ACCOUNT_PANEL_FRAME_CONTENT_CLASS,
  ACCOUNT_PANEL_FRAME_IMG_CLASS,
  ACCOUNT_PANEL_FRAME_INSET,
  ACCOUNT_PANEL_FRAME_SHELL_CLASS,
  ACCOUNT_PANEL_POSITION_CLASS,
  ACCOUNT_PANEL_SCROLL_CLASS,
  ACCOUNT_PANEL_WRAP_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import NicknameSection from "@/domains/user/components/AccountPanel/NicknameSection.jsx"
import PasswordSection from "@/domains/user/components/AccountPanel/PasswordSection.jsx"
import DiscordAccountLink from "@/domains/user/components/DiscordAccountLink.jsx"
import { useAccountForm } from "@/domains/user/hooks/useAccountForm.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

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
    <div className={ACCOUNT_PANEL_POSITION_CLASS}>
      <motion.div
        className={ACCOUNT_PANEL_WRAP_CLASS}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={UI_REVEAL_TRANSITION}
      >
      <div className={ACCOUNT_PANEL_FRAME_SHELL_CLASS}>
        <PublicAsset src={LOGIN_ASSETS.frame} alt="" className={ACCOUNT_PANEL_FRAME_IMG_CLASS} />

        <div
          className={ACCOUNT_PANEL_FRAME_CONTENT_CLASS}
          style={ACCOUNT_PANEL_FRAME_INSET}
        >
          <div className={ACCOUNT_PANEL_SCROLL_CLASS}>
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

              <DiscordAccountLink />
            </div>
          </div>
        </div>
      </div>
      </motion.div>
    </div>
  )
}
