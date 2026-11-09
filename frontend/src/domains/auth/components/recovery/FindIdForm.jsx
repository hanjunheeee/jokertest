// 아이디 찾기 입력 칸·알림·버튼 묶음
// pages/FindIdPage.jsx가 찾기 전 화면에 씀
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { CalendarIcon, ProfileIcon } from "@/shared/ui/InputIcons.jsx"
import RecoveryAlert from "./RecoveryAlert.jsx"
import { FIND_ID_TEXT } from "@/domains/auth/constants/recoveryMessages.js"

// 닉네임·생년월일 입력 칸
function FindIdFields({ nickname, setNickname, birthDate, setBirthDate }) {
  return (
    <>
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
    </>
  )
}

// 보내는 중엔 fieldset으로 칸·버튼을 한 번에 잠금
export default function FindIdForm({ status, nickname, setNickname, birthDate, setBirthDate, formError, onRetry }) {
  const isFormDisabled = status === "submitting"

  return (
    <fieldset disabled={isFormDisabled} className="contents">
      <FindIdFields nickname={nickname} setNickname={setNickname} birthDate={birthDate} setBirthDate={setBirthDate} />

      {formError && <RecoveryAlert>{formError}</RecoveryAlert>}

      {/* 결과 알림: 못 찾음·요청 너무 많음·통신 실패 */}
      {status === "notFound" && <RecoveryAlert>{FIND_ID_TEXT.notFound}</RecoveryAlert>}
      {status === "rateLimited" && <RecoveryAlert>{FIND_ID_TEXT.rateLimited}</RecoveryAlert>}
      {status === "failed" && <RecoveryAlert>{FIND_ID_TEXT.failed}</RecoveryAlert>}

      <AuthImageButton
        type="submit"
        src="/button/버튼 프레임2.webp"
        label={status === "submitting" ? "조회 중" : "아이디 찾기"}
        visibleLabel={status === "submitting" ? "조회 중" : "아이디 찾기"}
        visibleLabelClassName="app-text-scaled [--app-text-size:16px]"
        disabled={isFormDisabled}
        className="mt-1 cursor-pointer"
      />

      {/* 못 찾음·너무 많음이면 다시 입력, 실패면 재시도 (둘 다 입력 화면으로) */}
      {(status === "notFound" || status === "rateLimited") && (
        <button type="button" onClick={onRetry} className="auth-text-link mt-1">다시 입력</button>
      )}
      {status === "failed" && (
        <button type="button" onClick={onRetry} className="auth-text-link mt-1">재시도</button>
      )}
    </fieldset>
  )
}
