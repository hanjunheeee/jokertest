import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import AuthInputSlot, { CalendarIcon, ProfileIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import { AUTH_RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"
import AuthFrameBackButton from "@/domains/auth/components/AuthFrameBackButton.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { findIdApi } from "@/domains/auth/api/auth.api.js"

const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/
const NICKNAME_MIN_LENGTH = 2
const NICKNAME_MAX_LENGTH = 50
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const validateLocalInput = (nickname, birthDate) => {
  const trimmed = nickname.trim()
  if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH || !NICKNAME_PATTERN.test(trimmed)) {
    return { ok: false, message: `닉네임을 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해주세요.` }
  }
  if (!ISO_DATE_PATTERN.test(birthDate)) {
    return { ok: false, message: "생년월일을 선택해주세요." }
  }
  return { ok: true }
}

const NOT_FOUND_MESSAGE = "입력한 정보와 일치하는 계정을 찾을 수 없습니다."
const RATE_LIMITED_MESSAGE = "너무 많은 요청입니다. 잠시 후 다시 시도해주세요."
const FAILED_MESSAGE = "서버와 통신할 수 없습니다. 잠시 후 다시 시도해주세요."

export default function FindIdPage() {
  const navigate = useNavigate()

  const [status, setStatus] = useState("idle")
  const [nickname, setNickname] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [formError, setFormError] = useState("")

  const submittingRef = useRef(false)
  const requestGenerationRef = useRef(0)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  const submit = () => {
    const validation = validateLocalInput(nickname, birthDate)
    if (!validation.ok) {
      setFormError(validation.message)
      return
    }

    submittingRef.current = true
    setFormError("")
    setStatus("submitting")
    const generation = ++requestGenerationRef.current

    findIdApi({ nickname: nickname.trim(), birthDate })
      .then((result) => {
        if (unmountedRef.current || requestGenerationRef.current !== generation) return
        submittingRef.current = false

        const maskedHint = typeof result?.maskedEmail === "string" ? result.maskedEmail.trim() : ""

        if (result?.ok === true && maskedHint !== "") {
          setMaskedEmail(maskedHint)
          setNickname("")
          setBirthDate("")
          setStatus("found")
        } else if (result?.ok === false && result.code === "NOT_FOUND") {
          setStatus("notFound")
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
          setFormError("입력하신 정보를 다시 확인해주세요.")
          setStatus("idle")
        } else {
          setStatus("failed")
        }
      })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (status === "submitting" || submittingRef.current) return
    submit()
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
          가입할 때 입력한 닉네임과 생년월일로 계정을 찾아드려요
        </p>
      </header>

      <div className="mt-6 flex flex-1 flex-col gap-2">
        {status === "found" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body">
              가입하신 이메일은 아래와 같아요
            </p>
            <p role="status" className={`${AUTH_RECOVERY_ALERT_CLASS} text-center`}>
              {maskedEmail}
            </p>
            <button type="button" onClick={backToIdle} className="auth-text-link">다시 찾기</button>
          </div>
        ) : (
          <fieldset disabled={isFormDisabled} className="contents">
            <label className="font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
              닉네임
              <AuthInputSlot
                type="text"
                name="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임을 입력하세요"
                autoComplete="off"
                leadingIcon={<ProfileIcon />}
              />
            </label>

            <label className="mt-1 font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
              생년월일
              <AuthInputSlot
                type="date"
                name="birthDate"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                autoComplete="bday"
                leadingIcon={<CalendarIcon />}
              />
            </label>

            {formError && (
              <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
                {formError}
              </p>
            )}

            {status === "notFound" && (
              <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
                {NOT_FOUND_MESSAGE}
              </p>
            )}
            {status === "rateLimited" && (
              <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
                {RATE_LIMITED_MESSAGE}
              </p>
            )}
            {status === "failed" && (
              <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
                {FAILED_MESSAGE}
              </p>
            )}

            <AuthImageButton
              type="submit"
              src="/button/버튼 프레임2.png"
              label={status === "submitting" ? "조회 중" : "아이디 찾기"}
              visibleLabel={status === "submitting" ? "조회 중" : "아이디 찾기"}
              visibleLabelClassName="app-text-scaled [--app-text-size:16px]"
              disabled={isFormDisabled}
              className="mt-1 cursor-pointer"
            />

            {(status === "notFound" || status === "rateLimited") && (
              <button type="button" onClick={backToIdle} className="auth-text-link mt-1">다시 입력</button>
            )}
            {status === "failed" && (
              <button type="button" onClick={backToIdle} className="auth-text-link mt-1">재시도</button>
            )}
          </fieldset>
        )}
      </div>

      <AuthFrameBackButton onClick={handleBack} />
    </AuthScene>
  )
}
