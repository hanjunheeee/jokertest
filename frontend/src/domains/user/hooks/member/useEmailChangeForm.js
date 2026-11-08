// 이메일 바꾸기 폼 (새 주소·현재 비번 → 번호 받기 → 번호 확인 → 바뀜)
// 데스크톱·모바일 이메일 바꾸기 칸이 씀, 소셜 전용 계정은 비번 칸 없이 번호만
import { useRef, useState } from "react"
import { confirmEmailChangeApi, requestEmailChangeApi } from "../../api/member.api.js"

// 단계: input(주소 넣기) → codeSent(번호 넣기) → input(바뀐 뒤 처음으로)
export function useEmailChangeForm({
  account, onChanged, requestCode = requestEmailChangeApi, confirmCode = confirmEmailChangeApi,
} = {}) {
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [code, setCode] = useState("")
  const [stage, setStage] = useState("input")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const busyRef = useRef(false)
  const usesPassword = account?.hasLocalPassword !== false

  // 같은 순간 두 번 누름 막고 보내는 중 표시
  const run = async (work) => {
    if (busyRef.current) return
    busyRef.current = true
    setLoading(true)
    try {
      await work()
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }

  // 번호 받기 (다시 받기도 같음)
  const sendCode = (event) => {
    event?.preventDefault?.()
    if (!account) return undefined
    if (!newEmail.trim()) {
      setMsg({ type: "error", text: "새 이메일을 입력해주세요." })
      return undefined
    }
    if (usesPassword && !currentPassword) {
      setMsg({ type: "error", text: "현재 비밀번호를 입력해주세요." })
      return undefined
    }
    return run(async () => {
      try {
        const result = await requestCode({ newEmail: newEmail.trim(), currentPassword: usesPassword ? currentPassword : undefined })
        setStage("codeSent")
        setCode("")
        const minutes = Math.max(1, Math.floor((result?.expiresInSec ?? 600) / 60))
        setMsg({ type: "success", text: `인증번호를 보냈습니다. ${minutes}분 안에 입력해주세요.` })
      } catch (err) {
        const wait = typeof err?.resendAfterSec === "number" ? ` (${err.resendAfterSec}초 뒤)` : ""
        setMsg({ type: "error", text: `${err?.message || "인증번호를 보내지 못했습니다."}${wait}` })
      }
    })
  }

  // 번호 확인 → 바뀌면 처음 단계로, 부모에 새 주소 알림
  const verifyCode = (event) => {
    event?.preventDefault?.()
    if (!/^\d{4,10}$/.test(code.trim())) {
      setMsg({ type: "error", text: "인증번호를 숫자로 입력해주세요." })
      return undefined
    }
    return run(async () => {
      try {
        const result = await confirmCode({ newEmail: newEmail.trim(), code: code.trim() })
        setStage("input")
        setNewEmail("")
        setCurrentPassword("")
        setCode("")
        setMsg({ type: "success", text: "이메일이 변경되었습니다." })
        onChanged?.(result?.email ?? newEmail.trim().toLowerCase())
      } catch (err) {
        const left = typeof err?.attemptsRemaining === "number" ? ` (남은 횟수 ${err.attemptsRemaining})` : ""
        setMsg({ type: "error", text: `${err?.message || "인증에 실패했습니다."}${left}` })
      }
    })
  }

  // 주소를 고치면 번호 단계에서 처음으로
  const changeNewEmail = (value) => {
    setNewEmail(value)
    if (stage === "codeSent") setStage("input")
  }

  return {
    newEmail, setNewEmail: changeNewEmail, currentPassword, setCurrentPassword, code, setCode,
    stage, usesPassword, loading, msg, sendCode, verifyCode,
  }
}
