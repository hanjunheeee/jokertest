// 알림 시트 이미지 버튼 (보러 가기·다시 시도·읽은 메시지 삭제), 데스크톱과 같은 버튼 그림
// 알림 줄·상세·본문 오류·바닥 줄이 씀
import { NOTIFICATION_ASSETS } from "@/domains/notifications/constants/notificationAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import {
  ACTION_BTN_CLASS,
  ACTION_BTN_IMG_CLASS,
  ACTION_LABEL_PRIMARY_CLASS,
  ACTION_LABEL_SECONDARY_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"

// 처리 중이면 글자·화면 읽기 이름을 '처리 중'으로 바꿈, variant로 버튼 그림 고름
export default function ActionButton({ label, onClick, disabled, action, variant = "primary", pending = false }) {
  const primary = variant === "primary"

  return (
    <button
      type="button"
      className={ACTION_BTN_CLASS}
      disabled={disabled}
      aria-label={pending ? "처리 중" : label}
      data-notification-action={action}
      data-notification-action-variant={variant}
      onClick={onClick}
    >
      <img
        src={publicAsset(primary ? NOTIFICATION_ASSETS.actionButtonPrimary : NOTIFICATION_ASSETS.actionButtonSecondary)}
        alt=""
        draggable={false}
        className={ACTION_BTN_IMG_CLASS}
      />
      <span className={primary ? ACTION_LABEL_PRIMARY_CLASS : ACTION_LABEL_SECONDARY_CLASS}>
        {pending ? "처리 중…" : label}
      </span>
    </button>
  )
}
