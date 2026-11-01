// 불러오기 실패 문구와 다시 시도 버튼
// 초대받은 손님 펼침면의 전적 칸·랭킹 칸이 씀
import {
  INVITED_GUESTS_STATE_MESSAGE_CLASS,
  INVITED_GUESTS_STATE_RETRY_BUTTON_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"

export default function InvitedGuestsRetryMessage({ message, onRetry }) {
  return (
    <div className={INVITED_GUESTS_STATE_MESSAGE_CLASS}>
      <p>{message}</p>
      <button type="button" onClick={onRetry} className={INVITED_GUESTS_STATE_RETRY_BUTTON_CLASS}>
        다시 시도
      </button>
    </div>
  )
}
