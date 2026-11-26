// 이메일 중복 확인 결과 한 줄 (확인 중·사용 가능·중복·실패)
// signup/EmailCheck.jsx가 버튼 옆에 씀, 문구·색은 데스크톱 EmailCheckMessage와 같음
import {
  EMAIL_CHECK_MSG_AVAILABLE_CLASS,
  EMAIL_CHECK_MSG_ERROR_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"

// 좁은 폰에선 낱말 단위 줄바꿈 허용, 429 막힘이면 서버가 준 errorMessage를 그대로 보임
export default function EmailCheckMessage({ status, errorMessage = null }) {
  let text = null
  let tone = ""

  if (status === "checking") {
    text = "이메일 확인 중..."
    tone = "text-[#2b1d0e]"
  } else if (status === "available") {
    text = "사용할 수 있는 이메일입니다."
    tone = EMAIL_CHECK_MSG_AVAILABLE_CLASS
  } else if (status === "duplicate") {
    text = "이미 사용 중인 이메일입니다."
    tone = EMAIL_CHECK_MSG_ERROR_CLASS
  } else if (status === "error") {
    text = errorMessage || "중복 확인에 실패했습니다. 다시 시도해주세요."
    tone = EMAIL_CHECK_MSG_ERROR_CLASS
  }

  if (!text) return null

  return (
    <p aria-live="polite" className={`min-w-0 flex-1 break-keep text-left leading-tight app-text-scaled [--app-text-size:13px] ${tone}`}>
      {text}
    </p>
  )
}
