// 아이디 찾기 입력 칸·알림·버튼 묶음
// pages/FindIdPage.jsx가 찾기 전 화면에 씀
import AuthInputSlot from "@/domains/auth/components/AuthInputSlot.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { CalendarIcon, ProfileIcon } from "@/domains/auth/components/InputIcons.jsx"
import { AUTH_RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"
import { FIND_ID_TEXT } from "@/domains/auth/constants/recoveryMessages.js"

// 보내는 중엔 fieldset으로 칸·버튼을 한 번에 잠금
export default function FindIdForm({ status, nickname, setNickname, birthDate, setBirthDate, formError, onRetry }) {
  const isFormDisabled = status === "submitting"

  return (
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
          {FIND_ID_TEXT.notFound}
        </p>
      )}
      {status === "rateLimited" && (
        <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
          {FIND_ID_TEXT.rateLimited}
        </p>
      )}
      {status === "failed" && (
        <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
          {FIND_ID_TEXT.failed}
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
        <button type="button" onClick={onRetry} className="auth-text-link mt-1">다시 입력</button>
      )}
      {status === "failed" && (
        <button type="button" onClick={onRetry} className="auth-text-link mt-1">재시도</button>
      )}
    </fieldset>
  )
}
