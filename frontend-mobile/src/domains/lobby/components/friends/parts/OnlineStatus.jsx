// 접속 상태 (배지 + 접속 중/오프라인/상태 확인 불가 글자)
// 친구 줄(row)·검색 결과 줄(recommended)이 이름 아래에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { STATUS_TEXT } from "@/domains/lobby/constants/recommendedFriend.js"
import {
  RECOMMENDED_OFFLINE_OVERLAY_CLASS,
  RECOMMENDED_STATUS_BADGE_CLASS,
  RECOMMENDED_STATUS_WRAP_CLASS,
  ROW_OFFLINE_OVERLAY_CLASS,
  ROW_STATUS_BADGE_CLASS,
  ROW_STATUS_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"

// 데스크톱 FriendOnlineStatus(row)·RecommendedFriendStatus(recommended) 두 모양
const LOOK = {
  row: { wrap: ROW_STATUS_WRAP_CLASS, badge: ROW_STATUS_BADGE_CLASS, overlay: ROW_OFFLINE_OVERLAY_CLASS },
  recommended: { wrap: RECOMMENDED_STATUS_WRAP_CLASS, badge: RECOMMENDED_STATUS_BADGE_CLASS, overlay: RECOMMENDED_OFFLINE_OVERLAY_CLASS },
}

// 글자색은 데스크톱 그대로, 글자 크기만 폰에서 읽히게 11px
const TEXT_CLASS = "app-text-scaled [--app-text-size:11px] leading-none"

const COLOR_CLASS = {
  ONLINE: "text-amber-100/85",
  OFFLINE: "text-white/35",
  UNKNOWN: "text-white/50",
}

// 모르는 상태는 UNKNOWN으로 모으고, 접속 중이 아니면 배지를 덮어 흐리게 함
export default function OnlineStatus({ status, look = "recommended" }) {
  const normalized = STATUS_TEXT[status] !== undefined ? status : "UNKNOWN"
  const classes = LOOK[look]

  return (
    <div className={classes.wrap} data-presence-status={look === "recommended" ? normalized : undefined}>
      <span className={classes.badge}>
        <PublicAsset src={FRIEND_LIST_ASSETS.onlineBadge} alt="" className="h-full w-full select-none" />
        {normalized !== "ONLINE" ? <span className={classes.overlay} aria-hidden="true" /> : null}
      </span>
      <span className={`${TEXT_CLASS} ${COLOR_CLASS[normalized]}`}>{STATUS_TEXT[normalized]}</span>
    </div>
  )
}
