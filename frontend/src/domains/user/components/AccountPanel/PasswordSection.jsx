import AuthInputSlot, { LockIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import {
  ACCOUNT_PANEL_ACTION_ROW_CLASS,
  ACCOUNT_PANEL_FORM_CLASS,
  ACCOUNT_PANEL_HEADING_CLASS,
  ACCOUNT_PANEL_SECTION_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import ConfirmButton from "@/domains/user/components/AccountPanel/ConfirmButton.jsx"
import FeedbackMsg from "@/domains/user/components/AccountPanel/FeedbackMsg.jsx"

// 비밀번호 변경 입력칸과 제출 버튼을 묶은 섹션입니다.
export default function PasswordSection({ pwForm, handlePwChange, pwMsg, pwLoading, onSubmit }) {
  return (
    <section className={ACCOUNT_PANEL_SECTION_CLASS}>
      <h3 className={ACCOUNT_PANEL_HEADING_CLASS}>비밀번호 변경</h3>

      <form onSubmit={onSubmit} className={ACCOUNT_PANEL_FORM_CLASS}>
        {/* 현재 사용 중인 비밀번호를 입력하는 칸입니다. */}
        <AuthInputSlot
          name="currentPassword"
          value={pwForm.currentPassword}
          onChange={handlePwChange}
          placeholder="현재 비밀번호"
          autoComplete="current-password"
          passwordToggle
          leadingIcon={<LockIcon />}
        />

        {/* 새로 바꿀 비밀번호를 입력하는 칸입니다. */}
        <AuthInputSlot
          name="newPassword"
          value={pwForm.newPassword}
          onChange={handlePwChange}
          placeholder="새 비밀번호"
          autoComplete="new-password"
          passwordToggle
          leadingIcon={<LockIcon />}
        />

        <div className={ACCOUNT_PANEL_ACTION_ROW_CLASS}>
          {/* 변경 성공/실패 메시지입니다. */}
          <FeedbackMsg msg={pwMsg} />

          {/* 요청 중에는 중복 클릭을 막기 위해 버튼을 비활성화합니다. */}
          <ConfirmButton label="변경" disabled={pwLoading} />
        </div>
      </form>
    </section>
  )
}
