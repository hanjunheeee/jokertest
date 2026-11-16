// 친구 줄의 친구 끊기 버튼 (한 번 누르면 묻고, 확인을 눌러야 끊음)
// FriendRow가 로비 친구 시트의 줄에 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import IconAction from "../parts/IconAction.jsx"

// 묻는 동안엔 처음 누른 자리가 "취소"로 바뀌고 확인은 그 왼쪽에 생김 (같은 자리를 두 번 눌러도 안 끊기게, 데스크톱 FriendUnfriendButton과 같음)
export default function UnfriendActions({ id, name, confirming, processing, onAsk, onConfirm, onCancel }) {
  return (
    <>
      {confirming ? (
        <IconAction
          src={FRIEND_LIST_ASSETS.friendDeclineButton}
          label={`${name} 친구 끊기 확인`}
          overlay="끊기"
          data-unfriend-confirm-button={id}
          onClick={onConfirm}
        />
      ) : null}
      <IconAction
        src={FRIEND_LIST_ASSETS.friendDeclineButton}
        label={processing ? `${name} 친구 끊는 중` : confirming ? `${name} 친구 끊기 취소` : `${name} 친구 끊기`}
        overlay={confirming ? "취소" : "끊기"}
        disabled={processing}
        data-unfriend-friend={id}
        onClick={confirming ? onCancel : onAsk}
      />
    </>
  )
}
