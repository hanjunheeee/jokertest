// 게임 초대 줄의 거절·수락 버튼
// GameInviteRow가 아직 누를 수 있는 초대일 때 그림
import {
  RECOMMENDED_ACTION_BTN_CLASS,
  RECOMMENDED_ACTION_IMG_CLASS,
  RECOMMENDED_ACTIONS_CLASS,
} from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 처리 중엔 두 버튼 다 잠가 중복 요청을 막음
export default function GameInviteRowActions({ inviteId, onAccept, onDecline, processing }) {
  return (
    <div className={RECOMMENDED_ACTIONS_CLASS}>
      <button
        type="button"
        className={RECOMMENDED_ACTION_BTN_CLASS}
        aria-label="초대 거절"
        aria-disabled={processing}
        disabled={processing}
        data-decline-invite={inviteId}
        onClick={() => { if (!processing) onDecline(inviteId) }}
        style={{ outline: "none" }}
      >
        <PublicAsset src={FRIEND_LIST_ASSETS.friendBlockButton} alt="" className={RECOMMENDED_ACTION_IMG_CLASS} />
      </button>
      <button
        type="button"
        className={RECOMMENDED_ACTION_BTN_CLASS}
        aria-label={processing ? "초대 수락 처리 중" : "초대 수락"}
        aria-disabled={processing}
        disabled={processing}
        data-accept-invite={inviteId}
        onClick={() => { if (!processing) onAccept(inviteId) }}
        style={{ outline: "none" }}
      >
        <PublicAsset src={FRIEND_LIST_ASSETS.friendAcceptButton} alt="" className={RECOMMENDED_ACTION_IMG_CLASS} />
      </button>
    </div>
  )
}
