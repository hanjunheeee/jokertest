// 이메일 중복 확인 결과 한 줄 (확인 중·사용 가능·중복·실패)
// signup/EmailCheck.jsx가 버튼 옆에 씀, 문구·색은 데스크톱 EmailCheckMessage와 같음
import {
  EMAIL_CHECK_MSG_AVAILABLE_CLASS,
  EMAIL_CHECK_MSG_ERROR_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"

// 상태별 문구·색, idle이면 없음
const MESSAGES = {
  checking: { text: "이메일 확인 중...", tone: "text-white/70" },
  available: { text: "사용할 수 있는 이메일입니다.", tone: EMAIL_CHECK_MSG_AVAILABLE_CLASS },
  duplicate: { text: "이미 사용 중인 이메일입니다.", tone: EMAIL_CHECK_MSG_ERROR_CLASS },
  error: { text: "중복 확인에 실패했습니다. 다시 시도해주세요.", tone: EMAIL_CHECK_MSG_ERROR_CLASS },
}

// 좁은 폰에선 낱말 단위 줄바꿈 허용 (데스크톱은 한 줄 고정)
export default function EmailCheckMessage({ status }) {
  const message = MESSAGES[status]
  if (!message) return null

  return (
    <p aria-live="polite" className={`min-w-0 flex-1 break-keep text-right leading-tight app-text-scaled [--app-text-size:13px] ${message.tone}`}>
      {message.text}
    </p>
  )
}
