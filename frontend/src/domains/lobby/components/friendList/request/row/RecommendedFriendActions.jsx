// 친구 검색 결과 줄의 차단·친구 신청 버튼
// RecommendedFriendRow가 줄 오른쪽에 그림
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import {
  RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS,
  RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS,
  RECOMMENDED_FRIEND_ACTIONS_CLASS,
  RECOMMENDED_FRIEND_SENT_BUTTON_CLASS,
} from "../../../../constants/friendListStyle.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 이미 신청한 상대는 신청 버튼 모양만 바꾸고 다시 보내지 않음
export default function RecommendedFriendActions({ id, name, onSend, onBlock, sent, blocking }) {
  const sendButtonClass = sent
    ? `${RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS} ${RECOMMENDED_FRIEND_SENT_BUTTON_CLASS}`
    : RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS

  const handleSendClick = () => {
    if (sent) return
    onSend?.(id)
  }

  return (
    <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
      <button
        type="button"
        className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
        aria-label={`${name} 차단`}
        aria-disabled={blocking}
        disabled={blocking}
        data-block-target={id}
        onClick={() => { if (!blocking) onBlock?.(id) }}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={FRIEND_LIST_ASSETS.friendBlockButton}
          alt=""
          className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
        />
      </button>
      <button
        type="button"
        className={sendButtonClass}
        aria-label={sent ? "신청 완료" : `${name}에게 친구 신청`}
        onClick={handleSendClick}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={FRIEND_LIST_ASSETS.friendRequestButton}
          alt=""
          className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
        />
      </button>
    </div>
  )
}
