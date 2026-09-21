// 파일 역할: PasswordResetPage.jsx - 비밀번호 재설정 요청(/password-reset/request)과 링크 도착
// (/password-reset) 두 공개 라우트 페이지입니다.
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import AuthInputSlot, { MailIcon, LockIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { validateEmail, validatePassword, validatePasswordConfirm } from "@/domains/auth/validation/signupValidation.js"
import { requestPasswordResetApi, verifyPasswordResetApi, confirmPasswordResetApi } from "@/domains/auth/api/auth.api.js"

// backend/validation/passwordResetValidation.js::validateResetEmail과 같은 정규화(trim)·형식
// 조건을 여기서도 먼저 확인합니다 — 서버가 다시 검사하므로 이 자체가 최종 판정은 아니고, 명백히
// 틀린 입력을 보내기 전에 빠르게 걸러내기 위함입니다(모듈 시스템이 달라(ESM/CommonJS) 코드를
// 그대로 공유할 수 없습니다 — FindIdPage.jsx의 validateLocalInput과 같은 패턴).
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

const REQUEST_SENT_MESSAGE = "입력하신 이메일로 재설정 링크를 보내드렸어요. 메일함을 확인해주세요."
const REQUEST_RATE_LIMITED_MESSAGE = "너무 많은 요청입니다. 잠시 후 다시 시도해주세요."
const REQUEST_FAILED_MESSAGE = "서버와 통신할 수 없습니다. 잠시 후 다시 시도해주세요."

// ── 재설정 요청 화면(/password-reset/request) ──────────────────────────────────
// 계정 존재 여부와 무관하게 항상 같은 완료 안내를 보여줍니다(AC-01) — 응답에 없는 계정
// 정보를 화면이 추론하지 않습니다.
export function PasswordResetRequestPage() {
  const navigate = useNavigate()

  // idle | submitting | sent | rateLimited | failed
  const [status, setStatus] = useState("idle")
  const [email, setEmail] = useState("")
  const [sentEmail, setSentEmail] = useState("")
  const [formError, setFormError] = useState("")

  // FindIdPage.jsx와 같은 이유로 동기 잠금과 요청 세대·언마운트 검사를 둡니다 — setState는
  // 비동기라 status 값만으로는 같은 이벤트 루프 안의 연속 제출을 막을 수 없고, 늦게 도착한
  // 응답이 이미 떠난 화면을 되돌리면 안 됩니다.
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
        submittingRef.current = false
        if (unmountedRef.current || requestGenerationRef.current !== generation) return

        if (result?.ok) {
          setSentEmail(targetEmail)
          setStatus("sent")
        } else {
          setStatus("failed")
        }
      })
      .catch((error) => {
        submittingRef.current = false
        if (unmountedRef.current || requestGenerationRef.current !== generation) return

        if (error?.status === 429) {
          setStatus("rateLimited")
        } else if (error?.status === 400) {
          setFormError("입력하신 이메일을 다시 확인해주세요.")
          setStatus("idle")
        } else {
          // 명확한 5xx든 응답 자체를 받지 못한 네트워크 오류든 화면에서는 같은 통신 실패로
          // 다룹니다 — 어느 쪽이든 사용자가 할 수 있는 일은 "다시 시도"뿐입니다.
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

  // sent 화면의 "다시 보내기"는 같은 이메일로 정확히 한 번 더 요청합니다.
  const handleResend = () => {
    if (status === "submitting" || submittingRef.current) return
    submit(sentEmail)
  }

  // 실패 계열 화면에서 "다시 입력"을 누르면 입력값은 유지한 채 idle로만 돌아갑니다 — 여기서
  // 곧바로 재요청하지 않습니다(자동 재시도 0회). 다음 요청은 사용자가 제출 버튼을 다시
  // 눌러야 나갑니다.
  const backToIdle = () => {
    setFormError("")
    setStatus("idle")
  }

  const handleBack = () => navigate("/login")

  const isFormDisabled = status === "submitting"

  return (
    <AuthScene onSubmit={handleSubmit}>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-relaxed text-text-body/90">
          가입할 때 등록한 이메일로 비밀번호 재설정 링크를 보내드려요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        {status === "sent" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p role="status" className="rounded bg-white/10 px-3 py-2 text-sm font-bold text-white">
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
              <p role="alert" className="mt-1 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
                {formError}
              </p>
            )}

            {status === "rateLimited" && (
              <p role="alert" className="mt-1 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
                {REQUEST_RATE_LIMITED_MESSAGE}
              </p>
            )}
            {status === "failed" && (
              <p role="alert" className="mt-1 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
                {REQUEST_FAILED_MESSAGE}
              </p>
            )}

            <AuthImageButton
              type="submit"
              src="/button/버튼 프레임1.png"
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

        <button type="button" onClick={handleBack} className="auth-text-link mt-2">뒤로 가기</button>
      </div>
    </AuthScene>
  )
}

// AC-03: EXPIRED·USED·INVALID는 원인이 다르므로 안내 문구도 사유별로 나눕니다 — 세 상태를
// 하나의 문구로 합치면 사용자가 "왜" 다시 요청해야 하는지 알 수 없습니다.
const LINK_EXPIRED_MESSAGE = "링크가 만료됐어요. 비밀번호 재설정을 다시 요청해주세요."
const LINK_USED_MESSAGE = "이미 사용된 링크예요. 비밀번호가 이미 재설정되었다면 새 비밀번호로 로그인해주세요."
const LINK_INVALID_MESSAGE = "유효하지 않은 링크예요. 이메일에 있는 링크 주소를 다시 확인해주세요."
const VERIFY_FAILED_MESSAGE = "서버와 통신할 수 없습니다. 다시 확인해주세요."
const CONFIRM_RETRY_MESSAGE = "서버와 통신할 수 없습니다. 잠시 후 다시 시도해주세요."
const DONE_MESSAGE = "비밀번호가 재설정되었어요. 새 비밀번호로 다시 로그인해주세요."
const SOCIAL_ONLY_MESSAGE = "소셜 로그인으로 가입한 계정이에요. 소셜 로그인 버튼으로 로그인해주세요."

// ── 링크 도착 화면(/password-reset) ────────────────────────────────────────────
// GET 검증은 소비하지 않는 조회이고, 새 비밀번호 제출(POST confirm)만 토큰을 소비합니다.
export function PasswordResetPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") || ""

  // verifying | ready | linkInvalid | verifyFailed | submitting | done | socialOnly
  const [status, setStatus] = useState(token ? "verifying" : "linkInvalid")
  // linkInvalid 화면에서 어떤 문구를 보여줄지 결정합니다: EXPIRED | USED | INVALID.
  // 토큰이 아예 없는 링크는 형식부터 잘못된 것이므로 INVALID로 취급합니다.
  const [linkInvalidReason, setLinkInvalidReason] = useState(token ? "" : "INVALID")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [formError, setFormError] = useState("")
  const [verifyReloadKey, setVerifyReloadKey] = useState(0)

  const submittingRef = useRef(false)
  const unmountedRef = useRef(false)
  // confirm 응답이 도착했을 때, 그 사이 token이 바뀌었으면(늦은 응답) 버리기 위한 최신 token
  // 참조입니다 — closure가 캡처한 제출 당시 token과 비교합니다.
  const tokenRef = useRef(token)
  // StrictMode가 effect를 마운트 → 정리 → 재마운트로 두 번 돌려도 같은 token이면 GET verify를
  // 한 번만 시작하도록, token별로 진행 중인 Promise를 재사용합니다.
  const verifyPromiseCacheRef = useRef(new Map())

  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  // token이 바뀌면 이전 입력·오류·잠금을 지웁니다 — A의 화면 상태가 B로 새어 들어가지
  // 않습니다.
  useEffect(() => {
    setPassword("")
    setPasswordConfirm("")
    setFormError("")
    setLinkInvalidReason(token ? "" : "INVALID")
    submittingRef.current = false
  }, [token])

  useEffect(() => {
    if (!token) {
      setLinkInvalidReason("INVALID")
      setStatus("linkInvalid")
      return
    }

    let cancelled = false
    setStatus("verifying")

    let promise = verifyPromiseCacheRef.current.get(token)
    if (!promise) {
      promise = verifyPasswordResetApi({ token })
      verifyPromiseCacheRef.current.set(token, promise)
    }

    promise
      .then((result) => {
        if (cancelled || unmountedRef.current) return
        if (result?.ok === true && result.status === "VALID") {
          setStatus("ready")
        } else if (result?.ok === false && (result.code === "EXPIRED" || result.code === "USED" || result.code === "INVALID")) {
          setLinkInvalidReason(result.code)
          setStatus("linkInvalid")
        } else {
          // 예상 밖 본문(ok도 code도 알아볼 수 없는 형태)은 무효로 단정하지 않고 통신
          // 실패와 같은 재시도 가능한 상태로 처리합니다 — 캐시도 지워 "다시 확인"이 새
          // 요청을 만들게 합니다.
          verifyPromiseCacheRef.current.delete(token)
          setStatus("verifyFailed")
        }
      })
      .catch(() => {
        // 실패한 Promise는 캐시에서 지워야 "다시 확인" 클릭이 새 요청을 만듭니다.
        verifyPromiseCacheRef.current.delete(token)
        if (cancelled || unmountedRef.current) return
        setStatus("verifyFailed")
      })

    return () => { cancelled = true }
  }, [token, verifyReloadKey])

  // 검증 통신 오류(네트워크·5xx·예상 밖 응답)에서만 사용자가 명시적으로 다시 검증합니다 —
  // 화면 진입 자체는 재호출을 만들지 않습니다.
  const retryVerify = () => {
    verifyPromiseCacheRef.current.delete(token)
    setVerifyReloadKey((k) => k + 1)
  }

  const submitConfirm = () => {
    submittingRef.current = true
    setFormError("")
    setStatus("submitting")
    const submittedToken = token

    confirmPasswordResetApi({ token: submittedToken, newPassword: password })
      .then((result) => {
        submittingRef.current = false
        if (unmountedRef.current || tokenRef.current !== submittedToken) return

        if (result?.ok === true) {
          setPassword("")
          setPasswordConfirm("")
          setStatus("done")
        } else {
          // 예상 밖 성공 본문(ok:true가 아닌 형태)은 완료로 처리하지 않습니다 — 입력을
          // 보존한 채 ready로 돌아가 재시도 가능한 안내를 보여줍니다.
          setFormError(CONFIRM_RETRY_MESSAGE)
          setStatus("ready")
        }
      })
      .catch((error) => {
        submittingRef.current = false
        if (unmountedRef.current || tokenRef.current !== submittedToken) return

        if (error?.code === "SOCIAL_ONLY") {
          setStatus("socialOnly")
        } else if (error?.code === "INVALID_PASSWORD") {
          setFormError(error.message || "비밀번호 조건을 다시 확인해주세요.")
          setStatus("ready")
        } else if (error?.code === "INVALID" || error?.code === "EXPIRED" || error?.code === "USED") {
          setLinkInvalidReason(error.code)
          setStatus("linkInvalid")
        } else {
          // 통신 실패·429 모두 입력을 보존한 채 ready로 남아 수동 재시도를 안내합니다.
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
          <p role="alert" className="rounded bg-red-500/20 px-3 py-2 text-xs text-red-200">
            {VERIFY_FAILED_MESSAGE}
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
          <p role="alert" className="rounded bg-red-500/20 px-3 py-2 text-xs text-red-200">
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
          <p role="alert" className="rounded bg-red-500/20 px-3 py-2 text-xs text-red-200">
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
          <p role="status" className="rounded bg-white/10 px-3 py-2 text-sm font-bold text-white">
            {DONE_MESSAGE}
          </p>
          <button type="button" onClick={goToLogin} className="auth-text-link">로그인으로 이동</button>
        </div>
      </AuthScene>
    )
  }

  // ready | submitting
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
            <p role="alert" className="mt-1 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
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
