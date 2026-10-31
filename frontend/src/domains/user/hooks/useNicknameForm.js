import { useState } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { useUserProfileStore } from "@/domains/user/store/user.store"
import { updateNicknameApi } from "@/domains/user/api/user.api"

export function useNicknameForm() {
    const storeUser = useAuthStore((s) => s.user)

    const storeLogin = useAuthStore((s) => s.login)

    const patchProfile = useUserProfileStore((s) => s.patchProfile)

    const [nickname, setNickname] = useState(storeUser?.nickname ?? "")

    const [nicknameMsg, setNicknameMsg] = useState(null)

    const [nicknameLoading, setNicknameLoading] = useState(false)

    const handleNicknameSubmit = async (e) => {
        e.preventDefault()

        if(!nickname.trim()) return

        setNicknameLoading(true)
        setNicknameMsg(null)
        try {
            await updateNicknameApi(nickname.trim())

            storeLogin({...storeUser, nickname: nickname.trim()})
            patchProfile({ nickname: nickname.trim() })
            setNicknameMsg({type: "success", text: "닉네임이 변경되었습니다."})
        } catch (err) {
            setNicknameMsg({type: "error", text: err.message ?? "변경에 실패했습니다."})
        } finally {
            setNicknameLoading(false)
        }
    }

    return {
        nickname,
        setNickname,
        nicknameMsg,
        nicknameLoading,
        handleNicknameSubmit,
    }
}
