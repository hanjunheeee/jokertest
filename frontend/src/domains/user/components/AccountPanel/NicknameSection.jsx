import AuthInputSlot from "@/domains/auth/components/AuthInputSlot.jsx"
import {
  ACCOUNT_PANEL_ACTION_ROW_CLASS,
  ACCOUNT_PANEL_DIVIDER_SECTION_CLASS,
  ACCOUNT_PANEL_FORM_CLASS,
  ACCOUNT_PANEL_HEADING_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import ConfirmButton from "@/domains/user/components/AccountPanel/ConfirmButton.jsx"
import FeedbackMsg from "@/domains/user/components/AccountPanel/FeedbackMsg.jsx"
import UserIcon from "@/domains/user/components/AccountPanel/UserIcon.jsx"

// 닉네임 변경 입력칸과 제출 버튼을 묶은 섹션입니다.
export default function NicknameSection({ nickname, setNickname, nicknameMsg, nicknameLoading, onSubmit }) {
  return (
    <section className={ACCOUNT_PANEL_DIVIDER_SECTION_CLASS}>
      <h3 className={ACCOUNT_PANEL_HEADING_CLASS}>닉네임 변경</h3>

      <form onSubmit={onSubmit} className={ACCOUNT_PANEL_FORM_CLASS}>
        {/* 새 닉네임을 입력하는 칸입니다. */}
        <AuthInputSlot
          name="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="새 닉네임"
          autoComplete="off"
          leadingIcon={<UserIcon />}
        />

        <div className={ACCOUNT_PANEL_ACTION_ROW_CLASS}>
          {/* 변경 성공/실패 메시지입니다. */}
          <FeedbackMsg msg={nicknameMsg} />

          {/* 요청 중에는 중복 클릭을 막기 위해 버튼을 비활성화합니다. */}
          <ConfirmButton label="변경" disabled={nicknameLoading} />
        </div>
      </form>
    </section>
  )
}
