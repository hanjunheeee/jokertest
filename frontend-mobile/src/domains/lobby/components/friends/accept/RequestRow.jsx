// 받은 친구 신청 한 줄 (초상·이름·실패 문구·차단·거절·수락 버튼)
// AcceptTab이 신청마다 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { STATUS_DETAIL_ERROR_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import RowShell from "../parts/RowShell.jsx"
import IconAction from "../parts/IconAction.jsx"

// 처리 중이면 두 버튼 다 잠금, 알림에서 찾던 신청은 aria-current로 표시 (데스크톱 IncomingFriendRow와 같음)
export default function RequestRow({ request, processing, targeted, error = null, onAccept, onDecline = null, onBlock }) {
  const { request_id: requestId, id: requesterId, name } = request

  const actions = (
    <>
      {/* 차단 처리 함수와 신청자 id가 있을 때만 차단 버튼 */}
      {onBlock !== null && typeof requesterId === "string" ? (
        <IconAction
          src={FRIEND_LIST_ASSETS.friendBlockButton}
          label={`${name} 차단`}
          title={`${name} 차단 — 앞으로 신청·초대를 양쪽 모두 막습니다`}
          disabled={processing}
          data-block-target={requesterId}
          onClick={() => onBlock(requesterId)}
        />
      ) : null}
      {/* 거절 처리 함수가 있을 때만 거절 버튼 (그림에 글자가 없어 위에 얹음, 데스크톱 IncomingFriendRow와 같음) */}
      {onDecline !== null ? (
        <IconAction
          src={FRIEND_LIST_ASSETS.friendDeclineButton}
          label={`${name} 거절`}
          disabled={processing}
          data-decline-request={requestId}
          overlay="거절"
          onClick={() => onDecline(requestId)}
        />
      ) : null}
      <IconAction
        src={FRIEND_LIST_ASSETS.friendAcceptButton}
        label={`${name} 수락`}
        disabled={processing}
        data-accept-request={requestId}
        onClick={() => onAccept?.(requestId)}
      />
    </>
  )

  return (
    <RowShell
      name={name}
      photoId={request.accountProfilePhotoId}
      borderId={request.accountProfileBorderId}
      actions={actions}
      targeted={targeted}
      rowProps={{ "data-request-id": requestId, "data-notification-target": targeted ? "true" : undefined }}
    >
      {error !== null ? (
        <p role="alert" data-request-error={requestId} className={STATUS_DETAIL_ERROR_CLASS}>{error}</p>
      ) : null}
    </RowShell>
  )
}
