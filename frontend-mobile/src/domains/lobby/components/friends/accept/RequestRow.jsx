// 받은 친구 신청 한 줄 (초상·이름·차단·수락 버튼)
// AcceptTab이 신청마다 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import RowShell from "../parts/RowShell.jsx"
import IconAction from "../parts/IconAction.jsx"

// 처리 중이면 두 버튼 다 잠금, 알림에서 찾던 신청은 aria-current로 표시 (데스크톱 IncomingFriendRow와 같음)
export default function RequestRow({ request, processing, targeted, onAccept, onBlock }) {
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
    />
  )
}
