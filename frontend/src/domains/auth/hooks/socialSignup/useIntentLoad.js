// 소셜 가입 정보(intent) 불러오기 effect
// hooks/useSocialSignup.js가 사용, 상태 바꾸기는 받아서 씀
import { useEffect } from "react"
import { getSocialSignupIntentApi } from "../../api/auth.api.js"
import { SOCIAL_SIGNUP_TEXT } from "../../constants/socialMessages.js"
import { intentErrorView } from "../../utils/socialErrors.js"

// token·다시 시도 횟수가 바뀔 때마다 새로 불러옴, 옛 요청 응답은 세대 번호로 버림
export function useIntentLoad({
  intentToken, intentAttempt, genRef,
  setIntentStatus, setEmailVerificationRequired, setEmail, setStatus, setErrorMessage,
}) {
  useEffect(() => {
    const generation = ++genRef.current

    // token 없으면 세션 만료로 보여 줌
    if (typeof intentToken !== "string" || !intentToken) {
      setIntentStatus("error")
      setStatus("expired")
      setErrorMessage(SOCIAL_SIGNUP_TEXT.sessionExpired)
      return undefined
    }

    // 불러오기 전에 지난 가입 정보·입력을 비움
    setIntentStatus("loading")
    setEmailVerificationRequired(false)
    setEmail("")
    setStatus("idle")
    setErrorMessage(null)

    getSocialSignupIntentApi({ intentToken })
      .then((data) => {
        if (genRef.current !== generation) return
        // 인증 필요 여부가 boolean이 아니면 못 믿을 응답으로 봄
        if (typeof data?.emailVerificationRequired !== "boolean") {
          setIntentStatus("error")
          setErrorMessage(SOCIAL_SIGNUP_TEXT.intentLoadFailed)
          return
        }
        setEmailVerificationRequired(data.emailVerificationRequired)
        setIntentStatus("ready")
      })
      .catch((error) => {
        if (genRef.current !== generation) return

        const view = intentErrorView(error)
        setIntentStatus("error")
        if (view.status) setStatus(view.status)
        setErrorMessage(view.message)
      })

    return () => { genRef.current += 1 }
  }, [intentToken, intentAttempt, genRef, setIntentStatus, setEmailVerificationRequired, setEmail, setStatus, setErrorMessage])
}
