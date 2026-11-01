// 비밀번호 재설정 화면 상태 묶음 (링크 확인 + 새 비밀번호 제출)
// pages/passwordReset/ResetPage.jsx가 사용, 링크 확인은 useLinkCheck·제출은 useResetConfirm이 맡음
import { useEffect, useRef, useState } from "react"
import { useLinkCheck } from "./useLinkCheck.js"
import { useResetConfirm } from "./useResetConfirm.js"

// 화면 상태: verifying → ready ↔ submitting → done, 막히면 linkInvalid / verifyFailed / socialOnly
export function useResetPage(token) {
  const [status, setStatus] = useState(token ? "verifying" : "linkInvalid")
  const [linkInvalidReason, setLinkInvalidReason] = useState(token ? "" : "INVALID")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [formError, setFormError] = useState("")

  const submittingRef = useRef(false)
  const unmountedRef = useRef(false)
  const visitIdRef = useRef(0)

  // 화면을 나간 뒤 온 응답은 버리려고 표시함
  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  // 링크가 바뀌면 입력·에러 비우고 제출 잠금 풂 (링크 확인 effect보다 먼저 돎)
  useEffect(() => {
    setPassword("")
    setPasswordConfirm("")
    setFormError("")
    setLinkInvalidReason(token ? "" : "INVALID")
    submittingRef.current = false
  }, [token])

  const { verifyFailedMessage, retryVerify } = useLinkCheck({
    token, setStatus, setLinkInvalidReason, unmountedRef, visitIdRef,
  })

  const handleSubmit = useResetConfirm({
    token, status, password, passwordConfirm,
    visitIdRef, unmountedRef, submittingRef,
    setStatus, setFormError, setLinkInvalidReason, setPassword, setPasswordConfirm,
  })

  return {
    status, linkInvalidReason, verifyFailedMessage, formError,
    password, setPassword, passwordConfirm, setPasswordConfirm,
    retryVerify, handleSubmit,
  }
}
