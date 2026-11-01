// 알림 상세 (제목·받은 때·본문 전체·보러 가기)
// 알림 시트(NotificationSheet.jsx)가 목록 대신 그림
import {
  DETAIL_BODY_CLASS,
  DETAIL_CLASS,
  DETAIL_DATE_CLASS,
  DETAIL_INNER_CLASS,
  DETAIL_TITLE_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"
import ItemActions from "@m/domains/notifications/components/sheet/ItemActions.jsx"

// 받은 때 글자, 못 읽는 시각이면 빈 글자
function formatDate(value) {
  const time = Date.parse(value ?? "")
  if (Number.isNaN(time)) return ""
  return new Date(time).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })
}

// 칸 그림은 세로로 늘이면 뭉개져서 같은 색 판으로 그림, 본문은 잘리지 않게 다 보임
export default function NotificationDetail({ item, pending, error, onOpenTarget, onRetryRead }) {
  const date = formatDate(item.createdAt)

  return (
    <article className={DETAIL_CLASS} data-notification-detail={item.id}>
      <div className={DETAIL_INNER_CLASS}>
        <h3 className={DETAIL_TITLE_CLASS}>{item.title}</h3>
        {date ? <p className={DETAIL_DATE_CLASS}>{date}</p> : null}
        <p className={DETAIL_BODY_CLASS}>{item.body}</p>
        <ItemActions
          item={item}
          pending={pending}
          error={error}
          onOpenTarget={onOpenTarget}
          onRetryRead={onRetryRead}
        />
      </div>
    </article>
  )
}
