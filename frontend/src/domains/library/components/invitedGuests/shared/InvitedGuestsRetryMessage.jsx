// 불러오기 실패 문구와 다시 시도 버튼
// 초대받은 손님 펼침면의 전적 칸·랭킹 칸이 씀
import {
  STATE_MSG_CLASS,
  STATE_RETRY_BTN_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"

// 실패 문구 + 누르면 다시 요청하는 버튼
export default function InvitedGuestsRetryMessage({ message, onRetry }) {
  return (
    <div className={STATE_MSG_CLASS}>
      <p>{message}</p>
      <button type="button" onClick={onRetry} className={STATE_RETRY_BTN_CLASS}>
        다시 시도
      </button>
    </div>
  )
}
