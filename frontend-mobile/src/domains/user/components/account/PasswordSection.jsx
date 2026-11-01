// 비밀번호 바꾸기 칸 (지금·새 비밀번호 + 결과 문구 + 변경 버튼)
// AccountPanel이 씀, 확인·문구는 데스크톱 usePasswordForm 그대로 (보안 검사 손 안 댐)

import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import FormActions from "./FormActions.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { LockIcon } from "@m/shared/ui/input/InputIcons.jsx"
import SectionTitle from "./SectionTitle.jsx"

// 보낼 때 확인 소리 후 폼 처리로 넘김, 보내는 중엔 버튼 잠금
export default function PasswordSection({ pwForm, handlePwChange, pwMsg, pwLoading, onSubmit }) {
    const handleSubmit = (event) => {
        // 처리 함수가 없으면 아무것도 안 함 (데스크톱과 같음)
        if (typeof onSubmit !== "function") return
        dispatchUiSfx("ui-confirm", event)
        onSubmit(event)
    }

    return (
        <section className="flex flex-col gap-2 border-b border-[#8b6a3e]/30 pb-4">
            <SectionTitle>비밀번호 변경</SectionTitle>

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
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
                    placeholder="새 비밀번호"
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
