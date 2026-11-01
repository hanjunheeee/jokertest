// 받은 친구 신청 한 줄 (초상·이름·차단·수락 버튼)
// FriendAcceptRequestList가 신청마다 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  PROFILE_PORTRAIT_WRAP_CLASS,
  RECOMMENDED_ACTION_BTN_CLASS,
  RECOMMENDED_ACTION_IMG_CLASS,
  RECOMMENDED_ACTIONS_CLASS,
  RECOMMENDED_INFO_WRAP_CLASS,
  RECOMMENDED_NAME_CLASS,
  RECOMMENDED_ROW_CLASS,
  RECOMMENDED_ROW_CONTENT_CLASS,
  RECOMMENDED_ROW_FRAME_CLASS,
  RECOMMENDED_TEXT_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

// 처리 중이면 두 버튼 다 잠금, 알림에서 찾던 신청은 표시함
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
      className={RECOMMENDED_ROW_CLASS}
      data-request-id={requestId}
      data-notification-target={targeted ? "true" : undefined}
      aria-current={targeted ? "true" : undefined}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className={RECOMMENDED_ROW_FRAME_CLASS}
      />
      <div className={RECOMMENDED_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_INFO_WRAP_CLASS}>
          <PlayerProfilePortrait
            photoSrc={portraitSrc}
            frameSrc={frameSrc}
            wrapClassName={PROFILE_PORTRAIT_WRAP_CLASS}
          />
          <div className={RECOMMENDED_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_NAME_CLASS}>{name}</p>
          </div>
        </div>
        <div className={RECOMMENDED_ACTIONS_CLASS}>
          {/* 차단 처리 함수와 신청자 id가 있을 때만 차단 버튼 */}
          {onBlock !== null && typeof requesterId === "string" ? (
            <button
              type="button"
              className={RECOMMENDED_ACTION_BTN_CLASS}
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
                className={RECOMMENDED_ACTION_IMG_CLASS}
              />
            </button>
          ) : null}
          <button
            type="button"
            className={RECOMMENDED_ACTION_BTN_CLASS}
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
              className={RECOMMENDED_ACTION_IMG_CLASS}
            />
          </button>
        </div>
      </div>
    </li>
  )
}
