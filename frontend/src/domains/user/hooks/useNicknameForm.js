import { useState } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { useUserProfileStore } from "@/domains/user/store/user.store"
import { updateNicknameApi } from "@/domains/user/api/user.api"

// 계정 설정 화면의 닉네임 변경 form만 담당하는 훅입니다.
export function useNicknameForm() {
    // auth store에 저장된 현재 사용자 정보입니다.
    const storeUser = useAuthStore((s) => s.user)

    // 사용자 정보가 바뀌었을 때 auth store를 다시 갱신하는 함수입니다.
    const storeLogin = useAuthStore((s) => s.login)

    // useMyProfile이 공유하는 프로필 캐시도 함께 갱신해야, 재요청 없이도
    // 로비/마이페이지 배너에 새 닉네임이 바로 반영됩니다.
    const patchProfile = useUserProfileStore((s) => s.patchProfile)

    // 닉네임 입력칸의 현재 값입니다. 처음에는 store에 저장된 닉네임을 사용합니다.
    const [nickname, setNickname] = useState(storeUser?.nickname ?? "")

    // 닉네임 변경 성공/실패 메시지입니다.
    const [nicknameMsg, setNicknameMsg] = useState(null)

    // 닉네임 변경 요청이 진행 중인지 표시합니다.
    const [nicknameLoading, setNicknameLoading] = useState(false)

    // 닉네임 변경 form을 제출할 때 실행됩니다.
    const handleNicknameSubmit = async (e) => {
        e.preventDefault()

        // 공백만 입력한 경우 요청을 보내지 않습니다.
        if(!nickname.trim()) return

        setNicknameLoading(true)
        setNicknameMsg(null)
        try {
            await updateNicknameApi(nickname.trim())

            // 서버 변경이 성공하면 전역 사용자 정보와 프로필 캐시를 모두 새 닉네임으로 갱신합니다.
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
