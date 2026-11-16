// 알림 목록 한 줄 (제목·받은 시각·본문·보러 가기·읽음 실패 다시 시도), 데스크톱 NotificationItem 모양
// 알림 본문 목록(SheetBody.jsx)이 씀
import { NOTIFICATION_ASSETS } from "@m/domains/notifications/constants/notificationAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { formatNotificationTime } from "@/domains/notifications/utils/notificationTime.js"
import {
  ITEM_BODY_CLASS,
  ITEM_INNER_CLASS,
  ITEM_SLOT_CLASS,
  ITEM_SLOT_IMG_CLASS,
  ITEM_TIME_CLASS,
  ITEM_TITLE_CLASS,
  ITEM_TITLE_ROW_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"
import ItemActions from "@m/domains/notifications/components/sheet/ItemActions.jsx"

// 칸 그림을 줄 높이에 맞춰 늘리고 그 위에 글자·버튼, 본문은 자르지 않음
export default function NotificationRow({ item, pending, error, onOpenTarget, onRetryRead }) {
  // 받은 시각 글자 (데스크톱과 같은 함수), 이상한 값이면 빈 글자 → 시각 칸을 안 그림
  const timeText = formatNotificationTime(item.createdAt)

  return (
    <li
      className={ITEM_SLOT_CLASS}
      data-notification-id={item.id}
      data-notification-type={item.type}
      data-notification-read={item.readAt ? "true" : "false"}
    >
      <img src={publicAsset(NOTIFICATION_ASSETS.itemSlot)} alt="" draggable={false} className={ITEM_SLOT_IMG_CLASS} />
      <div className={ITEM_INNER_CLASS}>
        {/* 제목과 같은 줄 오른쪽에 받은 시각을 작게 (줄 높이를 안 늘리려고) */}
        <div className={ITEM_TITLE_ROW_CLASS}>
          <p className={ITEM_TITLE_CLASS}>{item.title}</p>
          {timeText ? <time className={ITEM_TIME_CLASS} dateTime={item.createdAt}>{timeText}</time> : null}
        </div>
        <p className={ITEM_BODY_CLASS}>{item.body}</p>
        <ItemActions
          item={item}
          pending={pending}
          error={error}
          onOpenTarget={onOpenTarget}
          onRetryRead={onRetryRead}
        />
      </div>
    </li>
  )
}
