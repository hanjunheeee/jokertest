// 알림 시트 본문 (오류·불러오는 중·비어 있음·목록·상세 중 하나)
// 알림 시트(NotificationSheet.jsx)가 양피지 판 안에 넣어 씀
import {
  CENTER_CLASS,
  EMPTY_MSG_CLASS,
  ERROR_ON_PARCHMENT_CLASS,
  LIST_CLASS,
  MSG_CLASS,
  PARCHMENT_CLASS,
  SCROLL_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"
import ActionButton from "@m/domains/notifications/components/sheet/ActionButton.jsx"
import NotificationRow from "@m/domains/notifications/components/sheet/NotificationRow.jsx"
import NotificationDetail from "@m/domains/notifications/components/sheet/NotificationDetail.jsx"

// 목록 아닌 상태 글, 오류면 다시 시도 버튼 붙임
function renderMessage(sheet) {
  if (sheet.bodyState === "error") {
    return (
      <div className={CENTER_CLASS} data-notification-state="error">
        <p className={ERROR_ON_PARCHMENT_CLASS} role="alert">{sheet.error ?? "알림을 불러오지 못했습니다."}</p>
        <ActionButton label="다시 시도" action="retry-list" onClick={sheet.retryList} />
      </div>
    )
  }
  if (sheet.bodyState === "loading") {
    return (
      <div className={CENTER_CLASS} data-notification-state="loading">
        <p className={MSG_CLASS} role="status">알림을 불러오는 중입니다.</p>
      </div>
    )
  }
  return (
    <div className={CENTER_CLASS} data-notification-state="empty">
      <p className={EMPTY_MSG_CLASS}>표시할 알림이 없습니다.</p>
    </div>
  )
}

// 상세를 골랐으면 상세, 아니면 상태별 본문
function renderContent(sheet) {
  const shared = { onOpenTarget: sheet.openTarget, onRetryRead: sheet.retryRead }
  if (sheet.selected) {
    return <NotificationDetail item={sheet.selected} {...sheet.itemState(sheet.selected)} {...shared} />
  }
  if (sheet.bodyState !== "list") return renderMessage(sheet)
  return (
    <ul className={LIST_CLASS} data-notification-state="list">
      {sheet.visible.map((item) => (
        <NotificationRow key={item.id} item={item} {...sheet.itemState(item)} onSelect={sheet.select} {...shared} />
      ))}
    </ul>
  )
}

// 스크롤은 이 칸 하나만, 기본 터치 스크롤 씀
export default function SheetBody({ sheet }) {
  return (
    <div className={PARCHMENT_CLASS}>
      <div className={SCROLL_CLASS} data-notification-scroll={sheet.selected ? "detail" : sheet.bodyState}>
        {renderContent(sheet)}
      </div>
    </div>
  )
}
