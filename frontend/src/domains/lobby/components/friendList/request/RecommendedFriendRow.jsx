import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  RECOMMENDED_FRIEND_INFO_WRAP_CLASS,
  RECOMMENDED_FRIEND_NAME_CLASS,
  RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS,
  RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS,
  RECOMMENDED_FRIEND_ACTIONS_CLASS,
  RECOMMENDED_FRIEND_OFFLINE_OVERLAY_CLASS,
  FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS,
  RECOMMENDED_FRIEND_ROW_CLASS,
  RECOMMENDED_FRIEND_ROW_CONTENT_CLASS,
  RECOMMENDED_FRIEND_ROW_FRAME_CLASS,
  RECOMMENDED_FRIEND_SENT_BUTTON_CLASS,
  RECOMMENDED_FRIEND_STATUS_BADGE_CLASS,
  RECOMMENDED_FRIEND_STATUS_TEXT_CLASS,
  RECOMMENDED_FRIEND_STATUS_WRAP_CLASS,
  RECOMMENDED_FRIEND_TEXT_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

/**
 * F-19(AC-01): 접속 상태는 세 값이다 — ONLINE · OFFLINE · UNKNOWN.
 *
 * 예전에는 boolean 하나뿐이라 presence 행이 없는 계정(=모름)을 "오프라인"으로 **단정**했다.
 * 서버가 UNKNOWN을 구분해 내려주므로 화면도 그대로 구분해 표시한다.
 */
export const RECOMMENDED_FRIEND_STATUS_TEXT = Object.freeze({
  ONLINE: "접속 중",
  OFFLINE: "오프라인",
  UNKNOWN: "상태 확인 불가",
})

function RecommendedFriendStatus({ status }) {
  const normalized = RECOMMENDED_FRIEND_STATUS_TEXT[status] !== undefined ? status : "UNKNOWN"
  const statusText = RECOMMENDED_FRIEND_STATUS_TEXT[normalized]
  const statusColorClass = normalized === "ONLINE"
    ? "text-amber-100/85"
    : normalized === "OFFLINE" ? "text-white/35" : "text-white/50"

  return (
    <div className={RECOMMENDED_FRIEND_STATUS_WRAP_CLASS} data-presence-status={normalized}>
      <span className={RECOMMENDED_FRIEND_STATUS_BADGE_CLASS}>
        <PublicAsset src={FRIEND_LIST_ASSETS.onlineBadge} alt="" className="h-full w-full select-none" />
        {normalized !== "ONLINE" ? (
          <span className={RECOMMENDED_FRIEND_OFFLINE_OVERLAY_CLASS} aria-hidden="true" />
        ) : null}
      </span>
      <span className={`${RECOMMENDED_FRIEND_STATUS_TEXT_CLASS} ${statusColorClass}`}>
        {statusText}
      </span>
    </div>
  )
}

/**
 * 추천 친구 row 오른쪽의 차단 버튼과 친구 신청 버튼입니다.
 *
 * F-19(AC-04): 차단 버튼은 예전에 **아무 동작도 하지 않았다**. 이제 상대 UUID로 실제 차단
 * API를 호출한다 — 요청 거절(requestId 기반)과는 완전히 다른 동작이며, 서로 바꿔 쓰지
 * 않는다(IncomingFriendRow 주석 참고).
 */
function RecommendedFriendActions({ id, name, onSend, onBlock, sent, blocking }) {
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
        aria-disabled={blocking}
        disabled={blocking}
        data-block-target={id}
        onClick={() => { if (!blocking) onBlock?.(id) }}
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
          src={FRIEND_LIST_ASSETS.friendRequestButton}
          alt=""
          className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
        />
      </button>
    </div>
  )
}

// 친구 검색 결과에서 추천 친구 한 명과 신청 버튼을 보여주는 row입니다.
export default function RecommendedFriendRow({
  id,
  name,
  status = "UNKNOWN",
  onSend,
  onBlock,
  sent,
  blocking = false,
  accountProfilePhotoId,
  accountProfileBorderId,
}) {
  // F-19(AC-01): 검색 결과도 실제 계정 사진·테두리를 그린다(기본 초상 고정이 아니다).
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({ accountProfilePhotoId, accountProfileBorderId })

  return (
    <li className={RECOMMENDED_FRIEND_ROW_CLASS} data-candidate-id={id}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className={RECOMMENDED_FRIEND_ROW_FRAME_CLASS}
      />
      <div className={RECOMMENDED_FRIEND_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_FRIEND_INFO_WRAP_CLASS}>
          <PlayerProfilePortrait
            photoSrc={portraitSrc}
            frameSrc={frameSrc}
            wrapClassName={FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS}
          />
          <div className={RECOMMENDED_FRIEND_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_FRIEND_NAME_CLASS}>{name}</p>
            <RecommendedFriendStatus status={status} />
          </div>
        </div>
        <RecommendedFriendActions
          id={id}
          name={name}
          onSend={onSend}
          onBlock={onBlock}
          sent={sent}
          blocking={blocking}
        />
      </div>
    </li>
  )
}
