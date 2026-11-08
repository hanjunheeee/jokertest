// 이메일 바꾸기 칸 (지금 이메일 · 새 이메일+현재 비번 → 번호 받기 → 번호 확인)
// AccountPanel이 씀, 상태는 useEmailChangeForm
import { LockIcon, MailIcon } from "@/shared/ui/InputIcons.jsx"
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import {
  DIVIDER_SECTION_CLASS, INPUT_WRAP_CLASS, PANEL_FORM_CLASS, PANEL_FORM_HEADING_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import AccountPanelFormActions from "@/domains/user/components/AccountPanel/AccountPanelFormActions.jsx"
import { useEmailChangeForm } from "@/domains/user/hooks/member/useEmailChangeForm.js"

const CURRENT_EMAIL_CLASS = "font-subheading app-text-scaled [--app-text-size:clamp(0.62rem,0.85vw,0.72rem)] text-black/70 break-all"

export default function EmailChangeSection({ account, onChanged }) {
  const form = useEmailChangeForm({ account, onChanged })
  const codeStage = form.stage === "codeSent"

  return (
    <section className={DIVIDER_SECTION_CLASS}>
      <h3 className={PANEL_FORM_HEADING_CLASS}>이메일 변경</h3>
      <p className={CURRENT_EMAIL_CLASS}>지금 이메일: {account?.email || "불러오는 중"}</p>

      <form onSubmit={codeStage ? form.verifyCode : form.sendCode} className={PANEL_FORM_CLASS}>
        <div className={INPUT_WRAP_CLASS}>
          <AuthInputSlot
            type="email"
            name="newEmail"
            value={form.newEmail}
            onChange={(e) => form.setNewEmail(e.target.value)}
            placeholder="새 이메일"
            autoComplete="email"
            leadingIcon={<MailIcon />}
          />
        </div>

        {form.usesPassword && !codeStage ? (
          <div className={INPUT_WRAP_CLASS}>
            <AuthInputSlot
              name="emailChangePassword"
              value={form.currentPassword}
              onChange={(e) => form.setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              autoComplete="current-password"
              passwordToggle
              leadingIcon={<LockIcon />}
            />
          </div>
        ) : null}

        {codeStage ? (
          <div className={INPUT_WRAP_CLASS}>
            <AuthInputSlot
              type="text"
              inputMode="numeric"
              name="emailChangeCode"
              value={form.code}
              onChange={(e) => form.setCode(e.target.value)}
              placeholder="새 이메일로 받은 인증번호"
            />
          </div>
        ) : null}

        <AccountPanelFormActions
          msg={form.msg}
          confirmLabel={codeStage ? "확인" : "번호 받기"}
          confirmDisabled={form.loading || !account}
        />
        {codeStage ? (
          <button type="button" className="auth-text-link self-start" onClick={form.sendCode} disabled={form.loading}>
            인증번호 다시 받기
          </button>
        ) : null}
      </form>
    </section>
  )
}
