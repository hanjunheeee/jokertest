// 비밀번호 바꾸기 칸 (지금·새 비밀번호·확인 + 결과 문구 + 변경 버튼), 소셜 전용 계정엔 안내 글만 표시
// AccountPanel이 씀, 확인·문구는 데스크톱 usePasswordForm 그대로
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import FormActions from "./FormActions.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { LockIcon } from "@m/shared/ui/input/InputIcons.jsx"
import {
    ACCOUNT_FORM_TEXT_CLASS,
    ACCOUNT_SECTION_CLASS,
    ACCOUNT_SECTION_FORM_CLASS,
} from "@m/domains/user/constants/accountFormLayout.js"
import SectionTitle from "./SectionTitle.jsx"

const GUIDE_CLASS = `${ACCOUNT_FORM_TEXT_CLASS} font-subheading text-[#2b1d0e] app-text-scaled [--app-text-size:0.75rem]`

// 소셜로만 가입한 계정(hasLocalPassword === false)은 비밀번호 입력 칸 대신 안내 문구를 그림
export default function PasswordSection({ account, pwForm, handlePwChange, pwMsg, pwLoading, onSubmit }) {
    const handleSubmit = (event) => {
        if (typeof onSubmit !== "function") return
        dispatchUiSfx("ui-confirm", event)
        onSubmit(event)
    }

    if (account?.hasLocalPassword === false) {
        return (
            <section className={ACCOUNT_SECTION_CLASS}>
                <SectionTitle>비밀번호 변경</SectionTitle>
                <p className={GUIDE_CLASS}>소셜 로그인 계정은 비밀번호가 없습니다.</p>
            </section>
        )
    }

    return (
        <section className={ACCOUNT_SECTION_CLASS}>
            <SectionTitle>비밀번호 변경</SectionTitle>

            <form onSubmit={handleSubmit} className={ACCOUNT_SECTION_FORM_CLASS}>
                <InputSlot
                    name="currentPassword"
                    value={pwForm.currentPassword}
                    onChange={handlePwChange}
                    placeholder="현재 비밀번호"
                    autoComplete="current-password"
                    look="account"
                    leadingIcon={<LockIcon />}
                    passwordToggle
                />
                <InputSlot
                    name="newPassword"
                    value={pwForm.newPassword}
                    onChange={handlePwChange}
                    placeholder="새 비밀번호 (8~64자, 영문·숫자 포함)"
                    autoComplete="new-password"
                    look="account"
                    leadingIcon={<LockIcon />}
                    passwordToggle
                />
                {/* 확인 칸: 공용 usePasswordForm이 새 비밀번호 확인(newPasswordConfirm)이 같아야 보냄 */}
                <InputSlot
                    name="newPasswordConfirm"
                    value={pwForm.newPasswordConfirm}
                    onChange={handlePwChange}
                    placeholder="새 비밀번호 확인"
                    autoComplete="new-password"
                    look="account"
                    leadingIcon={<LockIcon />}
                    passwordToggle
                />
                <FormActions msg={pwMsg} confirmDisabled={pwLoading} />
            </form>
        </section>
    )
}
