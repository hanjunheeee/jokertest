// 보낸 친구 신청 한 줄 (초상·이름·실패 문구·취소 버튼)
// OutgoingRequestList가 신청마다 그림
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import {
  ACTION_BTN_FOCUS_CLASS,
  ACTION_BTN_LABEL_CLASS,
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
} from "../../../../constants/friendListStyle.js"
import PlayerProfilePortrait from "../../../../../../shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"
import { resolveAccountProfileAssets } from "../../../../../../shared/utils/resolveAccountProfileAssets.js"

// 취소 중엔 버튼을 잠가 중복 요청을 막음, 취소 그림엔 글자가 없어 위에 글자 얹음 (받은 신청 줄 거절 버튼과 같음)
export default function OutgoingRequestRow({ request, onCancel, canceling = false, error = null }) {
  const { request_id: requestId, name } = request
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: request.accountProfilePhotoId,
    accountProfileBorderId: request.accountProfileBorderId,
  })

  return (
    <li className={RECOMMENDED_ROW_CLASS} data-outgoing-request-id={requestId}>
      <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={RECOMMENDED_ROW_FRAME_CLASS} />
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
              <p role="alert" data-cancel-error={requestId} className={STATUS_DETAIL_ERROR_CLASS}>
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div className={RECOMMENDED_ACTIONS_CLASS}>
          <button
            type="button"
            className={`relative ${RECOMMENDED_ACTION_BTN_CLASS} ${ACTION_BTN_FOCUS_CLASS}`}
            aria-label={canceling ? `${name}에게 보낸 친구 신청 취소하는 중` : `${name}에게 보낸 친구 신청 취소`}
            aria-disabled={canceling}
            disabled={canceling}
            data-cancel-request={requestId}
            onClick={() => { if (!canceling) onCancel?.(requestId) }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendDeclineButton}
              alt=""
              className={RECOMMENDED_ACTION_IMG_CLASS}
            />
            <span aria-hidden="true" className={ACTION_BTN_LABEL_CLASS}>취소</span>
          </button>
        </div>
      </div>
    </li>
  )
}
