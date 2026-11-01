// 닉네임 바꾸기 폼 훅 (입력·보내기·결과 문구)
// 계정 관리 폼 훅(useAccountForm)·시험이 씀
import { useState } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { useUserProfileStore } from "@/domains/user/store/user.store"
import { updateNicknameApi } from "@/domains/user/api/user.api"

// 처음 값은 로그인 정보의 닉네임
export function useNicknameForm() {
    const storeUser = useAuthStore((s) => s.user)

    const storeLogin = useAuthStore((s) => s.login)

    const patchProfile = useUserProfileStore((s) => s.patchProfile)

    const [nickname, setNickname] = useState(storeUser?.nickname ?? "")

    const [nicknameMsg, setNicknameMsg] = useState(null)

    const [nicknameLoading, setNicknameLoading] = useState(false)

    // 보내기: 성공하면 로그인 정보·프로필 스토어 닉네임도 같이 바꿈
    const handleNicknameSubmit = async (e) => {
        e.preventDefault()

        // 공백뿐이면 안 보냄
        if(!nickname.trim()) return

        setNicknameLoading(true)
        setNicknameMsg(null)
        try {
            await updateNicknameApi(nickname.trim())

            storeLogin({...storeUser, nickname: nickname.trim()})
            patchProfile({ nickname: nickname.trim() })
            setNicknameMsg({type: "success", text: "닉네임이 변경되었습니다."})
        } catch (err) {
            // 실패면 서버 문구, 없으면 기본 문구
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
