// 친구 목록 한 줄 (별·초상·이름·접속 상태·즐겨찾기/초대 오류, 누르면 동작 메뉴)
// FriendFolder·ListTab 검색 결과가 친구마다 그림
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"
import { DETAIL_ERROR_CLASS } from "../sheetStyle.js"
import RowShell from "../parts/RowShell.jsx"
import OnlineStatus from "../parts/OnlineStatus.jsx"
import FavoriteStar from "./FavoriteStar.jsx"

// 즐겨찾기·초대 상태는 줄마다 스토어에서 골라 다른 줄이 다시 그려지지 않게 함 (데스크톱 FriendListRow와 같음)
export default function FriendRow({ friend, onOpenMenu }) {
  const { id, name } = friend
  const online = friend.online || friend.status === "ONLINE"
  const isFavorite = useFriendStore((state) => state.favoriteFriendIds.has(id))
  const saving = useFriendStore((state) => state.favoritePendingIds.has(id))
  const favoriteError = useFriendStore((state) => state.favoriteErrors[id] ?? null)
  const setFavorite = useFriendStore((state) => state.setFavorite)
  const sendError = useGameInviteStore((state) => state.sendErrors[id] ?? null)

  const star = (
    <FavoriteStar
      active={isFavorite}
      saving={saving}
      onToggle={() => { if (!saving) setFavorite(id, !isFavorite) }}
    />
  )

  return (
    <RowShell
      name={name}
      photoId={friend.accountProfilePhotoId}
      borderId={friend.accountProfileBorderId}
      lead={star}
      onOpen={() => onOpenMenu(friend)}
      openLabel={`${name} 메뉴 열기`}
      rowProps={{ "data-friend-id": id }}
    >
      <OnlineStatus status={online ? "ONLINE" : "OFFLINE"} />
      {/* 즐겨찾기·초대 실패 문구는 줄 안에 보임 */}
      {favoriteError !== null ? (
        <p role="status" data-favorite-error={id} className={DETAIL_ERROR_CLASS}>{favoriteError}</p>
      ) : null}
      {sendError !== null ? (
        <p role="status" data-invite-error={id} className={DETAIL_ERROR_CLASS}>{sendError}</p>
      ) : null}
    </RowShell>
  )
}
