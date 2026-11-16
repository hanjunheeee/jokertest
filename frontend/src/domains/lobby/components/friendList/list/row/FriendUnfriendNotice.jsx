// 친구 줄의 친구 끊기 안내 글 ("친구를 끊을까요?" 또는 끊기 실패 문구)
// FriendListRow가 이름 아래에 그림
import { STATUS_DETAIL_CLASS, STATUS_DETAIL_ERROR_CLASS } from "../../../../constants/friendListStyle.js"

// 묻는 동안엔 묻는 글만 보임 (앞 실패 문구를 가림), 둘 다 없으면 아무것도 안 그림
export default function FriendUnfriendNotice({ id, confirming, error }) {
  if (confirming) {
    return (
      <p role="status" data-unfriend-confirm={id} className={`${STATUS_DETAIL_CLASS} text-white`}>
        친구를 끊을까요?
      </p>
    )
  }
  if (error === null) return null
  return (
    <p role="status" data-unfriend-error={id} className={STATUS_DETAIL_ERROR_CLASS}>
      {error}
    </p>
  )
}
