// 회원 탈퇴 칸 (본인 확인 칸 + 탈퇴 버튼 → 되돌릴 수 없다는 확인 창)
// AccountPanel이 비밀번호 변경 칸 아래에 씀, 상태는 데스크톱 useWithdrawForm 그대로
import { WITHDRAW_NOTICE_LINES, useWithdrawForm } from "@/domains/user/hooks/member/useWithdrawForm.js"
import FormActions from "./FormActions.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { LockIcon, MailIcon } from "@m/shared/ui/input/InputIcons.jsx"
import TextDialog from "@m/shared/ui/modal/TextDialog.jsx"
import {
  DIALOG_ACTIONS_CLASS, DIALOG_DANGER_BTN_CLASS, DIALOG_SECONDARY_BTN_CLASS, DIALOG_TEXT_CLASS,
} from "@m/shared/ui/modal/textDialogStyle.js"
import SectionTitle from "./SectionTitle.jsx"

const GUIDE_CLASS = "font-subheading text-black/70 app-text-scaled [--app-text-size:0.75rem]"

export default function WithdrawSection({ account }) {
  const form = useWithdrawForm({ account })

  return (
    <section className="flex flex-col gap-1.5 border-b border-[#8b6a3e]/30 pb-3">
      <SectionTitle>회원 탈퇴</SectionTitle>
      <p className={GUIDE_CLASS}>
        {form.usesPassword ? "본인 확인을 위해 비밀번호를 입력해주세요." : "본인 확인을 위해 계정 이메일을 그대로 입력해주세요."}
      </p>

      <form onSubmit={form.openConfirm} className="flex w-full flex-col gap-1.5">
        {form.usesPassword ? (
          <InputSlot
            name="withdrawPassword"
            value={form.secret}
            onChange={(e) => form.setSecret(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            look="account"
            leadingIcon={<LockIcon />}
            passwordToggle
          />
        ) : (
          <InputSlot
            type="email"
            name="withdrawConfirmEmail"
            value={form.secret}
            onChange={(e) => form.setSecret(e.target.value)}
            placeholder={account?.email || "계정 이메일"}
            look="account"
            leadingIcon={<MailIcon />}
          />
        )}
        <FormActions msg={form.msg} confirmLabel="탈퇴" confirmDisabled={form.loading || !account} />
      </form>

      <TextDialog open={form.confirmOpen} title="정말 탈퇴할까요?" onClose={form.closeConfirm}>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {WITHDRAW_NOTICE_LINES.map((line) => <li key={line} className={DIALOG_TEXT_CLASS}>{line}</li>)}
        </ul>
        <div className={DIALOG_ACTIONS_CLASS}>
          <button type="button" className={DIALOG_SECONDARY_BTN_CLASS} onClick={form.closeConfirm} disabled={form.loading}>취소</button>
          <button type="button" className={DIALOG_DANGER_BTN_CLASS} onClick={form.confirmWithdraw} disabled={form.loading}>
            {form.loading ? "처리 중..." : "탈퇴하기"}
          </button>
        </div>
      </TextDialog>
    </section>
  )
}
