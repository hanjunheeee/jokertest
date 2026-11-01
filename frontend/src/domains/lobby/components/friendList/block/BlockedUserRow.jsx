// 차단 목록 한 줄 (초상·이름·차단 해제 버튼)
// FriendBlockTab이 차단한 사용자마다 그림
import {
  FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS,
  RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS,
  RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS,
  RECOMMENDED_FRIEND_ACTIONS_CLASS,
  RECOMMENDED_FRIEND_INFO_WRAP_CLASS,
  RECOMMENDED_FRIEND_NAME_CLASS,
  RECOMMENDED_FRIEND_ROW_CLASS,
  RECOMMENDED_FRIEND_ROW_CONTENT_CLASS,
  RECOMMENDED_FRIEND_ROW_FRAME_CLASS,
  RECOMMENDED_FRIEND_TEXT_WRAP_CLASS,
} from "../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import PlayerProfilePortrait from "../../../../../shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"
import { resolveAccountProfileAssets } from "../../../../../shared/utils/resolveAccountProfileAssets.js"

// 해제 처리 중엔 버튼을 잠가 중복 요청을 막음
export default function BlockedUserRow({ user, onUnblock, processing }) {
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: user.accountProfilePhotoId,
    accountProfileBorderId: user.accountProfileBorderId,
  })

  return (
    <li className={RECOMMENDED_FRIEND_ROW_CLASS} data-blocked-id={user.id}>
      <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={RECOMMENDED_FRIEND_ROW_FRAME_CLASS} />
      <div className={RECOMMENDED_FRIEND_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_FRIEND_INFO_WRAP_CLASS}>
          <PlayerProfilePortrait
            photoSrc={portraitSrc}
            frameSrc={frameSrc}
            wrapClassName={FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS}
          />
          <div className={RECOMMENDED_FRIEND_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_FRIEND_NAME_CLASS}>{user.name}</p>
          </div>
        </div>
        <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
          <button
            type="button"
            className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
            aria-label={`${user.name} 차단 해제`}
            aria-disabled={processing}
            disabled={processing}
            data-unblock-target={user.id}
            onClick={() => { if (!processing) onUnblock(user.id) }}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendAcceptButton}
              alt=""
              className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
            />
          </button>
        </div>
      </div>
    </li>
  )
}
