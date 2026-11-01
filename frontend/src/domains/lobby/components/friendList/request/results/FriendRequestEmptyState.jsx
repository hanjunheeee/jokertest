// 친구 검색 결과가 없을 때 한 줄 (오류·검색 중·결과 없음)
// FriendRequestResultsList가 그림
import { FILTER_MSGS } from "../../../../constants/friendListFilter.js"
import { REQUEST_EMPTY_CLASS } from "../../../../constants/friendListStyle.js"

// 오류 문구가 있으면 그걸 먼저 보임
export default function FriendRequestEmptyState({ searching, errorMsg }) {
  const message = errorMsg
    || (searching ? "친구를 검색 중입니다." : FILTER_MSGS.noResults)

  return (
    <li className={REQUEST_EMPTY_CLASS}>
      {message}
    </li>
  )
}
