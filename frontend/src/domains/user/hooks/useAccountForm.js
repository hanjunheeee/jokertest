// 파일 역할: useAccountForm.js - React 상태와 부수효과를 묶는 커스텀 훅입니다.
import { useNicknameForm } from "@/domains/user/hooks/useNicknameForm.js"
import { usePasswordForm } from "@/domains/user/hooks/usePasswordForm.js"

// 계정 설정 화면에서 필요한 닉네임 form과 비밀번호 form을 한 번에 묶어주는 훅입니다.
export function useAccountForm() {
    const nicknameForm = useNicknameForm()
    const passwordForm = usePasswordForm()

    return {
        ...nicknameForm,
        ...passwordForm,
    }
}
