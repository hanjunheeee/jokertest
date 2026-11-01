// 친구 줄의 차단 버튼
// FriendListRow가 차단 처리 함수가 있을 때 그림
import { RECOMMENDED_ACTION_BTN_CLASS, RECOMMENDED_ACTION_IMG_CLASS } from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 처리 중엔 잠금, 차단해도 친구 관계는 남는다는 걸 title로 알림
export default function FriendBlockButton({ id, name, onBlock, processing }) {
  return (
    <button
      type="button"
      className={RECOMMENDED_ACTION_BTN_CLASS}
      aria-label={processing ? `${name} 차단 처리 중` : `${name} 차단`}
      title={`${name} 차단 — 앞으로 신청·초대를 양쪽 모두 막습니다(친구 관계는 남습니다)`}
      aria-disabled={processing}
      disabled={processing}
      data-block-friend={id}
      onClick={() => { if (!processing) onBlock(id) }}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.friendBlockButton}
        alt=""
        className={RECOMMENDED_ACTION_IMG_CLASS}
      />
    </button>
  )
}
