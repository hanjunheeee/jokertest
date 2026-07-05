/**
 * 계정 관리 폼 상태와 API 호출을 담당하는 훅.
 *
 * AccountPanel이 이 훅만 의존하도록 API 호출을 분리합니다.
 * 각 섹션은 독립적인 상태를 가지므로 하나가 실패해도 다른 섹션에 영향을 주지 않습니다.
 */
import { useState } from "react"
import { updateNicknameApi, updatePasswordApi } from "../api/user"
import { useAuthStore } from "@/domains/auth/store/authStore"

export function useAccountForm() {
  // authStore(전역 상태)에서 현재 로그인한 사용자 정보와 login 액션만 꺼내서 사용
  const storeUser  = useAuthStore((s) => s.user)
  const storeLogin = useAuthStore((s) => s.login)

  // ── 닉네임 섹션 ──────────────────────────────────────────────
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅입니다.
  // 값을 바꾸는 함수를 호출하면 이 훅을 사용하는 컴포넌트가 다시 렌더링됩니다.
  // nickname: 입력창에 표시되는 닉네임 값 (초기값은 로그인한 유저의 기존 닉네임)
  const [nickname, setNickname]           = useState(storeUser?.nickname ?? "")
  const [nicknameMsg, setNicknameMsg]     = useState(null) // { type: 'success'|'error', text }
  // nicknameLoading: 닉네임 변경 API 요청이 진행 중인지 여부 (버튼 비활성화용)
  const [nicknameLoading, setNicknameLoading] = useState(false)

  const handleNicknameSubmit = async (e) => {
    e.preventDefault()
    if (!nickname.trim()) return
    setNicknameLoading(true)
    setNicknameMsg(null)
    try {
      await updateNicknameApi(nickname.trim())
      // authStore의 user.nickname도 즉시 갱신해 배너가 리렌더되도록 합니다.
      storeLogin({ ...storeUser, nickname: nickname.trim() })
      setNicknameMsg({ type: "success", text: "닉네임이 변경되었습니다." })
    } catch (err) {
      setNicknameMsg({ type: "error", text: err.message ?? "변경에 실패했습니다." })
    } finally {
      setNicknameLoading(false)
    }
  }

  // ── 비밀번호 섹션 ─────────────────────────────────────────────
  // pwForm: currentPassword·newPassword 입력값을 하나의 객체로 묶어 관리하는 state
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" })
  const [pwMsg, setPwMsg]   = useState(null) // { type: 'success'|'error', text }
  const [pwLoading, setPwLoading] = useState(false)

  const handlePwChange = (e) => {
    const { name, value } = e.target
    // ...prev로 기존 필드는 그대로 두고 [name]: value로 해당 필드만 덮어씀
    setPwForm((prev) => ({ ...prev, [name]: value }))
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    if (!pwForm.currentPassword || !pwForm.newPassword) return
    setPwLoading(true)
    setPwMsg(null)
    try {
      await updatePasswordApi(pwForm)
      setPwForm({ currentPassword: "", newPassword: "" })
      setPwMsg({ type: "success", text: "비밀번호가 변경되었습니다." })
    } catch (err) {
      setPwMsg({ type: "error", text: err.message ?? "변경에 실패했습니다." })
    } finally {
      setPwLoading(false)
    }
  }

  return {
    nickname, setNickname, nicknameMsg, nicknameLoading, handleNicknameSubmit,
    pwForm, handlePwChange, pwMsg, pwLoading, handlePasswordSubmit,
  }
}
