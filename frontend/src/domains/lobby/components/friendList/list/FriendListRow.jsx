// 친구 목록 한 줄 (즐겨찾기 별·초상·이름·접속 상태·오류·초대/차단 버튼)
// FriendListFolderRows·FriendListFilterResults가 친구마다 그림
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import {
  ROW_CONTENT_CLASS,
  FRIEND_ROW_FRAME_CLASS,
  FRIEND_ROW_INFO_CLASS,
  FRIEND_ROW_ITEM_CLASS,
  FRIEND_ROW_NAME_CLASS,
  ROW_PROFILE_PORTRAIT_WRAP_CLASS,
  RECOMMENDED_ACTIONS_CLASS,
  STATUS_DETAIL_ERROR_CLASS,
} from "../../../constants/friendListStyle.js"
import PlayerProfilePortrait from "../../../../../shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"
import FriendListFavoriteStar from "./FriendListFavoriteStar.jsx"
import FriendOnlineStatus from "./row/FriendOnlineStatus.jsx"
import FriendInviteButton from "./row/FriendInviteButton.jsx"
import FriendBlockButton from "./row/FriendBlockButton.jsx"
import { useFriendStore } from "../../../store/friend.store.js"
import { useGameInviteStore } from "../../../store/gameInvite.store.js"
import { resolveAccountProfileAssets } from "../../../../../shared/utils/resolveAccountProfileAssets.js"

// 즐겨찾기·초대 상태는 줄마다 스토어에서 직접 골라 다른 줄이 다시 그려지지 않게 함
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
      <div className={ROW_CONTENT_CLASS}>
        {/* 저장 중엔 별을 눌러도 다시 안 보냄 */}
        <FriendListFavoriteStar
          active={isFavorite}
          onToggle={() => { if (!isSavingFavorite) setFavorite(id, !isFavorite) }}
        />
        <PlayerProfilePortrait
          photoSrc={portraitSrc}
          frameSrc={frameSrc}
          wrapClassName={ROW_PROFILE_PORTRAIT_WRAP_CLASS}
        />
        <div className={FRIEND_ROW_INFO_CLASS}>
          <p className={FRIEND_ROW_NAME_CLASS}>{name}</p>
          <FriendOnlineStatus online={online} />
          {/* 즐겨찾기·초대 실패 문구는 줄 안에 보임 */}
          {favoriteError !== null ? (
            <p role="status" data-favorite-error={id} className={STATUS_DETAIL_ERROR_CLASS}>
              {favoriteError}
            </p>
          ) : null}
          {sendError !== null ? (
            <p role="status" data-invite-error={id} className={STATUS_DETAIL_ERROR_CLASS}>
              {sendError}
            </p>
          ) : null}
        </div>
        {/* 초대·차단 처리 함수가 있을 때만 버튼 칸 */}
        {onInvite !== null || onBlock !== null ? (
          <div className={RECOMMENDED_ACTIONS_CLASS}>
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
