// 이메일 중복 확인 결과 한 줄 (확인 중·사용 가능·중복·실패)
// signup/EmailCheck.jsx가 버튼 옆에 씀, 문구는 데스크톱과 같음

// 상태별 문구·색, idle이면 없음
const MESSAGES = {
  checking: { text: "이메일 확인 중...", tone: "text-black/60" },
  available: { text: "사용할 수 있는 이메일입니다.", tone: "text-emerald-800" },
  duplicate: { text: "이미 사용 중인 이메일입니다.", tone: "text-red-800" },
  error: { text: "중복 확인에 실패했습니다. 다시 시도해주세요.", tone: "text-red-800" },
}

// 좁은 폰에선 줄바꿈 허용 (데스크톱은 한 줄 고정)
export default function EmailCheckMessage({ status }) {
  const message = MESSAGES[status]
  if (!message) return null

  return (
    <p aria-live="polite" className={`min-w-0 flex-1 font-subheading font-bold leading-tight app-text-scaled [--app-text-size:13px] ${message.tone}`}>
      {message.text}
    </p>
  )
}
