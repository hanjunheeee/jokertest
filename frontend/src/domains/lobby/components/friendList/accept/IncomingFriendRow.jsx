// 받은 친구 신청 한 줄 (초상·이름·차단·거절·수락 버튼, 실패 문구)
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
  STATUS_DETAIL_ERROR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

// 거절 그림엔 글자가 없어 위에 글자 얹음
const DECLINE_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center app-text-scaled [--app-text-size:13px] font-semibold text-[#f5f0e6]"

// 신청 처리 중이거나 차단 요청 중이면 버튼 모두 잠금(차단 중 수락 막기), 알림에서 찾던 신청은 표시함
export default function IncomingFriendRow({
  requestId,
  requesterId,
  name,
  onAccept,
  onDecline = null,
  onBlock = null,
  processing = false,
  blocking = false,
  error = null,
  targeted = false,
  accountProfilePhotoId,
  accountProfileBorderId,
}) {
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({ accountProfilePhotoId, accountProfileBorderId })
  const locked = processing || blocking

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
            {error !== null ? (
              <p role="alert" data-request-error={requestId} className={STATUS_DETAIL_ERROR_CLASS}>
                {error}
              </p>
            ) : null}
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
              aria-disabled={locked}
              disabled={locked}
              data-block-target={requesterId}
              onClick={() => { if (!locked) onBlock(requesterId) }}
              style={{ outline: "none" }}
            >
              <PublicAsset
                src={FRIEND_LIST_ASSETS.friendBlockButton}
                alt=""
                className={RECOMMENDED_ACTION_IMG_CLASS}
              />
            </button>
          ) : null}
          {/* 거절 처리 함수가 있을 때만 거절 버튼 (원치 않는 신청을 수락·차단 말고 치우기) */}
          {onDecline !== null ? (
            <button
              type="button"
              className={`relative ${RECOMMENDED_ACTION_BTN_CLASS}`}
              aria-label={`${name} 거절`}
              aria-disabled={locked}
              disabled={locked}
              data-decline-request={requestId}
              onClick={() => { if (!locked) onDecline(requestId) }}
              style={{ outline: "none" }}
            >
              <PublicAsset
                src={FRIEND_LIST_ASSETS.friendDeclineButton}
                alt=""
                className={RECOMMENDED_ACTION_IMG_CLASS}
              />
              <span aria-hidden="true" className={DECLINE_LABEL_CLASS}>거절</span>
            </button>
          ) : null}
          <button
            type="button"
            className={RECOMMENDED_ACTION_BTN_CLASS}
            aria-label={`${name} 수락`}
            aria-disabled={locked}
            disabled={locked}
            data-accept-request={requestId}
            onClick={() => { if (!locked) onAccept?.(requestId) }}
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
