// 비밀번호 바꾸기 폼 훅 (입력·보내기·결과 문구)
// 계정 관리 폼 훅(useAccountForm)이 씀
import { useRef, useState } from "react"
import { updatePasswordApi } from "@/domains/user/api/user.api"
import { validatePassword, validatePasswordConfirm } from "@/domains/auth/validation/signupValidation.js"
import { forceRelogin } from "../../../shared/utils/forceRelogin.js"

// 다시 로그인 안내를 읽을 시간 (그 뒤 로그인 화면으로)
export const RELOGIN_DELAY_MS = 1500

// 빈 칸 값 (확인 칸은 화면에서만 봄, 서버엔 안 보냄)
const EMPTY_PW_FORM = { currentPassword: "", newPassword: "", newPasswordConfirm: "" }

// 지금·새 비밀번호·확인 입력과 결과 문구, 서버가 reloginRequired를 주면 안내 뒤 로그인 화면으로
export function usePasswordForm({ onReloginRequired = () => forceRelogin(), reloginDelayMs = RELOGIN_DELAY_MS } = {}) {
    const [pwForm, setPwForm] = useState(EMPTY_PW_FORM)

    const [pwMsg, setPwMsg] = useState(null)

    const [pwLoading, setPwLoading] = useState(false)

    // 같은 순간 두 번 눌러도 한 번만 보냄 (첫 요청이 세션을 끊어 둘째가 401로 로그아웃될 수 있음)
    const submittingRef = useRef(false)

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
        if (submittingRef.current) return
        // 새 비번 규칙은 가입·재설정과 같은 검사로 먼저 막음 (서버도 같은 규칙)
        const ruleResult = validatePassword(pwForm.newPassword)
        if (!ruleResult.ok) {
            setPwMsg({ type: "error", text: ruleResult.message })
            return
        }
        // 새 비번을 잘못 치면 바로 로그아웃돼 못 들어옴 → 확인 칸과 다르면 안 보냄
        const confirmResult = validatePasswordConfirm(pwForm.newPassword, pwForm.newPasswordConfirm)
        if (!confirmResult.ok) {
            setPwMsg({ type: "error", text: confirmResult.message })
            return
        }
        submittingRef.current = true

        setPwLoading(true)
        setPwMsg(null)
        try {
            const result = await updatePasswordApi(pwForm)
            // 응답이 없으면(공통 401 처리로 로그아웃·이동됨) 성공으로 안 봄
            if (result === undefined) return

            setPwForm(EMPTY_PW_FORM)
            // 서버가 지금 세션까지 끊어서 다시 로그인해야 함을 같이 알림
            setPwMsg({ type: "success", text: "비밀번호가 변경되었습니다. 다시 로그인해 주세요."})
            // 지금 세션도 끊겼으니 잠깐 안내를 보여 준 뒤 로그인 화면으로
            if (result?.reloginRequired === true) setTimeout(onReloginRequired, reloginDelayMs)
        } catch (err) {
            setPwMsg({ type: "error", text: err?.message ?? "변경에 실패했습니다." })
        } finally {
            submittingRef.current = false
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
