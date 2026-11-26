// 친구 목록 한 줄 (별·초상·이름·접속 상태·오류·초대/차단/끊기 단추)
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
  ROW_FRAME_WRAP_CLASS,
  STATUS_DETAIL_ERROR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { useUnfriendRow } from "@/domains/lobby/hooks/friendPanel/useUnfriendRow.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"
import ProfilePortrait from "@m/shared/ui/portrait/ProfilePortrait.jsx"
import OnlineStatus from "../parts/OnlineStatus.jsx"
import IconAction from "../parts/IconAction.jsx"
import FavoriteStar from "./FavoriteStar.jsx"
import { UnfriendActions, UnfriendNotice } from "./UnfriendActions.jsx"

// 초대 단추는 방 id가 있는 대기방만, 친구 끊기는 초대 단추가 없는 로비 친구 시트에만 둠
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
  const blockError = block?.blockErrors?.[id] ?? null

  const unfriendRow = useUnfriendRow(id)
  const confirmingUnfriend = unfriendRow.confirming
  const showUnfriend = invite === null && block !== null

  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: friend.accountProfilePhotoId,
    accountProfileBorderId: friend.accountProfileBorderId,
  })

  return (
    <li className={FRIEND_ROW_ITEM_CLASS} data-friend-id={id}>
      <div className={ROW_FRAME_WRAP_CLASS}>
        <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={FRIEND_ROW_FRAME_CLASS} />
        <div className={ROW_CONTENT_CLASS}>
          {/* 저장 중엔 별을 눌러도 다시 안 보냄 */}
          <FavoriteStar active={isFavorite} onToggle={() => { if (!saving) setFavorite(id, !isFavorite) }} />
          <ProfilePortrait photoSrc={portraitSrc} frameSrc={frameSrc} className="z-[2] size-[3.6rem]" aria-hidden="true" />
          <div className={FRIEND_ROW_INFO_CLASS}>
            <p className={FRIEND_ROW_NAME_CLASS}>{name}</p>
            <OnlineStatus status={online ? "ONLINE" : "OFFLINE"} look="row" />
          </div>
          {invite !== null || block !== null ? (
            <div className={RECOMMENDED_ACTIONS_CLASS}>
              {invite !== null && !confirmingUnfriend ? (
                <IconAction
                  src={FRIEND_LIST_ASSETS.friendRequestButton}
                  label={sending ? `${name} 초대 보내는 중` : `${name} 게임 초대`}
                  disabled={invite.disabled || sending}
                  title={invite.disabled ? invite.disabledReason : undefined}
                  data-invite-target={id}
                  onClick={() => invite.onInvite(id)}
                />
              ) : null}
              {block !== null && !confirmingUnfriend ? (
                <IconAction
                  src={FRIEND_LIST_ASSETS.friendBlockButton}
                  label={blocking ? `${name} 차단 처리 중` : `${name} 차단`}
                  disabled={blocking}
                  title={`${name} 차단 — 앞으로 신청·초대를 양쪽 모두 막습니다(친구 관계는 남습니다)`}
                  data-block-friend={id}
                  onClick={() => block.onBlock(id)}
                />
              ) : null}
              {showUnfriend ? <UnfriendActions id={id} name={name} {...unfriendRow} /> : null}
            </div>
          ) : null}
        </div>
      </div>
      {favoriteError !== null ? (
        <p role="status" data-favorite-error={id} className={STATUS_DETAIL_ERROR_CLASS}>{favoriteError}</p>
      ) : null}
      {blockError !== null ? (
        <p role="status" data-block-error={id} className={STATUS_DETAIL_ERROR_CLASS}>{blockError}</p>
      ) : null}
      {sendError !== null ? (
        <p role="status" data-invite-error={id} className={STATUS_DETAIL_ERROR_CLASS}>{sendError}</p>
      ) : null}
      <UnfriendNotice id={id} confirming={confirmingUnfriend} error={unfriendRow.error} />
    </li>
  )
}
