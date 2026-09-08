import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
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
} from "@/domains/lobby/constants/friendListStyle.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

// 받은 친구 요청 한 명을 보여주고 수락/거절 버튼을 제공합니다.
export default function IncomingFriendRow({ requestId, name, onAccept, onDecline }) {
  return (
    <li className={RECOMMENDED_FRIEND_ROW_CLASS}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className={RECOMMENDED_FRIEND_ROW_FRAME_CLASS}
      />
      <div className={RECOMMENDED_FRIEND_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_FRIEND_INFO_WRAP_CLASS}>
          <PlayerProfilePortrait wrapClassName={FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS} />
          <div className={RECOMMENDED_FRIEND_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_FRIEND_NAME_CLASS}>{name}</p>
          </div>
        </div>
        <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
          <button
            type="button"
            className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
            aria-label={`${name} 차단`}
            onClick={() => onDecline?.(requestId)}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendBlockButton}
              alt=""
              className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
            />
          </button>
          <button
            type="button"
            className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
            aria-label={`${name} 수락`}
            onClick={() => onAccept?.(requestId)}
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
