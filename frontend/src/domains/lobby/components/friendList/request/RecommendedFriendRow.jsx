import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  RECOMMENDED_FRIEND_INFO_WRAP_CLASS,
  RECOMMENDED_FRIEND_NAME_CLASS,
  RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS,
  RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS,
  RECOMMENDED_FRIEND_ACTIONS_CLASS,
  RECOMMENDED_FRIEND_OFFLINE_OVERLAY_CLASS,
  RECOMMENDED_FRIEND_PROFILE_FRAME_CLASS,
  RECOMMENDED_FRIEND_PROFILE_IMAGE_CLASS,
  RECOMMENDED_FRIEND_PROFILE_IMAGE_WRAP_CLASS,
  RECOMMENDED_FRIEND_PROFILE_WRAP_CLASS,
  RECOMMENDED_FRIEND_ROW_CLASS,
  RECOMMENDED_FRIEND_ROW_CONTENT_CLASS,
  RECOMMENDED_FRIEND_ROW_FRAME_CLASS,
  RECOMMENDED_FRIEND_SENT_BUTTON_CLASS,
  RECOMMENDED_FRIEND_STATUS_BADGE_CLASS,
  RECOMMENDED_FRIEND_STATUS_TEXT_CLASS,
  RECOMMENDED_FRIEND_STATUS_WRAP_CLASS,
  RECOMMENDED_FRIEND_TEXT_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 추천 친구의 프로필 프레임과 실제 프로필 이미지를 겹쳐서 보여줍니다.
function RecommendedFriendProfile({ profileSrc }) {
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

// 추천 친구가 접속 중인지 오프라인인지 표시합니다.
function RecommendedFriendStatus({ online }) {
  const statusText = online ? "접속 중" : "오프라인"
  const statusColorClass = online ? "text-amber-100/85" : "text-white/35"

  return (
    <div className={RECOMMENDED_FRIEND_STATUS_WRAP_CLASS}>
      <span className={RECOMMENDED_FRIEND_STATUS_BADGE_CLASS}>
        <PublicAsset src={FRIEND_LIST_ASSETS.onlineBadge} alt="" className="h-full w-full select-none" />
        {!online ? (
          <span className={RECOMMENDED_FRIEND_OFFLINE_OVERLAY_CLASS} aria-hidden="true" />
        ) : null}
      </span>
      <span className={`${RECOMMENDED_FRIEND_STATUS_TEXT_CLASS} ${statusColorClass}`}>
        {statusText}
      </span>
    </div>
  )
}

// 추천 친구 row 오른쪽의 차단 버튼과 친구 신청 버튼입니다.
function RecommendedFriendActions({ id, name, onSend, sent }) {
  const sendButtonClass = sent
    ? `${RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS} ${RECOMMENDED_FRIEND_SENT_BUTTON_CLASS}`
    : RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS

  const handleSendClick = () => {
    if (sent) return
    onSend?.(id)
  }

  return (
    <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
      <button
        type="button"
        className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
        aria-label={`${name} 차단`}
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
        className={sendButtonClass}
        aria-label={sent ? "신청 완료" : `${name}에게 친구 신청`}
        onClick={handleSendClick}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={FRIEND_LIST_ASSETS.tabButtonActive}
          alt=""
          className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
        />
      </button>
    </div>
  )
}

// 친구 검색 결과에서 추천 친구 한 명과 신청 버튼을 보여주는 row입니다.
export default function RecommendedFriendRow({ id, name, profileSrc, online, onSend, sent }) {
  return (
    <li className={RECOMMENDED_FRIEND_ROW_CLASS}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className={RECOMMENDED_FRIEND_ROW_FRAME_CLASS}
      />
      <div className={RECOMMENDED_FRIEND_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_FRIEND_INFO_WRAP_CLASS}>
          <RecommendedFriendProfile profileSrc={profileSrc} />
          <div className={RECOMMENDED_FRIEND_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_FRIEND_NAME_CLASS}>{name}</p>
            <RecommendedFriendStatus online={online} />
          </div>
        </div>
        <RecommendedFriendActions id={id} name={name} onSend={onSend} sent={sent} />
      </div>
    </li>
  )
}
