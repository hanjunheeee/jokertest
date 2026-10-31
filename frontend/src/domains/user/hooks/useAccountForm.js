import { useNicknameForm } from "@/domains/user/hooks/useNicknameForm.js"
import { usePasswordForm } from "@/domains/user/hooks/usePasswordForm.js"

export function useAccountForm() {
    const nicknameForm = useNicknameForm()
    const passwordForm = usePasswordForm()

    return {
        ...nicknameForm,
        ...passwordForm,
    }
}
