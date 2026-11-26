// 로비 친구 줄의 친구 끊기 단추와 확인·실패 안내 글
// list/FriendRow.jsx가 초대 단추가 없는 로비 시트에서 씀
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  ACTION_BTN_FOCUS_CLASS,
  ROW_NOTE_ASK_CLASS,
  STATUS_DETAIL_ERROR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import IconAction from "../parts/IconAction.jsx"

// 묻는 동안엔 원래 자리가 취소로 바뀌고 왼쪽에 확인이 생겨 연타로 끊기지 않게 막음
export function UnfriendActions({ id, name, confirming, processing, onAsk, onConfirm, onCancel }) {
  const mainLabel = processing
    ? `${name} 친구 끊는 중`
    : confirming
      ? `${name} 친구 끊기 취소`
      : `${name} 친구 끊기`

  return (
    <>
      {confirming ? (
        <IconAction
          src={FRIEND_LIST_ASSETS.friendDeclineButton}
          label={`${name} 친구 끊기 확인`}
          overlay="끊기"
          data-unfriend-confirm-button={id}
          className={ACTION_BTN_FOCUS_CLASS}
          onClick={onConfirm}
        />
      ) : null}
      <IconAction
        src={FRIEND_LIST_ASSETS.friendDeclineButton}
        label={mainLabel}
        overlay={confirming ? "취소" : "끊기"}
        disabled={processing}
        data-unfriend-friend={id}
        className={ACTION_BTN_FOCUS_CLASS}
        onClick={confirming ? onCancel : onAsk}
      />
    </>
  )
}

// 묻는 동안엔 묻는 글만 보이고, 아닐 때 실패 문구가 있으면 줄 아래에 보임
export function UnfriendNotice({ id, confirming, error }) {
  if (confirming) {
    return (
      <p role="status" data-unfriend-confirm={id} className={ROW_NOTE_ASK_CLASS}>
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
