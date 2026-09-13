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
} from "@/domains/lobby/constants/friendListStyle.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import FriendListFavoriteStar from "@/domains/lobby/components/friendList/list/FriendListFavoriteStar.jsx"
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

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

/**
 * F-19(AC-06): 대기방에서만 나타나는 초대 버튼.
 *
 * 로비에는 초대할 방 자체가 없으므로 onInvite를 받지 않고(버튼도 없다), 대기방에서도
 * **방 검증이 끝나기 전에는** 비활성이다. 비활성 상태를 눌러도 호출 경계에서 다시 막고,
 * 그 뒤에도 서버가 발송자의 실제 방 소속을 다시 확인한다 — 세 겹 모두 필요하다.
 */
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

// 친구 목록에서 친구 한 명을 보여주는 row 컴포넌트입니다.
// F-13(AC-05): accountProfilePhotoId/accountProfileBorderId는 친구 목록 API가 실제로
// 내려주는 값이다 — resolveAccountProfileAssets가 없는 값만 기본 자산으로 대체한다.
export default function FriendListRow({
  id,
  name,
  online,
  accountProfilePhotoId,
  accountProfileBorderId,
  onInvite = null,
  inviteDisabled = false,
  inviteDisabledReason = undefined,
}) {
  // F-19(AC-03): 별 상태의 출처는 **서버에서 복원한** 즐겨찾기 집합이다. 저장이 확정되기
  // 전에는 값이 바뀌지 않고, 실패하면 이전 값이 그대로 남는다(성공으로 위장하지 않는다).
  const isFavorite = useFriendStore((state) => state.favoriteFriendIds.has(id))
  const isSavingFavorite = useFriendStore((state) => state.favoritePendingIds.has(id))
  const favoriteError = useFriendStore((state) => state.favoriteErrors[id] ?? null)
  const setFavorite = useFriendStore((state) => state.setFavorite)

  // 초대 발송 진행·실패는 초대 store가 소유한다(친구 목록 상태와 섞지 않는다).
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
          // toggle 명령이 아니라 **원하는 값**을 보낸다 — 재전송이 상태를 뒤집지 않는다.
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
            <p role="status" data-favorite-error={id} className="app-text-scaled [--app-text-size:10px] text-red-300/90">
              {favoriteError}
            </p>
          ) : null}
          {sendError !== null ? (
            <p role="status" data-invite-error={id} className="app-text-scaled [--app-text-size:10px] text-red-300/90">
              {sendError}
            </p>
          ) : null}
        </div>
        {onInvite !== null ? (
          <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
            <FriendInviteButton
              id={id}
              name={name}
              onInvite={onInvite}
              disabled={inviteDisabled}
              sending={isSendingInvite}
              disabledReason={inviteDisabledReason}
            />
          </div>
        ) : null}
      </div>
    </li>
  )
}
