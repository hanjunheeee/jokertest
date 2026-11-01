// 알림 목록 한 줄 (제목·본문·보러 가기·읽음 실패 다시 시도), 데스크톱 NotificationItem 모양
// 알림 본문 목록(SheetBody.jsx)이 씀
import { NOTIFICATION_ASSETS } from "@/domains/notifications/constants/notificationAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import {
  ITEM_BODY_CLASS,
  ITEM_INNER_CLASS,
  ITEM_SLOT_CLASS,
  ITEM_SLOT_IMG_CLASS,
  ITEM_TITLE_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"
import ItemActions from "@m/domains/notifications/components/sheet/ItemActions.jsx"

// 칸 그림을 줄 높이에 맞춰 늘리고 그 위에 글자·버튼, 본문은 자르지 않음
export default function NotificationRow({ item, pending, error, onOpenTarget, onRetryRead }) {
  return (
    <li
      className={ITEM_SLOT_CLASS}
      data-notification-id={item.id}
      data-notification-type={item.type}
      data-notification-read={item.readAt ? "true" : "false"}
    >
      <img src={publicAsset(NOTIFICATION_ASSETS.itemSlot)} alt="" draggable={false} className={ITEM_SLOT_IMG_CLASS} />
      <div className={ITEM_INNER_CLASS}>
        <p className={ITEM_TITLE_CLASS}>{item.title}</p>
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
