import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { AUTH_RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import AuthInputSlot, { MailIcon, LockIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import AuthFrameBackButton from "@/domains/auth/components/AuthFrameBackButton.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { validateEmail, validatePassword, validatePasswordConfirm } from "@/domains/auth/validation/signupValidation.js"
import { requestPasswordResetApi, verifyPasswordResetApi, confirmPasswordResetApi } from "@/domains/auth/api/auth.api.js"

const RESET_EMAIL_MAX_LENGTH = 100
const INVALID_EMAIL_MESSAGE = "이메일 형식이 올바르지 않습니다."

const validateResetEmailInput = (email) => {
  const trimmedResult = validateEmail(email)
  if (!trimmedResult.ok) return trimmedResult

  const value = trimmedResult.value
  if (value.length > RESET_EMAIL_MAX_LENGTH) return { ok: false, message: INVALID_EMAIL_MESSAGE }
  if (/\s/.test(value)) return { ok: false, message: INVALID_EMAIL_MESSAGE }

  const atIndex = value.indexOf("@")
  if (atIndex <= 0 || atIndex === value.length - 1) return { ok: false, message: INVALID_EMAIL_MESSAGE }

  const domain = value.slice(atIndex + 1)
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return { ok: false, message: INVALID_EMAIL_MESSAGE }
  }

  return { ok: true, value }
}

const REQUEST_SENT_MESSAGE = "재설정 요청을 접수했어요. 입력하신 주소로 가입된 계정이 있다면 재설정 링크가 담긴 메일이 도착합니다. 메일이 보이지 않으면 스팸함까지 확인한 뒤 아래 '다시 보내기'를 눌러주세요."
const REQUEST_RATE_LIMITED_MESSAGE = "너무 많은 요청입니다. 잠시 후 다시 시도해주세요."
const REQUEST_FAILED_MESSAGE = "서버와 통신할 수 없습니다. 잠시 후 다시 시도해주세요."

export function PasswordResetRequestPage() {
  const navigate = useNavigate()

  const [status, setStatus] = useState("idle")
  const [email, setEmail] = useState("")
  const [sentEmail, setSentEmail] = useState("")
  const [formError, setFormError] = useState("")

  const submittingRef = useRef(false)
  const requestGenerationRef = useRef(0)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  const submit = (targetEmail) => {
    submittingRef.current = true
    setStatus("submitting")
    const generation = ++requestGenerationRef.current

    requestPasswordResetApi({ email: targetEmail })
      .then((result) => {
        if (unmountedRef.current || requestGenerationRef.current !== generation) return
        submittingRef.current = false

        if (result?.ok === true) {
          setSentEmail(targetEmail)
          setStatus("sent")
        } else {
          setStatus("failed")
        }
      })
      .catch((error) => {
        if (unmountedRef.current || requestGenerationRef.current !== generation) return
        submittingRef.current = false

        if (error?.status === 429) {
          setStatus("rateLimited")
        } else if (error?.status === 400) {
          setFormError("입력하신 이메일을 다시 확인해주세요.")
          setStatus("idle")
        } else {
          setStatus("failed")
        }
      })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (status === "submitting" || submittingRef.current) return

    const validation = validateResetEmailInput(email)
    if (!validation.ok) {
      setFormError(validation.message)
      return
    }

    setFormError("")
    submit(validation.value)
  }

  const handleResend = () => {
    if (status === "submitting" || submittingRef.current) return
    submit(sentEmail)
  }

  const backToIdle = () => {
    setFormError("")
    setStatus("idle")
  }

  const handleBack = () => navigate("/login")

  const isFormDisabled = status === "submitting"

  return (
    <AuthScene onSubmit={handleSubmit}>
      <header className="text-center">
        <p className="mt-[64px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-relaxed text-text-body/90">
          가입할 때 등록한 이메일로 비밀번호 재설정 링크를 보내드려요
        </p>
      </header>

      <div className="mt-6 flex flex-1 flex-col gap-2">
        {status === "sent" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p role="status" className={`${AUTH_RECOVERY_ALERT_CLASS} text-center`}>
              {REQUEST_SENT_MESSAGE}
            </p>
            <button type="button" onClick={handleResend} className="auth-text-link">다시 보내기</button>
          </div>
        ) : (
          <fieldset disabled={isFormDisabled} className="contents">
            <label className="font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
              이메일
              <AuthInputSlot
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="가입할 때 등록한 이메일을 입력하세요"
                autoComplete="email"
                leadingIcon={<MailIcon />}
              />
            </label>

            {formError && (
              <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
                {formError}
              </p>
            )}

            {status === "rateLimited" && (
              <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
                {REQUEST_RATE_LIMITED_MESSAGE}
              </p>
            )}
            {status === "failed" && (
              <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
                {REQUEST_FAILED_MESSAGE}
              </p>
            )}

            <AuthImageButton
              type="submit"
              src="/button/버튼 프레임2.png"
              label={status === "submitting" ? "전송 중" : "재설정 링크 보내기"}
              visibleLabel={status === "submitting" ? "전송 중" : "재설정 링크 보내기"}
              disabled={isFormDisabled}
              className="mt-1 cursor-pointer"
            />

            {(status === "rateLimited" || status === "failed") && (
              <button type="button" onClick={backToIdle} className="auth-text-link mt-1">다시 입력</button>
            )}
          </fieldset>
        )}
      </div>

      <AuthFrameBackButton onClick={handleBack} />
    </AuthScene>
  )
}

const LINK_EXPIRED_MESSAGE = "링크가 만료됐어요. 비밀번호 재설정을 다시 요청해주세요."
const LINK_USED_MESSAGE = "이미 사용된 링크예요. 비밀번호가 이미 재설정되었다면 새 비밀번호로 로그인해주세요."
const LINK_INVALID_MESSAGE = "유효하지 않은 링크예요. 이메일에 있는 링크 주소를 다시 확인해주세요."
const VERIFY_FAILED_MESSAGE = "서버와 통신할 수 없습니다. 다시 확인해주세요."
const CONFIRM_RETRY_MESSAGE = "서버와 통신할 수 없습니다. 잠시 후 다시 시도해주세요."
const VERIFY_RATE_LIMITED_MESSAGE = "확인 요청이 너무 많습니다. 잠시 후 '다시 확인'을 눌러주세요."
const CONFIRM_RATE_LIMITED_MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
const DONE_MESSAGE = "비밀번호가 재설정되었어요. 새 비밀번호로 다시 로그인해주세요."
const SOCIAL_ONLY_MESSAGE = "소셜 로그인으로 가입한 계정이에요. 소셜 로그인 버튼으로 로그인해주세요."

export function PasswordResetPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") || ""

  const [status, setStatus] = useState(token ? "verifying" : "linkInvalid")
  const [linkInvalidReason, setLinkInvalidReason] = useState(token ? "" : "INVALID")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [formError, setFormError] = useState("")
  const [verifyFailedMessage, setVerifyFailedMessage] = useState(VERIFY_FAILED_MESSAGE)
  const [verifyReloadKey, setVerifyReloadKey] = useState(0)

  const submittingRef = useRef(false)
  const unmountedRef = useRef(false)
  const visitIdRef = useRef(0)
  const visitedTokenRef = useRef(null)
  const verifyCacheRef = useRef({ key: "", promise: null })
  const confirmRequestRef = useRef(0)

  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  useEffect(() => {
    setPassword("")
    setPasswordConfirm("")
    setFormError("")
    setLinkInvalidReason(token ? "" : "INVALID")
    submittingRef.current = false
  }, [token])

  useEffect(() => {
    if (visitedTokenRef.current !== token) {
      visitedTokenRef.current = token
      visitIdRef.current += 1
    }
    const visitId = visitIdRef.current

    if (!token) {
      setLinkInvalidReason("INVALID")
      setStatus("linkInvalid")
      return
    }

    let cancelled = false
    setStatus("verifying")

    const cacheKey = `${visitId}:${verifyReloadKey}:${token}`
    let promise = verifyCacheRef.current.key === cacheKey ? verifyCacheRef.current.promise : null
    if (!promise) {
      promise = verifyPasswordResetApi({ token })
      verifyCacheRef.current = { key: cacheKey, promise }
    }

    promise
      .then((result) => {
        if (cancelled || unmountedRef.current || visitIdRef.current !== visitId) return
        if (result?.ok === true && result.status === "VALID") {
          setStatus("ready")
        } else if (result?.ok === false && (result.code === "EXPIRED" || result.code === "USED" || result.code === "INVALID")) {
          setLinkInvalidReason(result.code)
          setStatus("linkInvalid")
        } else {
          verifyCacheRef.current = { key: "", promise: null }
          setVerifyFailedMessage(VERIFY_FAILED_MESSAGE)
          setStatus("verifyFailed")
        }
      })
      .catch((error) => {
        verifyCacheRef.current = { key: "", promise: null }
        if (cancelled || unmountedRef.current || visitIdRef.current !== visitId) return
        setVerifyFailedMessage(error?.status === 429 ? VERIFY_RATE_LIMITED_MESSAGE : VERIFY_FAILED_MESSAGE)
        setStatus("verifyFailed")
      })

    return () => { cancelled = true }
  }, [token, verifyReloadKey])

  const retryVerify = () => {
    verifyCacheRef.current = { key: "", promise: null }
    setVerifyReloadKey((k) => k + 1)
  }

  const submitConfirm = () => {
    submittingRef.current = true
    setFormError("")
    setStatus("submitting")
    const submittedToken = token
    const submittedVisitId = visitIdRef.current
    const requestId = ++confirmRequestRef.current
    const isStale = () => (
      unmountedRef.current
      || visitIdRef.current !== submittedVisitId
      || confirmRequestRef.current !== requestId
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
          setFormError(CONFIRM_RETRY_MESSAGE)
          setStatus("ready")
        }
      })
      .catch((error) => {
        if (isStale()) return
        submittingRef.current = false

        const rejectedWithCode = (error?.status === 400 && error?.ok === false) ? error.code : undefined

        if (error?.status === 429) {
          setFormError(CONFIRM_RATE_LIMITED_MESSAGE)
          setStatus("ready")
        } else if (rejectedWithCode === "SOCIAL_ONLY") {
          setStatus("socialOnly")
        } else if (rejectedWithCode === "INVALID_PASSWORD") {
          setFormError(error.message || "비밀번호 조건을 다시 확인해주세요.")
          setStatus("ready")
        } else if (rejectedWithCode === "INVALID" || rejectedWithCode === "EXPIRED" || rejectedWithCode === "USED") {
          setLinkInvalidReason(rejectedWithCode)
          setStatus("linkInvalid")
        } else {
          setFormError(CONFIRM_RETRY_MESSAGE)
          setStatus("ready")
        }
      })
  }

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

  const goToLogin = () => navigate("/login", { replace: true })

  const isFormDisabled = status === "submitting"

  if (status === "verifying") {
    return (
      <AuthScene onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p role="status" className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body">
            링크를 확인하고 있어요
          </p>
        </div>
      </AuthScene>
    )
  }

  if (status === "verifyFailed") {
    return (
      <AuthScene onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p role="alert" className={AUTH_RECOVERY_ALERT_CLASS}>
            {verifyFailedMessage}
          </p>
          <button type="button" onClick={retryVerify} className="auth-text-link">다시 확인</button>
        </div>
      </AuthScene>
    )
  }

  if (status === "linkInvalid") {
    const linkInvalidMessage =
      linkInvalidReason === "EXPIRED" ? LINK_EXPIRED_MESSAGE
      : linkInvalidReason === "USED" ? LINK_USED_MESSAGE
      : LINK_INVALID_MESSAGE
    return (
      <AuthScene onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p role="alert" className={AUTH_RECOVERY_ALERT_CLASS}>
            {linkInvalidMessage}
          </p>
          <button type="button" onClick={() => navigate("/password-reset/request")} className="auth-text-link">다시 요청하기</button>
        </div>
      </AuthScene>
    )
  }

  if (status === "socialOnly") {
    return (
      <AuthScene onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p role="alert" className={AUTH_RECOVERY_ALERT_CLASS}>
            {SOCIAL_ONLY_MESSAGE}
          </p>
          <button type="button" onClick={goToLogin} className="auth-text-link">로그인으로 이동</button>
        </div>
      </AuthScene>
    )
  }

  if (status === "done") {
    return (
      <AuthScene onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p role="status" className={`${AUTH_RECOVERY_ALERT_CLASS} text-center`}>
            {DONE_MESSAGE}
          </p>
          <button type="button" onClick={goToLogin} className="auth-text-link">로그인으로 이동</button>
        </div>
      </AuthScene>
    )
  }

  return (
    <AuthScene onSubmit={handleSubmit}>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-relaxed text-text-body/90">
          새 비밀번호를 입력해주세요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        <fieldset disabled={isFormDisabled} className="contents">
          <label className="font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
            새 비밀번호
            <AuthInputSlot
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8~64자 비밀번호"
              autoComplete="new-password"
              leadingIcon={<LockIcon />}
              passwordToggle
            />
          </label>

          <label className="mt-1 font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
            새 비밀번호 확인
            <AuthInputSlot
              name="passwordConfirm"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="비밀번호를 다시 입력하세요"
              autoComplete="new-password"
              leadingIcon={<LockIcon />}
              passwordToggle
            />
          </label>

          {formError && (
            <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
              {formError}
            </p>
          )}

          <AuthImageButton
            type="submit"
            src="/button/버튼 프레임1.png"
            label={status === "submitting" ? "변경 중" : "비밀번호 변경"}
            visibleLabel={status === "submitting" ? "변경 중" : "비밀번호 변경"}
            disabled={isFormDisabled}
            className="mt-1 cursor-pointer"
          />
        </fieldset>
      </div>
    </AuthScene>
  )
}
