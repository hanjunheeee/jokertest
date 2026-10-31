import { useState } from "react"
import { updatePasswordApi } from "@/domains/user/api/user.api"

export function usePasswordForm() {
    const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: ""})

    const [pwMsg, setPwMsg] = useState(null)

    const [pwLoading, setPwLoading] = useState(false)

    const handlePwChange = (e) => {
        const { name, value } = e.target
        setPwForm((prev) => ({...prev, [name]: value}))
    }

    const handlePasswordSubmit = async (e) => {
        e.preventDefault()

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
