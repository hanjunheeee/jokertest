// 친구 줄의 접속 상태 (배지 + 접속 중/오프라인 글자)
// FriendListRow가 이름 아래에 그림
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import {
  FRIEND_ROW_OFFLINE_OVERLAY_CLASS,
  FRIEND_ROW_STATUS_BADGE_CLASS,
  FRIEND_ROW_STATUS_TEXT_CLASS,
  FRIEND_ROW_STATUS_WRAP_CLASS,
} from "../../../../constants/friendListStyle.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 오프라인이면 배지 위에 덮개를 씌우고 글자색을 흐리게 함
export default function FriendOnlineStatus({ online }) {
  const statusText = online ? "접속 중" : "오프라인"
  const statusColorClass = online ? "text-amber-100/85" : "text-white/35"

  return (
    <div className={FRIEND_ROW_STATUS_WRAP_CLASS}>
      <span className={FRIEND_ROW_STATUS_BADGE_CLASS}>
        <PublicAsset
          src={FRIEND_LIST_ASSETS.onlineBadge}
          alt=""
          className="h-full w-full select-none"
        />
        {!online ? (
          <span className={FRIEND_ROW_OFFLINE_OVERLAY_CLASS} aria-hidden="true" />
        ) : null}
      </span>
      <span className={`${FRIEND_ROW_STATUS_TEXT_CLASS} ${statusColorClass}`}>
        {statusText}
      </span>
    </div>
  )
}
