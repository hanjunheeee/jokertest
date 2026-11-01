// 비밀번호 재설정 메일 요청 화면 상태와 요청 보내기
// pages/passwordReset/RequestPage.jsx가 사용
import { useEffect, useRef, useState } from "react"
import { requestPasswordResetApi } from "../../api/auth.api.js"
import { REQUEST_TEXT } from "../../constants/recoveryMessages.js"
import { validateResetEmail } from "../../validation/recovery.js"

// 요청 상태: idle → submitting → sent / rateLimited / failed
export function useResetRequest() {
  const [status, setStatus] = useState("idle")
  const [email, setEmail] = useState("")
  const [sentEmail, setSentEmail] = useState("")
  const [formError, setFormError] = useState("")

  // 보내기 잠금·요청 세대·화면 나감 표시
  const submittingRef = useRef(false)
  const genRef = useRef(0)
  const unmountedRef = useRef(false)

  // 화면을 나간 뒤 온 응답은 버리려고 표시함
  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  // 요청 보내기 (다시 보내기도 씀), 마지막에 보낸 요청 응답만 반영
  const submit = (targetEmail) => {
    submittingRef.current = true
    setStatus("submitting")
    const gen = ++genRef.current

    requestPasswordResetApi({ email: targetEmail })
      .then((result) => {
        if (unmountedRef.current || genRef.current !== gen) return
        submittingRef.current = false

        // 보낸 주소를 기억해 둬야 다시 보내기가 같은 주소로 감
        if (result?.ok === true) {
          setSentEmail(targetEmail)
          setStatus("sent")
        } else {
          setStatus("failed")
        }
      })
      .catch((error) => {
        if (unmountedRef.current || genRef.current !== gen) return
        submittingRef.current = false

        // 429는 잠시 막힘, 400은 주소 문제라 입력 화면으로 돌림
        if (error?.status === 429) {
          setStatus("rateLimited")
        } else if (error?.status === 400) {
          setFormError(REQUEST_TEXT.badInput)
          setStatus("idle")
        } else {
          setStatus("failed")
        }
      })
  }

  // 주소 검사 통과하면 다듬은 주소로 보냄
  const handleSubmit = (event) => {
    event.preventDefault()
    if (status === "submitting" || submittingRef.current) return

    const check = validateResetEmail(email)
    if (!check.ok) {
      setFormError(check.message)
      return
    }

    setFormError("")
    submit(check.value)
  }

  // 마지막으로 보낸 주소로 한 번 더
  const handleResend = () => {
    if (status === "submitting" || submittingRef.current) return
    submit(sentEmail)
  }

  // 에러 지우고 입력 화면으로
  const backToIdle = () => {
    setFormError("")
    setStatus("idle")
  }

  return { status, email, setEmail, formError, handleSubmit, handleResend, backToIdle }
}
