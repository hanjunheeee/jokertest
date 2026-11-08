// 내 계정 정보 불러오기 (이메일·비번 있는 계정인지)
// 데스크톱·모바일 계정 관리 패널이 씀, 이메일 바꾸기·탈퇴 칸이 본인 확인 칸을 고를 때 봄
import { useEffect, useState } from "react"
import { getMyAccountApi } from "../../api/member.api.js"

// account: null(불러오는 중·실패) 또는 { email, hasLocalPassword }
export function useMyAccount({ loadAccount = getMyAccountApi } = {}) {
  const [account, setAccount] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadAccount()
      .then((data) => {
        if (cancelled || !data) return
        setAccount({ email: data.email ?? "", hasLocalPassword: data.hasLocalPassword !== false })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [loadAccount])

  // 이메일 바꾸기 성공 뒤 화면 값만 바꿈
  const setEmail = (email) => setAccount((prev) => (prev ? { ...prev, email } : prev))

  return { account, failed, setEmail }
}
