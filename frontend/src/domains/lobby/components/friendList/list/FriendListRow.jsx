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
  RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS,
  RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS,
  RECOMMENDED_FRIEND_ACTIONS_CLASS,
  FRIEND_LIST_STATUS_DETAIL_ERROR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import FriendListFavoriteStar from "@/domains/lobby/components/friendList/list/FriendListFavoriteStar.jsx"
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

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

function FriendInviteButton({ id, name, onInvite, disabled, sending, disabledReason }) {
  return (
    <button
      type="button"
      className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
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
        className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
      />
    </button>
  )
}

function FriendBlockButton({ id, name, onBlock, processing }) {
  return (
    <button
      type="button"
      className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
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
        className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
      />
    </button>
  )
}

export default function FriendListRow({
  id,
  name,
  online,
  accountProfilePhotoId,
  accountProfileBorderId,
  onInvite = null,
  inviteDisabled = false,
  inviteDisabledReason = undefined,
  onBlock = null,
  blocking = false,
}) {
  const isFavorite = useFriendStore((state) => state.favoriteFriendIds.has(id))
  const isSavingFavorite = useFriendStore((state) => state.favoritePendingIds.has(id))
  const favoriteError = useFriendStore((state) => state.favoriteErrors[id] ?? null)
  const setFavorite = useFriendStore((state) => state.setFavorite)

  const isSendingInvite = useGameInviteStore((state) => state.sendingReceiverIds.has(id))
  const sendError = useGameInviteStore((state) => state.sendErrors[id] ?? null)

  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({ accountProfilePhotoId, accountProfileBorderId })

  return (
    <li className={FRIEND_ROW_ITEM_CLASS} data-friend-id={id}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className={FRIEND_ROW_FRAME_CLASS}
      />
      <div className={FRIEND_ROW_CONTENT_CLASS}>
        <FriendListFavoriteStar
          active={isFavorite}
          onToggle={() => { if (!isSavingFavorite) setFavorite(id, !isFavorite) }}
        />
        <PlayerProfilePortrait
          photoSrc={portraitSrc}
          frameSrc={frameSrc}
          wrapClassName={FRIEND_ROW_PROFILE_PORTRAIT_WRAP_CLASS}
        />
        <div className={FRIEND_ROW_INFO_CLASS}>
          <p className={FRIEND_ROW_NAME_CLASS}>{name}</p>
          <FriendOnlineStatus online={online} />
          {favoriteError !== null ? (
            <p role="status" data-favorite-error={id} className={FRIEND_LIST_STATUS_DETAIL_ERROR_CLASS}>
              {favoriteError}
            </p>
          ) : null}
          {sendError !== null ? (
            <p role="status" data-invite-error={id} className={FRIEND_LIST_STATUS_DETAIL_ERROR_CLASS}>
              {sendError}
            </p>
          ) : null}
        </div>
        {onInvite !== null || onBlock !== null ? (
          <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
            {onInvite !== null ? (
              <FriendInviteButton
                id={id}
                name={name}
                onInvite={onInvite}
                disabled={inviteDisabled}
                sending={isSendingInvite}
                disabledReason={inviteDisabledReason}
              />
            ) : null}
            {onBlock !== null ? (
              <FriendBlockButton id={id} name={name} onBlock={onBlock} processing={blocking} />
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
