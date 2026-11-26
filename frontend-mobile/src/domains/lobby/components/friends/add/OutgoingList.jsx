// 보낸 친구 신청 목록과 신청 취소 단추 (검색하지 않을 때 친구 추가 탭에 보임)
// add/AddTab.jsx가 검색창 아래 스크롤 칸에 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  ACTION_BTN_FOCUS_CLASS,
  PAPER_DETAIL_CLASS,
  REQUEST_EMPTY_CLASS,
  STATUS_DETAIL_ERROR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import IconAction from "../parts/IconAction.jsx"
import RowShell from "../parts/RowShell.jsx"

// 보낸 신청 한 줄, 취소 중엔 단추를 잠가 연타를 막음
function OutgoingRow({ request, canceling, error, onCancel }) {
  const { request_id: requestId, name } = request
  const label = canceling ? `${name}에게 보낸 친구 신청 취소하는 중` : `${name}에게 보낸 친구 신청 취소`

  return (
    <RowShell
      name={name}
      photoId={request.accountProfilePhotoId}
      borderId={request.accountProfileBorderId}
      rowProps={{ "data-outgoing-request-id": requestId }}
      actions={(
        <IconAction
          src={FRIEND_LIST_ASSETS.friendDeclineButton}
          label={label}
          overlay="취소"
          disabled={canceling}
          data-cancel-request={requestId}
          className={ACTION_BTN_FOCUS_CLASS}
          onClick={() => onCancel?.(requestId)}
        />
      )}
      footer={error !== null ? (
        <p role="alert" data-cancel-error={requestId} className={STATUS_DETAIL_ERROR_CLASS}>{error}</p>
      ) : null}
    />
  )
}

// 보낸 신청도 없고 오류도 없으면 아무것도 안 그림
export default function OutgoingList({ requests = [], error = null, cancelingIds = new Set(), cancelErrors = {}, onCancel }) {
  if (requests.length === 0 && error === null) return null

  return (
    <div className="mt-2">
      {error !== null ? (
        <p role="status" data-outgoing-list-error="true" className={REQUEST_EMPTY_CLASS}>{error}</p>
      ) : null}
      {requests.length > 0 ? (
        <>
          <p className={`px-2 ${PAPER_DETAIL_CLASS}`}>보낸 신청 ({requests.length})</p>
          <ul aria-label="보낸 친구 신청">
            {requests.map((request) => (
              <OutgoingRow
                key={request.request_id}
                request={request}
                canceling={cancelingIds.has(request.request_id)}
                error={cancelErrors[request.request_id] ?? null}
                onCancel={onCancel}
              />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
