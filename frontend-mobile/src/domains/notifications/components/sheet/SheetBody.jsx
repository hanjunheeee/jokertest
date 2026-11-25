// 알림 창 본문 (오류·불러오는 중·비어 있음·목록 중 하나), 데스크톱 renderBody와 같은 갈래·문구
// 알림 창(NotificationSheet.jsx)이 틀 안에 넣어 씀
import {
  CENTER_CLASS,
  EMPTY_MSG_CLASS,
  ERROR_CLASS,
  LIST_CLASS,
  MSG_CLASS,
  SCROLL_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"
import ActionButton from "@m/domains/notifications/components/sheet/ActionButton.jsx"
import NotificationRow from "@m/domains/notifications/components/sheet/NotificationRow.jsx"

// 목록 아닌 상태 글, 오류면 다시 시도 버튼 붙임
function renderMessage(sheet) {
  if (sheet.bodyState === "error") {
    return (
      <div className={CENTER_CLASS} data-notification-state="error">
        <p className={ERROR_CLASS} role="alert">{sheet.error ?? "알림을 불러오지 못했습니다."}</p>
        <ActionButton label="다시 시도" action="retry-list" onClick={sheet.retryList} />
      </div>
    )
  }
  if (sheet.bodyState === "loading") {
    return (
      <div className={CENTER_CLASS} data-notification-state="loading">
        <p className={MSG_CLASS}>알림을 불러오는 중입니다.</p>
      </div>
    )
  }
  return (
    <div className={CENTER_CLASS} data-notification-state="empty">
      <p className={EMPTY_MSG_CLASS}>표시할 알림이 없습니다.</p>
    </div>
  )
}

// 스크롤은 이 칸 하나만, 기본 터치 스크롤 씀
export default function SheetBody({ sheet }) {
  return (
    <div className={SCROLL_CLASS} data-notification-scroll={sheet.bodyState}>
      {sheet.bodyState !== "list" ? renderMessage(sheet) : (
        <ul className={LIST_CLASS} data-notification-state="list">
          {sheet.visible.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              {...sheet.itemState(item)}
              onOpenTarget={sheet.openTarget}
              onRetryRead={sheet.retryRead}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
