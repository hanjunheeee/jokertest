// 이메일 중복 확인 결과 한 줄 (확인 중·사용 가능·중복·실패)
// components/SignupForm/SignupFields.jsx가 중복확인 버튼 옆에 겹쳐 씀
import {
  EMAIL_CHECK_MSG_AVAILABLE_CLASS,
  EMAIL_CHECK_MSG_CLASS,
  EMAIL_CHECK_MSG_ERROR_CLASS,
  EMAIL_CHECK_MSG_LAYER_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"

// idle이면 아무것도 안 그림
export default function EmailCheckMessage({ status }) {
  let message = null
  let toneClass = ""

  // 상태별 문구·색
  if (status === "checking") {
    message = "이메일 확인 중..."
    toneClass = "text-white/70"
  } else if (status === "available") {
    message = "사용할 수 있는 이메일입니다."
    toneClass = EMAIL_CHECK_MSG_AVAILABLE_CLASS
  } else if (status === "duplicate") {
    message = "이미 사용 중인 이메일입니다."
    toneClass = EMAIL_CHECK_MSG_ERROR_CLASS
  } else if (status === "error") {
    message = "중복 확인에 실패했습니다. 다시 시도해주세요."
    toneClass = EMAIL_CHECK_MSG_ERROR_CLASS
  }

  if (!message) return null

  return (
    <div className={EMAIL_CHECK_MSG_LAYER_CLASS} aria-live="polite">
      <p className={`${EMAIL_CHECK_MSG_CLASS} ${toneClass}`}>{message}</p>
    </div>
  )
}
