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
  const storeUser  = useAuthStore((s) => s.user)
  const storeLogin = useAuthStore((s) => s.login)

  // ── 닉네임 섹션 ──────────────────────────────────────────────
  const [nickname, setNickname]           = useState(storeUser?.nickname ?? "")
  const [nicknameMsg, setNicknameMsg]     = useState(null) // { type: 'success'|'error', text }
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
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" })
  const [pwMsg, setPwMsg]   = useState(null) // { type: 'success'|'error', text }
  const [pwLoading, setPwLoading] = useState(false)

  const handlePwChange = (e) => {
    const { name, value } = e.target
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
