// 접속 상태 (배지 + 접속 중/오프라인/상태 확인 불가 글자)
// 친구 줄·검색 결과 줄이 이름 아래에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { STATUS_TEXT } from "@/domains/lobby/constants/recommendedFriend.js"

// 모르는 상태는 UNKNOWN으로 모으고, 접속 중이 아니면 배지를 덮어 흐리게 함
export default function OnlineStatus({ status }) {
  const normalized = STATUS_TEXT[status] !== undefined ? status : "UNKNOWN"
  const online = normalized === "ONLINE"
  const colorClass = online ? "text-amber-100/85" : normalized === "OFFLINE" ? "text-white/40" : "text-white/55"

  return (
    <div className="mt-1 flex items-center gap-1.5" data-presence-status={normalized}>
      <span className="relative inline-flex size-4 shrink-0">
        <PublicAsset src={FRIEND_LIST_ASSETS.onlineBadge} alt="" className="h-full w-full select-none" />
        {!online ? <span className="pointer-events-none absolute inset-0 rounded-full bg-black/80" aria-hidden="true" /> : null}
      </span>
      <span className={`app-text-scaled [--app-text-size:12px] leading-none ${colorClass}`}>
        {STATUS_TEXT[normalized]}
      </span>
    </div>
  )
}
