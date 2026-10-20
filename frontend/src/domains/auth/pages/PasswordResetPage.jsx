// 파일 역할: PasswordResetPage.jsx - 비밀번호 재설정 요청(/password-reset/request)과 링크 도착
// (/password-reset) 두 공개 라우트 페이지입니다.
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { AUTH_RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import AuthInputSlot, { MailIcon, LockIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import AuthFrameBackButton from "@/domains/auth/components/AuthFrameBackButton.jsx"
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

// AC-01/AC-05: 완료 안내는 "접수했다"까지만 말합니다 — 서버 응답({ok:true})은 계정이 있었다는
// 뜻도, 메일이 실제로 발송·도착했다는 뜻도 아닙니다(backend/service/passwordReset.service.js는
// 계정 없음·소셜 전용·발송 실패를 모두 같은 {ok:true}로 수렴시킵니다). 발송을 단정하면 화면이
// 응답에 없는 사실을 말하게 되고, 미등록 이메일을 넣은 사람에게 "그 계정이 있다"는 신호가 됩니다.
const REQUEST_SENT_MESSAGE = "재설정 요청을 접수했어요. 입력하신 주소로 가입된 계정이 있다면 재설정 링크가 담긴 메일이 도착합니다. 메일이 보이지 않으면 스팸함까지 확인한 뒤 아래 '다시 보내기'를 눌러주세요."
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
        // 세대·언마운트 확인을 잠금 해제보다 **먼저** 합니다 — 늦게 도착한 옛 응답이 지금
        // 진행 중인 요청의 잠금을 풀어 버리면, 그 사이 제출이 한 번 더 나갈 수 있습니다.
        if (unmountedRef.current || requestGenerationRef.current !== generation) return
        submittingRef.current = false

        // 계약은 {ok:true} 하나뿐입니다(passwordReset.controller.js::requestPasswordReset).
        // ok:'true'·{sent:1} 같은 계약 밖 200 본문을 truthy 비교로 완료 처리하면, 서버가
        // 실제로 무엇을 했는지 모르는 채 "접수됐다"고 말하게 됩니다 — 입력을 보존한 채
        // 재시도 가능한 실패로 남깁니다.
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

// AC-03: EXPIRED·USED·INVALID는 원인이 다르므로 안내 문구도 사유별로 나눕니다 — 세 상태를
// 하나의 문구로 합치면 사용자가 "왜" 다시 요청해야 하는지 알 수 없습니다.
const LINK_EXPIRED_MESSAGE = "링크가 만료됐어요. 비밀번호 재설정을 다시 요청해주세요."
const LINK_USED_MESSAGE = "이미 사용된 링크예요. 비밀번호가 이미 재설정되었다면 새 비밀번호로 로그인해주세요."
const LINK_INVALID_MESSAGE = "유효하지 않은 링크예요. 이메일에 있는 링크 주소를 다시 확인해주세요."
const VERIFY_FAILED_MESSAGE = "서버와 통신할 수 없습니다. 다시 확인해주세요."
const CONFIRM_RETRY_MESSAGE = "서버와 통신할 수 없습니다. 잠시 후 다시 시도해주세요."
// AC-01: verify·confirm은 IP별 합산 제한 하나를 공유합니다(backend/routes/auth.routes.js의
// passwordResetCheckIpRateLimiter) — 429는 "통신 실패"가 아니라 "지금은 더 보낼 수 없다"이므로
// 안내를 분리하고, 자동 재호출은 하지 않습니다(사용자가 직접 다시 눌러야 다음 요청이 나갑니다).
const VERIFY_RATE_LIMITED_MESSAGE = "확인 요청이 너무 많습니다. 잠시 후 '다시 확인'을 눌러주세요."
const CONFIRM_RATE_LIMITED_MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
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
  const [verifyFailedMessage, setVerifyFailedMessage] = useState(VERIFY_FAILED_MESSAGE)
  const [verifyReloadKey, setVerifyReloadKey] = useState(0)

  const submittingRef = useRef(false)
  const unmountedRef = useRef(false)
  // "방문 세대"입니다 — token이 실제로 **바뀔 때만** 증가합니다(StrictMode의 이중 effect는
  // 같은 token으로 다시 돌므로 증가하지 않습니다). 토큰 문자열만 비교하면 A→B→A에서 첫 A의
  // 늦은 응답이 다시 같은 문자열을 보고 "내 것"이라 착각합니다 — 세대 번호는 같은 토큰으로
  // 돌아온 새 방문도 다른 방문으로 구분합니다.
  const visitIdRef = useRef(0)
  const visitedTokenRef = useRef(null)
  // 같은 방문 안에서만 진행 중인 GET verify Promise를 재사용합니다 — StrictMode 이중 effect는
  // 호출 1회로 합치고, 새 방문(A→B→A)은 서버 상태를 다시 조회합니다.
  const verifyCacheRef = useRef({ key: "", promise: null })
  // confirm 요청 번호입니다 — 같은 방문 안에서도 앞선 제출의 늦은 응답이 새 제출의 잠금·화면을
  // 건드리지 못하게 합니다.
  const confirmRequestRef = useRef(0)

  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

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
    // token이 바뀐 진입만 새 방문입니다. StrictMode가 같은 token으로 effect를 한 번 더 돌 때는
    // 여기서 세대가 오르지 않아 아래 캐시가 그대로 맞고, GET은 한 번만 나갑니다.
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
          // 예상 밖 본문(ok도 code도 알아볼 수 없는 형태)은 무효로 단정하지 않고 통신
          // 실패와 같은 재시도 가능한 상태로 처리합니다 — 캐시도 지워 "다시 확인"이 새
          // 요청을 만들게 합니다.
          verifyCacheRef.current = { key: "", promise: null }
          setVerifyFailedMessage(VERIFY_FAILED_MESSAGE)
          setStatus("verifyFailed")
        }
      })
      .catch((error) => {
        // 실패한 Promise는 캐시에서 지워야 "다시 확인" 클릭이 새 요청을 만듭니다.
        verifyCacheRef.current = { key: "", promise: null }
        if (cancelled || unmountedRef.current || visitIdRef.current !== visitId) return
        setVerifyFailedMessage(error?.status === 429 ? VERIFY_RATE_LIMITED_MESSAGE : VERIFY_FAILED_MESSAGE)
        setStatus("verifyFailed")
      })

    return () => { cancelled = true }
  }, [token, verifyReloadKey])

  // 검증 통신 오류(네트워크·5xx·429·예상 밖 응답)에서만 사용자가 명시적으로 다시 검증합니다 —
  // 화면 진입 자체는 재호출을 만들지 않습니다.
  const retryVerify = () => {
    verifyCacheRef.current = { key: "", promise: null }
    setVerifyReloadKey((k) => k + 1)
  }

  const submitConfirm = () => {
    submittingRef.current = true
    setFormError("")
    setStatus("submitting")
    const submittedToken = token
    // 제출 당시의 방문 세대와 요청 번호를 함께 기록합니다 — 응답이 이 둘과 모두 맞을 때만
    // 잠금과 화면을 움직입니다. 토큰 문자열만 비교하면 A→B→A 재진입 후의 새 제출을 첫 A의
    // 늦은 응답이 덮어써 버립니다.
    const submittedVisitId = visitIdRef.current
    const requestId = ++confirmRequestRef.current
    const isStale = () => (
      unmountedRef.current
      || visitIdRef.current !== submittedVisitId
      || confirmRequestRef.current !== requestId
    )

    confirmPasswordResetApi({ token: submittedToken, newPassword: password })
      .then((result) => {
        // 잠금 해제보다 소속 확인이 먼저입니다(요청 화면과 같은 이유).
        if (isStale()) return
        submittingRef.current = false

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
        if (isStale()) return
        submittingRef.current = false

        // 알려진 사유는 서버가 실제로 그 사유로 **거부**했을 때만 적용합니다. 서버 계약은
        // 400 {ok:false, code} 하나뿐입니다(passwordReset.controller.js) — 그래서 거부 상태
        // (400)와 본문의 ok:false를 **둘 다** 확인합니다. 둘 중 하나라도 어긋나는 응답
        // (400인데 ok:true, 5xx·429에 같은 code 문자열이 섞인 본문)은 계약 밖이므로 링크
        // 무효·소셜 전용으로 확정하지 않고 재시도 가능한 상태로 둡니다(설계도 §2-8).
        // ok는 shared/api/response.js의 toApiError가 본문에서 그대로 실어 옵니다.
        const rejectedWithCode = (error?.status === 400 && error?.ok === false) ? error.code : undefined

        if (error?.status === 429) {
          // 제한은 입력을 보존한 채 ready로 남고, 자동 재시도는 하지 않습니다.
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
          // 통신 실패·5xx 모두 입력을 보존한 채 ready로 남아 수동 재시도를 안내합니다.
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
