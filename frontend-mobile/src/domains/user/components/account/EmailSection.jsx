// 이메일 바꾸기 칸 (지금 이메일 · 새 이메일+현재 비번 → 번호 받기 → 번호 확인)
// AccountPanel이 씀, 상태는 데스크톱 useEmailChangeForm 그대로 (소셜 전용 계정은 비번 칸 없음)
import { useEmailChangeForm } from "@/domains/user/hooks/member/useEmailChangeForm.js"
import FormActions from "./FormActions.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { LockIcon, MailIcon } from "@m/shared/ui/input/InputIcons.jsx"
import {
  ACCOUNT_FORM_TEXT_CLASS,
  ACCOUNT_SECTION_CLASS,
  ACCOUNT_SECTION_FORM_CLASS,
} from "@m/domains/user/constants/accountFormLayout.js"
import SectionTitle from "./SectionTitle.jsx"

const CURRENT_CLASS = `${ACCOUNT_FORM_TEXT_CLASS} break-all font-subheading text-black/70 app-text-scaled [--app-text-size:0.75rem]`
const LINK_CLASS = `${ACCOUNT_FORM_TEXT_CLASS} inline-flex min-h-7 cursor-pointer items-center border-0 bg-transparent px-0 font-subheading font-bold text-amber-800 underline underline-offset-2 app-text-scaled [--app-text-size:0.8rem] disabled:opacity-50`

export default function EmailSection({ account, onChanged }) {
  const form = useEmailChangeForm({ account, onChanged })
  const codeStage = form.stage === "codeSent"

  return (
    <section className={ACCOUNT_SECTION_CLASS}>
      <SectionTitle>이메일 변경</SectionTitle>
      <p className={CURRENT_CLASS}>지금 이메일: {account?.email || "불러오는 중"}</p>

      <form onSubmit={codeStage ? form.verifyCode : form.sendCode} className={ACCOUNT_SECTION_FORM_CLASS}>
        <InputSlot
          type="email"
          name="newEmail"
          value={form.newEmail}
          onChange={(e) => form.setNewEmail(e.target.value)}
          placeholder="새 이메일"
          autoComplete="email"
          look="account"
          leadingIcon={<MailIcon />}
        />
        {form.usesPassword && !codeStage ? (
          <InputSlot
            name="emailChangePassword"
            value={form.currentPassword}
            onChange={(e) => form.setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
            look="account"
            leadingIcon={<LockIcon />}
            passwordToggle
          />
        ) : null}
        {codeStage ? (
          <InputSlot
            type="text"
            inputMode="numeric"
            name="emailChangeCode"
            value={form.code}
            onChange={(e) => form.setCode(e.target.value)}
            placeholder="새 이메일로 받은 인증번호"
            look="account"
          />
        ) : null}
        <FormActions msg={form.msg} confirmLabel={codeStage ? "확인" : "번호 받기"} confirmDisabled={form.loading || !account} />
        {codeStage ? (
          <button type="button" className={LINK_CLASS} onClick={form.sendCode} disabled={form.loading}>인증번호 다시 받기</button>
        ) : null}
      </form>
    </section>
  )
}
