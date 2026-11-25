// 친구 목록 한 줄 (별·초상·이름·접속 상태·즐겨찾기/초대 오류·초대/차단 버튼)
// FriendFolder·ListTab 검색 결과가 친구마다 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  FRIEND_ROW_FRAME_CLASS,
  FRIEND_ROW_INFO_CLASS,
  FRIEND_ROW_ITEM_CLASS,
  FRIEND_ROW_NAME_CLASS,
  RECOMMENDED_ACTIONS_CLASS,
  ROW_CONTENT_CLASS,
  STATUS_DETAIL_ERROR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"
import ProfilePortrait from "@m/shared/ui/portrait/ProfilePortrait.jsx"
import OnlineStatus from "../parts/OnlineStatus.jsx"
import IconAction from "../parts/IconAction.jsx"
import FavoriteStar from "./FavoriteStar.jsx"

// 데스크톱 FriendListRow와 같은 겹침, 즐겨찾기·초대 상태는 줄마다 스토어에서 골라 다른 줄이 다시 그려지지 않게 함
// 초대 버튼은 방 id가 있는 곳(대기방)만, 차단 버튼은 늘 보임
export default function FriendRow({ friend, invite = null, block = null }) {
  const { id, name } = friend
  const online = friend.online || friend.status === "ONLINE"
  const isFavorite = useFriendStore((state) => state.favoriteFriendIds.has(id))
  const saving = useFriendStore((state) => state.favoritePendingIds.has(id))
  const favoriteError = useFriendStore((state) => state.favoriteErrors[id] ?? null)
  const setFavorite = useFriendStore((state) => state.setFavorite)
  const sending = useGameInviteStore((state) => state.sendingReceiverIds.has(id))
  const sendError = useGameInviteStore((state) => state.sendErrors[id] ?? null)
  const blocking = block?.blockingIds?.has(id) ?? false

  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: friend.accountProfilePhotoId,
    accountProfileBorderId: friend.accountProfileBorderId,
  })

  return (
    <li className={FRIEND_ROW_ITEM_CLASS} data-friend-id={id}>
      <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={FRIEND_ROW_FRAME_CLASS} />
      <div className={ROW_CONTENT_CLASS}>
        {/* 저장 중엔 별을 눌러도 다시 안 보냄 */}
        <FavoriteStar active={isFavorite} onToggle={() => { if (!saving) setFavorite(id, !isFavorite) }} />
        <ProfilePortrait photoSrc={portraitSrc} frameSrc={frameSrc} className="z-[2] size-[3.6rem]" aria-hidden="true" />
        <div className={FRIEND_ROW_INFO_CLASS}>
          <p className={FRIEND_ROW_NAME_CLASS}>{name}</p>
          <OnlineStatus status={online ? "ONLINE" : "OFFLINE"} look="row" />
          {favoriteError !== null ? (
            <p role="status" data-favorite-error={id} className={STATUS_DETAIL_ERROR_CLASS}>{favoriteError}</p>
          ) : null}
          {sendError !== null ? (
            <p role="status" data-invite-error={id} className={STATUS_DETAIL_ERROR_CLASS}>{sendError}</p>
          ) : null}
        </div>
        {invite !== null || block !== null ? (
          <div className={RECOMMENDED_ACTIONS_CLASS}>
            {invite !== null ? (
              <IconAction
                src={FRIEND_LIST_ASSETS.friendRequestButton}
                label={sending ? `${name} 초대 보내는 중` : `${name} 게임 초대`}
                disabled={invite.disabled || sending}
                title={invite.disabled ? invite.disabledReason : undefined}
                data-invite-target={id}
                onClick={() => invite.onInvite(id)}
              />
            ) : null}
            {block !== null ? (
              <IconAction
                src={FRIEND_LIST_ASSETS.friendBlockButton}
                label={blocking ? `${name} 차단 처리 중` : `${name} 차단`}
                disabled={blocking}
                title={`${name} 차단 — 앞으로 신청·초대를 양쪽 모두 막습니다(친구 관계는 남습니다)`}
                data-block-friend={id}
                onClick={() => block.onBlock(id)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
