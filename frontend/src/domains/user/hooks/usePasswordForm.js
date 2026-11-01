// 비밀번호 바꾸기 폼 훅 (입력·보내기·결과 문구)
// 계정 관리 폼 훅(useAccountForm)이 씀
import { useState } from "react"
import { updatePasswordApi } from "@/domains/user/api/user.api"

// 지금·새 비밀번호 입력과 결과 문구
export function usePasswordForm() {
    const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: ""})

    const [pwMsg, setPwMsg] = useState(null)

    const [pwLoading, setPwLoading] = useState(false)

    // 입력칸 name으로 값 넣기
    const handlePwChange = (e) => {
        const { name, value } = e.target
        setPwForm((prev) => ({...prev, [name]: value}))
    }

    // 보내기: 성공하면 입력칸 비움
    const handlePasswordSubmit = async (e) => {
        e.preventDefault()

        // 두 칸 중 하나라도 비면 안 보냄
        if (!pwForm.currentPassword || !pwForm.newPassword) return

        setPwLoading(true)
        setPwMsg(null)
        try {
            await updatePasswordApi(pwForm)

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
