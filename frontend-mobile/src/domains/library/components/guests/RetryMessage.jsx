// 불러오기 실패 문구와 다시 시도 버튼
// guests/MyStats.jsx·guests/RankingSection.jsx가 씀
import { INK_BUTTON_CLASS, STATE_MSG_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 실패 문구 + 누르면 다시 요청
export default function RetryMessage({ message, onRetry }) {
  return (
    <div className="flex flex-col items-start gap-1" role="alert">
      <p className={`m-0 ${STATE_MSG_CLASS}`}>{message}</p>
      <button type="button" onClick={onRetry} className={`${INK_BUTTON_CLASS} -ml-3 underline underline-offset-2`}>
        다시 시도
      </button>
    </div>
  )
}
