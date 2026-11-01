// 파일 역할: FindIdPage.jsx - 닉네임+생년월일로 계정을 찾는 공개 라우트(/find-id) 페이지.
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import AuthInputSlot, { CalendarIcon, ProfileIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import { AUTH_RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"
import AuthFrameBackButton from "@/domains/auth/components/AuthFrameBackButton.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { findIdApi } from "@/domains/auth/api/auth.api.js"
import {
  FIND_ID_NICKNAME_WHITESPACE_MESSAGE,
  hasFindIdNicknameWhitespace,
  validateFindIdLocalInput,
} from "@/domains/auth/validation/findIdValidation.js"

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

  const handleNicknameChange = (event) => {
    const next = event.target.value
    setNickname(next)
    if (hasFindIdNicknameWhitespace(next)) {
      setFormError(FIND_ID_NICKNAME_WHITESPACE_MESSAGE)
      return
    }
    setFormError((prev) => (prev === FIND_ID_NICKNAME_WHITESPACE_MESSAGE ? "" : prev))
  }

  const submit = () => {
    const validation = validateFindIdLocalInput(nickname, birthDate)
    if (!validation.ok) {
      setFormError(validation.message)
      return
    }

    submittingRef.current = true
    setFormError("")
    setStatus("submitting")
    const generation = ++requestGenerationRef.current

    findIdApi({ nickname: validation.nickname, birthDate: validation.birthDate })
      .then((result) => {
        // 세대·언마운트 확인을 잠금 해제보다 **먼저** 한다 — 늦게 도착한 옛 응답이 지금
        // 진행 중인 요청의 잠금을 풀면 그 사이 제출이 한 번 더 나갈 수 있다.
        if (unmountedRef.current || requestGenerationRef.current !== generation) return
        submittingRef.current = false

        // 서버 계약은 {ok:true,maskedEmail}과 {ok:false,code:'NOT_FOUND'} 둘 뿐이다
        // (accountRecovery.controller.js::findId). truthy 비교로 성공을 판정하면 maskedEmail이
        // 비어 있는 본문에도 결과 화면을 열어 빈 힌트를 보여주고, "ok가 아니면 전부 notFound"는
        // 정체를 알 수 없는 본문을 "그런 계정이 없다"는 사실 주장으로 바꾼다. 둘 다 서버가
        // 말하지 않은 것을 화면이 말하는 것이므로, 계약에 정확히 맞을 때만 그 화면으로 간다.
        const maskedHint = typeof result?.maskedEmail === "string" ? result.maskedEmail.trim() : ""

        if (result?.ok === true && maskedHint !== "") {
          setMaskedEmail(maskedHint)
          setNickname("")
          setBirthDate("")
          setStatus("found")
        } else if (result?.ok === false && result.code === "NOT_FOUND") {
          setStatus("notFound")
        } else {
          // 계약 밖 본문은 입력을 보존한 채 재시도 가능한 통신 실패로 남긴다.
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
                onChange={handleNicknameChange}
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
