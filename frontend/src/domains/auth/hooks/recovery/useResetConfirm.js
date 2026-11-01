// 새 비밀번호 검사와 재설정 확정 요청
// hooks/recovery/useResetPage.js가 사용, 화면 상태 바꾸기는 받아서 씀
import { useRef } from "react"
import { confirmPasswordResetApi } from "../../api/auth.api.js"
import { RESET_TEXT } from "../../constants/recoveryMessages.js"
import { validatePassword, validatePasswordConfirm } from "../../validation/signupValidation.js"

// 제출 처리(handleSubmit)를 돌려줌
export function useResetConfirm({
  token, status, password, passwordConfirm,
  visitIdRef, unmountedRef, submittingRef,
  setStatus, setFormError, setLinkInvalidReason, setPassword, setPasswordConfirm,
}) {
  const requestRef = useRef(0)

  // 확정 요청: 성공은 done, 링크 문제는 linkInvalid, 소셜 계정은 socialOnly, 나머지는 문구 띄우고 ready
  const submitConfirm = () => {
    submittingRef.current = true
    setFormError("")
    setStatus("submitting")
    const submittedToken = token
    const submittedVisitId = visitIdRef.current
    const requestId = ++requestRef.current
    // 화면 나감·다른 링크 방문·더 새 요청이 있으면 이 응답은 버림
    const isStale = () => (
      unmountedRef.current
      || visitIdRef.current !== submittedVisitId
      || requestRef.current !== requestId
    )

    confirmPasswordResetApi({ token: submittedToken, newPassword: password })
      .then((result) => {
        if (isStale()) return
        submittingRef.current = false

        if (result?.ok === true) {
          setPassword("")
          setPasswordConfirm("")
          setStatus("done")
        } else {
          setFormError(RESET_TEXT.confirmRetry)
          setStatus("ready")
        }
      })
      .catch((error) => {
        if (isStale()) return
        submittingRef.current = false

        // 서버 code는 400 + ok:false로 거절됐을 때만 믿음
        const rejectedWithCode = (error?.status === 400 && error?.ok === false) ? error.code : undefined

        if (error?.status === 429) {
          setFormError(RESET_TEXT.confirmRateLimited)
          setStatus("ready")
        } else if (rejectedWithCode === "SOCIAL_ONLY") {
          setStatus("socialOnly")
        } else if (rejectedWithCode === "INVALID_PASSWORD") {
          setFormError(error.message || RESET_TEXT.badPassword)
          setStatus("ready")
        } else if (rejectedWithCode === "INVALID" || rejectedWithCode === "EXPIRED" || rejectedWithCode === "USED") {
          setLinkInvalidReason(rejectedWithCode)
          setStatus("linkInvalid")
        } else {
          setFormError(RESET_TEXT.confirmRetry)
          setStatus("ready")
        }
      })
  }

  // ready일 때만 받음, 비밀번호 규칙 → 확인 일치 순서로 검사
  const handleSubmit = (event) => {
    event.preventDefault()
    if (status !== "ready" || submittingRef.current) return

    const passwordResult = validatePassword(password)
    if (!passwordResult.ok) {
      setFormError(passwordResult.message)
      return
    }
    const confirmResult = validatePasswordConfirm(password, passwordConfirm)
    if (!confirmResult.ok) {
      setFormError(confirmResult.message)
      return
    }

    setFormError("")
    submitConfirm()
  }

  return handleSubmit
}
