// 탭 안 안내 한 줄 (비었음·불러오는 중·오류, 있으면 다시 시도·이동 버튼)
// 친구 시트 탭들이 목록 대신·목록 위에 그림
import { NOTICE_CLASS, TEXT_BUTTON_CLASS } from "../sheetStyle.js"

const TONE_CLASS = {
  muted: "text-white/60",
  error: "text-red-300/90",
  info: "text-[#ebe2cc]",
}

// 글자는 화면 읽기에 바로 알림 (role=status), 버튼은 글자 아래에 둠
export default function Notice({ tone = "muted", actionLabel = null, onAction = null, children, ...rest }) {
  return (
    <div role="status" className={`${NOTICE_CLASS} ${TONE_CLASS[tone]}`} {...rest}>
      <p className="text-inherit">{children}</p>
      {actionLabel !== null && onAction !== null ? (
        <button type="button" onClick={onAction} className={`mt-3 ${TEXT_BUTTON_CLASS}`}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
