// 회원 탈퇴 칸 (본인 확인 칸 + 탈퇴 버튼 → 되돌릴 수 없다는 확인 창)
// AccountPanel이 비밀번호 변경 칸 아래에 씀, 상태는 useWithdrawForm
import { LockIcon, MailIcon } from "@/shared/ui/InputIcons.jsx"
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import CenterDialog from "@/shared/ui/dialog/CenterDialog.jsx"
import {
  DIVIDER_SECTION_CLASS, INPUT_WRAP_CLASS, PANEL_FORM_CLASS, PANEL_FORM_HEADING_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import AccountPanelFormActions from "@/domains/user/components/AccountPanel/AccountPanelFormActions.jsx"
import {
  DIALOG_ACTIONS_CLASS, DIALOG_DANGER_BTN_CLASS, DIALOG_SECONDARY_BTN_CLASS, DIALOG_TEXT_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"
import { WITHDRAW_NOTICE_LINES, useWithdrawForm } from "@/domains/user/hooks/member/useWithdrawForm.js"

const GUIDE_CLASS = "font-subheading app-text-scaled [--app-text-size:clamp(0.6rem,0.8vw,0.7rem)] text-black/70"

export default function WithdrawSection({ account }) {
  const form = useWithdrawForm({ account })

  return (
    <section className={DIVIDER_SECTION_CLASS}>
      <h3 className={PANEL_FORM_HEADING_CLASS}>회원 탈퇴</h3>
      <p className={GUIDE_CLASS}>
        {form.usesPassword ? "본인 확인을 위해 비밀번호를 입력해주세요." : "본인 확인을 위해 계정 이메일을 그대로 입력해주세요."}
      </p>

      <form onSubmit={form.openConfirm} className={PANEL_FORM_CLASS}>
        <div className={INPUT_WRAP_CLASS}>
          {form.usesPassword ? (
            <AuthInputSlot
              name="withdrawPassword"
              value={form.secret}
              onChange={(e) => form.setSecret(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              passwordToggle
              leadingIcon={<LockIcon />}
            />
          ) : (
            <AuthInputSlot
              type="email"
              name="withdrawConfirmEmail"
              value={form.secret}
              onChange={(e) => form.setSecret(e.target.value)}
              placeholder={account?.email || "계정 이메일"}
              leadingIcon={<MailIcon />}
            />
          )}
        </div>
        <AccountPanelFormActions msg={form.msg} confirmLabel="탈퇴" confirmDisabled={form.loading || !account} />
      </form>

      <CenterDialog open={form.confirmOpen} title="정말 탈퇴할까요?" onClose={form.closeConfirm} labelledBy="withdraw-confirm-title">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {WITHDRAW_NOTICE_LINES.map((line) => <li key={line} className={DIALOG_TEXT_CLASS}>{line}</li>)}
        </ul>
        <div className={DIALOG_ACTIONS_CLASS}>
          <button type="button" className={DIALOG_SECONDARY_BTN_CLASS} onClick={form.closeConfirm} disabled={form.loading}>취소</button>
          <button type="button" className={DIALOG_DANGER_BTN_CLASS} onClick={form.confirmWithdraw} disabled={form.loading}>
            {form.loading ? "처리 중..." : "탈퇴하기"}
          </button>
        </div>
      </CenterDialog>
    </section>
  )
}
