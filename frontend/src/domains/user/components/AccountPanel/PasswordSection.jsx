import AuthInputSlot, { LockIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import {
  ACCOUNT_PANEL_DIVIDER_SECTION_CLASS,
  ACCOUNT_PANEL_FORM_CLASS,
  ACCOUNT_PANEL_FORM_HEADING_CLASS,
  ACCOUNT_PANEL_INPUT_WRAP_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import AccountPanelFormActions from "@/domains/user/components/AccountPanel/AccountPanelFormActions.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 비밀번호 변경 입력칸과 제출 버튼을 묶은 섹션입니다.
// F-07: 이 섹션 아래에 DiscordAccountLink 섹션이 추가되어 더 이상 마지막 섹션이 아니므로,
// 다른 섹션과의 경계를 보여주는 구분선 스타일을 씁니다(AccountPanel.jsx 참고).
export default function PasswordSection({ pwForm, handlePwChange, pwMsg, pwLoading, onSubmit }) {
  // F-16(AC-01): NicknameSection과 같은 계약 — 확인음은 form submit 하나가 소유하고,
  // ConfirmButton(type="submit") 클릭은 generic capture에서 제외된다.
  const handleSubmit = (event) => {
    if (typeof onSubmit !== "function") return
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <section className={ACCOUNT_PANEL_DIVIDER_SECTION_CLASS}>
      <h3 className={ACCOUNT_PANEL_FORM_HEADING_CLASS}>비밀번호 변경</h3>

      <form onSubmit={handleSubmit} className={ACCOUNT_PANEL_FORM_CLASS}>
        {/* 현재 사용 중인 비밀번호를 입력하는 칸입니다. */}
        <div className={ACCOUNT_PANEL_INPUT_WRAP_CLASS}>
          <AuthInputSlot
            name="currentPassword"
            value={pwForm.currentPassword}
            onChange={handlePwChange}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
            passwordToggle
            leadingIcon={<LockIcon />}
          />
        </div>

        {/* 새로 바꿀 비밀번호를 입력하는 칸입니다. */}
        <div className={ACCOUNT_PANEL_INPUT_WRAP_CLASS}>
          <AuthInputSlot
            name="newPassword"
            value={pwForm.newPassword}
            onChange={handlePwChange}
            placeholder="새 비밀번호"
            autoComplete="new-password"
            passwordToggle
            leadingIcon={<LockIcon />}
          />
        </div>

        <AccountPanelFormActions msg={pwMsg} confirmDisabled={pwLoading} />
      </form>
    </section>
  )
}
