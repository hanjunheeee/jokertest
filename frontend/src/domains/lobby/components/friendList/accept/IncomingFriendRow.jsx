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

export default function IncomingFriendRow({
  requestId,
  requesterId,
  name,
  onAccept,
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
          {onBlock !== null && typeof requesterId === "string" ? (
            <button
              type="button"
              className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
              aria-label={`${name} 차단`}
              title={`${name} 차단 — 앞으로 신청·초대를 양쪽 모두 막습니다`}
              aria-disabled={processing}
              disabled={processing}
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
