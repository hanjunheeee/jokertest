// 친구 검색 결과 줄의 접속 상태 (배지 + 글자)
// RecommendedFriendRow가 이름 아래에 그림
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import {
  RECOMMENDED_FRIEND_OFFLINE_OVERLAY_CLASS,
  RECOMMENDED_FRIEND_STATUS_BADGE_CLASS,
  RECOMMENDED_FRIEND_STATUS_TEXT_CLASS,
  RECOMMENDED_FRIEND_STATUS_WRAP_CLASS,
} from "../../../../constants/friendListStyle.js"
import { RECOMMENDED_FRIEND_STATUS_TEXT } from "../../../../constants/recommendedFriend.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 모르는 상태는 UNKNOWN으로 모아 글자·색을 정하고, 접속 중이 아니면 배지를 덮음
export default function RecommendedFriendStatus({ status }) {
  const normalized = RECOMMENDED_FRIEND_STATUS_TEXT[status] !== undefined ? status : "UNKNOWN"
  const statusText = RECOMMENDED_FRIEND_STATUS_TEXT[normalized]
  const statusColorClass = normalized === "ONLINE"
    ? "text-amber-100/85"
    : normalized === "OFFLINE" ? "text-white/35" : "text-white/50"

  return (
    <div className={RECOMMENDED_FRIEND_STATUS_WRAP_CLASS} data-presence-status={normalized}>
      <span className={RECOMMENDED_FRIEND_STATUS_BADGE_CLASS}>
        <PublicAsset src={FRIEND_LIST_ASSETS.onlineBadge} alt="" className="h-full w-full select-none" />
        {normalized !== "ONLINE" ? (
          <span className={RECOMMENDED_FRIEND_OFFLINE_OVERLAY_CLASS} aria-hidden="true" />
        ) : null}
      </span>
      <span className={`${RECOMMENDED_FRIEND_STATUS_TEXT_CLASS} ${statusColorClass}`}>
        {statusText}
      </span>
    </div>
  )
}
