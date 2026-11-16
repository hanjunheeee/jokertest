// 친구 줄의 친구 끊기 버튼 (한 번 누르면 묻고, 확인을 눌러야 끊음)
// FriendListRow가 로비 친구 창의 줄에 그림
import {
  ACTION_BTN_FOCUS_CLASS,
  ACTION_BTN_LABEL_CLASS,
  FRIEND_ROW_LABEL_BTN_CLASS,
  RECOMMENDED_ACTION_IMG_CLASS,
} from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 글자 없는 그림 위에 글자를 얹은 버튼 하나
function LabelButton({ label, ariaLabel, disabled = false, onClick, ...rest }) {
  return (
    <button
      type="button"
      className={`relative ${FRIEND_ROW_LABEL_BTN_CLASS} ${ACTION_BTN_FOCUS_CLASS}`}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => { if (!disabled) onClick() }}
      {...rest}
    >
      <PublicAsset src={FRIEND_LIST_ASSETS.friendDeclineButton} alt="" className={RECOMMENDED_ACTION_IMG_CLASS} />
      <span aria-hidden="true" className={ACTION_BTN_LABEL_CLASS}>{label}</span>
    </button>
  )
}

// 묻는 동안엔 처음 누른 자리가 "취소"로 바뀌고 확인은 그 왼쪽에 생김 (같은 자리를 두 번 눌러도 안 끊기게)
export default function FriendUnfriendButton({ id, name, confirming, processing, onAsk, onConfirm, onCancel }) {
  return (
    <>
      {confirming ? (
        <LabelButton
          label="끊기"
          ariaLabel={`${name} 친구 끊기 확인`}
          data-unfriend-confirm-button={id}
          onClick={onConfirm}
        />
      ) : null}
      <LabelButton
        label={confirming ? "취소" : "끊기"}
        ariaLabel={
          processing ? `${name} 친구 끊는 중` : confirming ? `${name} 친구 끊기 취소` : `${name} 친구 끊기`
        }
        disabled={processing}
        data-unfriend-friend={id}
        onClick={confirming ? onCancel : onAsk}
      />
    </>
  )
}
