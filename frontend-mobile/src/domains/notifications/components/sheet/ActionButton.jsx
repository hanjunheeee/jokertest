// 알림 창 이미지 버튼 (보러 가기·다시 시도·읽은 메시지 삭제), 데스크톱과 같은 버튼 그림
// 알림 줄·본문 오류·바닥 줄이 씀
import { NOTIFICATION_ASSETS } from "@/domains/notifications/constants/notificationAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import {
  ACTION_BTN_CLASS,
  ACTION_BTN_IMG_CLASS,
  ACTION_LABEL_PRIMARY_CLASS,
  ACTION_LABEL_SECONDARY_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"

// 버튼 그림·글자색 두 벌 (primary·secondary)
const LOOKS = {
  primary: { button: ACTION_BTN_CLASS, img: ACTION_BTN_IMG_CLASS, label: ACTION_LABEL_PRIMARY_CLASS },
  secondary: { button: ACTION_BTN_CLASS, img: ACTION_BTN_IMG_CLASS, label: ACTION_LABEL_SECONDARY_CLASS },
}

// 처리 중이면 글자·화면 읽기 이름을 '처리 중'으로 바꿈, variant로 버튼 그림 고름
export default function ActionButton({ label, onClick, disabled, action, variant = "primary", pending = false }) {
  const primary = variant === "primary"

  return (
    <ImageButton
      look={primary ? LOOKS.primary : LOOKS.secondary}
      src={primary ? NOTIFICATION_ASSETS.actionButtonPrimary : NOTIFICATION_ASSETS.actionButtonSecondary}
      label={pending ? "처리 중…" : label}
      ariaLabel={pending ? "처리 중" : label}
      disabled={disabled}
      data-notification-action={action}
      data-notification-action-variant={variant}
      onClick={onClick}
    />
  )
}
