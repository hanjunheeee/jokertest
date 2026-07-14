import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  INCOMING_FRIEND_ACTION_BUTTON_CLASS,
  INCOMING_FRIEND_ACTIONS_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import {
  RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS,
  RECOMMENDED_FRIEND_INFO_WRAP_CLASS,
  RECOMMENDED_FRIEND_NAME_CLASS,
  RECOMMENDED_FRIEND_PROFILE_FRAME_CLASS,
  RECOMMENDED_FRIEND_PROFILE_IMAGE_CLASS,
  RECOMMENDED_FRIEND_PROFILE_IMAGE_WRAP_CLASS,
  RECOMMENDED_FRIEND_PROFILE_WRAP_CLASS,
  RECOMMENDED_FRIEND_ROW_CLASS,
  RECOMMENDED_FRIEND_ROW_CONTENT_CLASS,
  RECOMMENDED_FRIEND_ROW_FRAME_CLASS,
  RECOMMENDED_FRIEND_TEXT_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 받은 요청 row에서 프로필 프레임과 이미지를 겹쳐서 보여줍니다.
function IncomingFriendProfile({ profileSrc }) {
  return (
    <div className={RECOMMENDED_FRIEND_PROFILE_WRAP_CLASS}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.profileFrame}
        alt=""
        className={RECOMMENDED_FRIEND_PROFILE_FRAME_CLASS}
      />
      <div className={RECOMMENDED_FRIEND_PROFILE_IMAGE_WRAP_CLASS}>
        <PublicAsset
          src={profileSrc}
          alt=""
          className={RECOMMENDED_FRIEND_PROFILE_IMAGE_CLASS}
        />
      </div>
    </div>
  )
}

// 받은 친구 요청 한 명을 보여주고 수락/거절 버튼을 제공합니다.
export default function IncomingFriendRow({ requestId, name, profileSrc, onAccept, onDecline }) {
  return (
    <li className={RECOMMENDED_FRIEND_ROW_CLASS}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className={RECOMMENDED_FRIEND_ROW_FRAME_CLASS}
      />
      <div className={RECOMMENDED_FRIEND_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_FRIEND_INFO_WRAP_CLASS}>
          <IncomingFriendProfile profileSrc={profileSrc} />
          <div className={RECOMMENDED_FRIEND_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_FRIEND_NAME_CLASS}>{name}</p>
          </div>
        </div>
        <div className={INCOMING_FRIEND_ACTIONS_CLASS}>
          <button
            type="button"
            className={INCOMING_FRIEND_ACTION_BUTTON_CLASS}
            aria-label={`${name} 수락`}
            onClick={() => onAccept?.(requestId)}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.tabButtonActive}
              alt=""
              className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
            />
          </button>
          <button
            type="button"
            className={INCOMING_FRIEND_ACTION_BUTTON_CLASS}
            aria-label={`${name} 거절`}
            onClick={() => onDecline?.(requestId)}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.tabButtonInactive}
              alt=""
              className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
            />
          </button>
        </div>
      </div>
    </li>
  )
}
