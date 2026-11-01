// 알림 목록 한 줄 (제목·본문 두 줄·보러 가기), 글자 부분을 누르면 상세로
// 알림 본문 목록(SheetBody.jsx)이 씀
import { NOTIFICATION_ASSETS } from "@/domains/notifications/constants/notificationAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import {
  ITEM_TITLE_CLASS,
  ROW_BODY_CLASS,
  ROW_CHEVRON_CLASS,
  ROW_CLASS,
  ROW_INNER_CLASS,
  ROW_SLOT_IMG_CLASS,
  ROW_TAP_CLASS,
  ROW_TEXT_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"
import ItemActions from "@m/domains/notifications/components/sheet/ItemActions.jsx"

// 버튼 안에 버튼을 못 넣어서 누르는 글자 칸과 버튼 줄을 나눔
export default function NotificationRow({ item, pending, error, onSelect, onOpenTarget, onRetryRead }) {
  return (
    <li
      className={ROW_CLASS}
      data-notification-id={item.id}
      data-notification-type={item.type}
      data-notification-read={item.readAt ? "true" : "false"}
    >
      <img src={publicAsset(NOTIFICATION_ASSETS.itemSlot)} alt="" draggable={false} className={ROW_SLOT_IMG_CLASS} />
      <div className={ROW_INNER_CLASS}>
        <button
          type="button"
          className={ROW_TAP_CLASS}
          aria-label={`${item.title} 자세히 보기`}
          data-notification-action="open-detail"
          onClick={() => onSelect(item.id)}
        >
          <span className={ROW_TEXT_CLASS}>
            <span className={ITEM_TITLE_CLASS}>{item.title}</span>
            <span className={ROW_BODY_CLASS}>{item.body}</span>
          </span>
          <span className={ROW_CHEVRON_CLASS} aria-hidden="true">›</span>
        </button>
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
