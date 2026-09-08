import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  FRIEND_ROW_CONTENT_CLASS,
  FRIEND_ROW_FRAME_CLASS,
  FRIEND_ROW_INFO_CLASS,
  FRIEND_ROW_ITEM_CLASS,
  FRIEND_ROW_NAME_CLASS,
  FRIEND_ROW_OFFLINE_OVERLAY_CLASS,
  FRIEND_ROW_PROFILE_PORTRAIT_WRAP_CLASS,
  FRIEND_ROW_STATUS_BADGE_CLASS,
  FRIEND_ROW_STATUS_TEXT_CLASS,
  FRIEND_ROW_STATUS_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import FriendListFavoriteStar from "@/domains/lobby/components/friendList/list/FriendListFavoriteStar.jsx"
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"

// 친구가 현재 접속 중인지 오프라인인지 보여줍니다.
function FriendOnlineStatus({ online }) {
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

// 친구 목록에서 친구 한 명을 보여주는 row 컴포넌트입니다.
export default function FriendListRow({ id, name, online }) {
  const isFavorite = useFriendStore((state) => state.favoriteFriendIds.has(id))
  const toggleFavorite = useFriendStore((state) => state.toggleFavorite)

  return (
    <li className={FRIEND_ROW_ITEM_CLASS}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className={FRIEND_ROW_FRAME_CLASS}
      />
      <div className={FRIEND_ROW_CONTENT_CLASS}>
        <FriendListFavoriteStar
          active={isFavorite}
          onToggle={() => toggleFavorite(id)}
        />
        <PlayerProfilePortrait wrapClassName={FRIEND_ROW_PROFILE_PORTRAIT_WRAP_CLASS} />
        <div className={FRIEND_ROW_INFO_CLASS}>
          <p className={FRIEND_ROW_NAME_CLASS}>{name}</p>
          <FriendOnlineStatus online={online} />
        </div>
      </div>
    </li>
  )
}
