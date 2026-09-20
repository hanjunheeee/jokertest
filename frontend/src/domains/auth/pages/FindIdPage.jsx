// 파일 역할: FindIdPage.jsx - 닉네임+생년월일로 계정을 찾는 공개 라우트(/find-id) 페이지.
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import AuthInputSlot from "@/domains/auth/components/AuthInputSlot.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { findIdApi } from "@/domains/auth/api/auth.api.js"

// backend/validation/findIdValidation.js의 닉네임 규칙과 같은 정규화(trim)·문자셋을 여기서도
// 먼저 확인한다 — 서버가 다시 검사하므로 이 자체가 최종 판정은 아니고, 명백히 틀린 입력을
// 보내기 전에 빠르게 걸러내기 위한 것이다.
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
    return { ok: false, message: "생년월일을 YYYY-MM-DD 형식으로 입력해주세요." }
  }
  return { ok: true }
}

const NOT_FOUND_MESSAGE = "입력한 정보와 일치하는 계정을 찾을 수 없습니다."
const RATE_LIMITED_MESSAGE = "너무 많은 요청입니다. 잠시 후 다시 시도해주세요."
const FAILED_MESSAGE = "서버와 통신할 수 없습니다. 잠시 후 다시 시도해주세요."

export default function FindIdPage() {
  const navigate = useNavigate()

  // idle | submitting | found | notFound | rateLimited | failed
  const [status, setStatus] = useState("idle")
  const [nickname, setNickname] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [formError, setFormError] = useState("")

  // 렌더 전에 재제출을 막기 위한 동기 잠금 — setState는 비동기라 status 값만으로는 같은
  // 이벤트 루프 안의 연속 제출(더블 클릭 등)을 막을 수 없다.
  const submittingRef = useRef(false)
  // 요청이 끝나기 전에 다른 요청이 시작되거나 화면이 사라지면, 늦게 도착한 응답이 화면을
  // 되돌리지 않도록 세대 번호와 언마운트 표시로 그 응답을 버린다.
  const requestGenerationRef = useRef(0)
  const unmountedRef = useRef(false)

  // StrictMode 개발 실행은 effect를 마운트 → 정리 → 재마운트 순으로 두 번 돈다. 정리에서
  // unmountedRef를 true로 만든 뒤 다음 마운트에서 false로 되돌리지 않으면, 실제로는 화면에
  // 남아 있는데도 이후의 모든 응답 처리가 "언마운트됨"으로 오판해 버려지고 화면이
  // submitting에 그대로 머문다.
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
        submittingRef.current = false
        if (unmountedRef.current || requestGenerationRef.current !== generation) return

        if (result?.ok) {
          setMaskedEmail(result.maskedEmail)
          setNickname("")
          setBirthDate("")
          setStatus("found")
        } else {
          setStatus("notFound")
        }
      })
      .catch((error) => {
        submittingRef.current = false
        if (unmountedRef.current || requestGenerationRef.current !== generation) return

        if (error?.status === 429) {
          setStatus("rateLimited")
        } else if (error?.status === 400) {
          setFormError("입력하신 정보를 다시 확인해주세요.")
          setStatus("idle")
        } else {
          // 서버가 명확한 status로 응답한 5xx든, 응답 자체를 받지 못한 네트워크 오류든
          // 화면에서는 같은 통신 실패로 다룬다 — 어느 쪽이든 사용자가 할 수 있는 일은
          // "다시 시도"뿐이다.
          setStatus("failed")
        }
      })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (status === "submitting" || submittingRef.current) return
    submit()
  }

  // 실패 계열 화면에서 "다시 입력"/"재시도"를 누르면 입력값은 그대로 두고 idle로만
  // 돌아간다 — 여기서 곧바로 다시 요청을 보내지 않는다(자동 재시도 0회). 다음 요청은
  // 사용자가 제출 버튼을 다시 눌러야 나간다.
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
          가입할 때 입력한 닉네임과 생년월일로 계정을 찾아드려요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        {status === "found" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body">
              가입하신 이메일은 아래와 같아요
            </p>
            <p role="status" className="rounded bg-white/10 px-3 py-2 text-sm font-bold text-white">
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
              />
            </label>

            <label className="mt-1 font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
              생년월일
              <AuthInputSlot
                type="text"
                name="birthDate"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="YYYY-MM-DD"
                autoComplete="off"
              />
            </label>

            {formError && (
              <p role="alert" className="mt-1 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
                {formError}
              </p>
            )}

            {status === "notFound" && (
              <p role="alert" className="mt-1 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
                {NOT_FOUND_MESSAGE}
              </p>
            )}
            {status === "rateLimited" && (
              <p role="alert" className="mt-1 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
                {RATE_LIMITED_MESSAGE}
              </p>
            )}
            {status === "failed" && (
              <p role="alert" className="mt-1 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
                {FAILED_MESSAGE}
              </p>
            )}

            <AuthImageButton
              type="submit"
              src="/button/버튼 프레임1.png"
              label={status === "submitting" ? "조회 중" : "아이디 찾기"}
              visibleLabel={status === "submitting" ? "조회 중" : "아이디 찾기"}
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

        <button type="button" onClick={handleBack} className="auth-text-link mt-2">뒤로 가기</button>
      </div>
    </AuthScene>
  )
}
