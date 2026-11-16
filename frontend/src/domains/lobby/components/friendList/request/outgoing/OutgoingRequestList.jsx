// 보낸 친구 신청 목록 (아직 답이 안 온 신청과 취소 버튼, 목록 받기 오류)
// FriendRequestTab이 검색하지 않을 때 검색창 아래에 그림
import {
  PAPER_DETAIL_CLASS,
  REQUEST_EMPTY_CLASS,
  REQUEST_RESULT_LIST_CLASS,
} from "../../../../constants/friendListStyle.js"
import OutgoingRequestRow from "./OutgoingRequestRow.jsx"

// 보낸 신청이 없고 오류도 없으면 아무것도 안 그림 (탭이 예전처럼 검색창만 보임)
export default function OutgoingRequestList({
  requests = [], error = null, cancelingIds = new Set(), cancelErrors = {}, onCancel,
}) {
  if (requests.length === 0 && error === null) return null

  return (
    <div className={REQUEST_RESULT_LIST_CLASS}>
      {error !== null ? (
        <p role="status" data-outgoing-list-error="true" className={REQUEST_EMPTY_CLASS}>
          {error}
        </p>
      ) : null}
      {requests.length > 0 ? (
        <>
          {/* 줄 틀 밖 창 종이 위라 줄 안 옅은 글 색 대신 종이용 검정 */}
          <p className={`px-2 ${PAPER_DETAIL_CLASS}`}>보낸 신청 ({requests.length})</p>
          <ul aria-label="보낸 친구 신청">
            {requests.map((request) => (
              <OutgoingRequestRow
                key={request.request_id}
                request={request}
                onCancel={onCancel}
                canceling={cancelingIds.has(request.request_id)}
                error={cancelErrors[request.request_id] ?? null}
              />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
