// 친구 줄의 게임 초대 버튼
// FriendListRow가 초대 처리 함수를 받았을 때 그림 (방 id가 있는 패널만 줌)
import { RECOMMENDED_ACTION_BTN_CLASS, RECOMMENDED_ACTION_IMG_CLASS } from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 보내는 중이거나 대기방 확인 전이면 잠그고, 잠긴 이유를 title로 보임
export default function FriendInviteButton({ id, name, onInvite, disabled, sending, disabledReason }) {
  return (
    <button
      type="button"
      className={RECOMMENDED_ACTION_BTN_CLASS}
      aria-label={sending ? `${name} 초대 보내는 중` : `${name} 게임 초대`}
      aria-disabled={disabled || sending}
      disabled={disabled || sending}
      title={disabled ? disabledReason : undefined}
      data-invite-target={id}
      onClick={() => { if (!disabled && !sending) onInvite(id) }}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.friendRequestButton}
        alt=""
        className={RECOMMENDED_ACTION_IMG_CLASS}
      />
    </button>
  )
}
