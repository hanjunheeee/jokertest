// 보낸 친구 신청 한 줄 (초상·이름·실패 문구·취소 버튼)
// AddTab이 검색하지 않을 때 보낸 신청마다 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { STATUS_DETAIL_ERROR_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import RowShell from "../parts/RowShell.jsx"
import IconAction from "../parts/IconAction.jsx"

// 취소 중엔 버튼을 잠가 중복 요청을 막음, 그림에 글자가 없어 위에 얹음 (데스크톱 OutgoingRequestRow와 같음)
export default function SentRow({ request, canceling = false, error = null, onCancel }) {
  const { request_id: requestId, name } = request

  return (
    <RowShell
      name={name}
      photoId={request.accountProfilePhotoId}
      borderId={request.accountProfileBorderId}
      rowProps={{ "data-outgoing-request-id": requestId }}
      actions={(
        <IconAction
          src={FRIEND_LIST_ASSETS.friendDeclineButton}
          label={canceling ? `${name}에게 보낸 친구 신청 취소하는 중` : `${name}에게 보낸 친구 신청 취소`}
          disabled={canceling}
          data-cancel-request={requestId}
          overlay="취소"
          onClick={() => onCancel?.(requestId)}
        />
      )}
    >
      {error !== null ? (
        <p role="alert" data-cancel-error={requestId} className={STATUS_DETAIL_ERROR_CLASS}>{error}</p>
      ) : null}
    </RowShell>
  )
}
