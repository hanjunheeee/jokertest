// 계정 관리 폼 묶음 훅 (닉네임 폼 + 비밀번호 폼)
// AccountPanel이 씀
import { useNicknameForm } from "@/domains/user/hooks/useNicknameForm.js"
import { usePasswordForm } from "@/domains/user/hooks/usePasswordForm.js"

// 두 폼 값·처리 함수를 한 객체로 합쳐 줌 (이름이 안 겹침)
export function useAccountForm() {
    const nicknameForm = useNicknameForm()
    const passwordForm = usePasswordForm()

    return {
        ...nicknameForm,
        ...passwordForm,
    }
}
