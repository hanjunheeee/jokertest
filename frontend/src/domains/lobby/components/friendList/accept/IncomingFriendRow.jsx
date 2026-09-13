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
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

/**
 * 받은 친구 요청 한 명을 보여주고 거절/수락 버튼을 제공합니다.
 *
 * F-19(AC-04): 예전에는 **차단 아이콘·"차단" 레이블**이 붙은 버튼이 실제로는 요청 거절
 * (declineRequest)을 호출했다. 두 동작은 대상도(요청 id vs 상대 UUID) 결과도(요청 하나만
 * 끝남 vs 양방향 신청·초대 차단) 다르다. 이제 거절 버튼은 거절이라고 말하고 거절만 하며,
 * 차단은 상대 UUID를 쓰는 별도 버튼이다.
 */
export default function IncomingFriendRow({
  requestId,
  requesterId,
  name,
  onAccept,
  onDecline,
  onBlock = null,
  processing = false,
  targeted = false,
  accountProfilePhotoId,
  accountProfileBorderId,
}) {
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({ accountProfilePhotoId, accountProfileBorderId })

  return (
    <li
      className={RECOMMENDED_FRIEND_ROW_CLASS}
      data-request-id={requestId}
      // F-17(AC-02): 알림에서 이 요청을 보러 들어온 경우 그 행을 가리킨다. 표시만 바꾸고
      // 수락·거절을 대신 수행하지 않는다.
      data-notification-target={targeted ? "true" : undefined}
      aria-current={targeted ? "true" : undefined}
    >
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
          </div>
        </div>
        <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
          <button
            type="button"
            className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
            aria-label={`${name} 요청 거절`}
            aria-disabled={processing}
            disabled={processing}
            data-decline-request={requestId}
            onClick={() => { if (!processing) onDecline?.(requestId) }}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendBlockButton}
              alt=""
              className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
            />
          </button>
          {onBlock !== null && typeof requesterId === "string" ? (
            <button
              type="button"
              className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
              aria-label={`${name} 차단`}
              aria-disabled={processing}
              disabled={processing}
              // 거절과 달리 요청 id가 아니라 **상대 UUID**로 동작한다.
              data-block-target={requesterId}
              onClick={() => { if (!processing) onBlock(requesterId) }}
              style={{ outline: "none" }}
            >
              <PublicAsset
                src={FRIEND_LIST_ASSETS.friendBlockButton}
                alt=""
                className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
              />
            </button>
          ) : null}
          <button
            type="button"
            className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
            aria-label={`${name} 수락`}
            aria-disabled={processing}
            disabled={processing}
            data-accept-request={requestId}
            onClick={() => { if (!processing) onAccept?.(requestId) }}
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
