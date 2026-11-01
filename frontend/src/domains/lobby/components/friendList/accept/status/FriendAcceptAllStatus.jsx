// 전부 수락 진행·결과 안내
// FriendAcceptTab이 버튼 줄 아래에 그림
import { ACCEPT_EMPTY_CLASS } from "../../../../constants/friendListStyle.js"
import { buildAcceptAllSummary } from "../../../../utils/friend/acceptAllSummary.js"

// 안내할 게 없으면 아무것도 안 그림, 목록 새로고침 오류는 따로 한 줄 더 보임
export default function FriendAcceptAllStatus({ result }) {
  const summary = buildAcceptAllSummary(result)
  if (summary === null) return null

  return (
    <div role="status" data-accept-all-status="true" className={ACCEPT_EMPTY_CLASS}>
      <p>{summary}</p>
      {result.refreshError !== null && result.refreshError !== undefined ? (
        <p data-accept-all-refresh-error="true">{result.refreshError}</p>
      ) : null}
    </div>
  )
}
