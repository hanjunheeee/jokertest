import { useState } from "react"
import { updatePasswordApi } from "@/domains/user/api/user.api"

// 계정 설정 화면의 비밀번호 변경 form만 담당하는 훅입니다.
export function usePasswordForm() {
    // 비밀번호 변경 입력값입니다.
    // currentPassword는 현재 비밀번호, newPassword는 새 비밀번호입니다.
    const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: ""})

    // 비밀번호 변경 성공/실패 메시지입니다.
    const [pwMsg, setPwMsg] = useState(null)

    // 비밀번호 변경 요청이 진행 중인지 표시합니다.
    const [pwLoading, setPwLoading] = useState(false)

    // currentPassword/newPassword 입력칸 변경을 pwForm에 반영합니다.
    const handlePwChange = (e) => {
        const { name, value } = e.target
        setPwForm((prev) => ({...prev, [name]: value}))
    }

    // 비밀번호 변경 form을 제출할 때 실행됩니다.
    const handlePasswordSubmit = async (e) => {
        e.preventDefault()

        // 현재 비밀번호와 새 비밀번호가 모두 있어야 요청을 보냅니다.
        if (!pwForm.currentPassword || !pwForm.newPassword) return

        setPwLoading(true)
        setPwMsg(null)
        try {
            await updatePasswordApi(pwForm)

            // 변경이 끝나면 비밀번호 입력칸을 비웁니다.
            setPwForm({ currentPassword: "", newPassword: ""})
            setPwMsg({ type: "success", text: "비밀번호가 변경되었습니다."})
        } catch (err) {
            setPwMsg({ type: "error", text: err.message ?? "변경에 실패했습니다." })
        } finally {
            setPwLoading(false)
        }
    }

    return {
        pwForm,
        handlePwChange,
        pwMsg,
        pwLoading,
        handlePasswordSubmit,
    }
}
