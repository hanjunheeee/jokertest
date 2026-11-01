// 차단 목록 탭 (새로고침·오류·불러오는 중·없음·차단한 사용자 목록)
// SheetBody가 block 탭일 때 그림
import { LIST_CLASS, TOOLBAR_CLASS } from "../sheetStyle.js"
import Notice from "../parts/Notice.jsx"
import RefreshButton from "../parts/RefreshButton.jsx"
import BlockedRow from "./BlockedRow.jsx"

// 목록은 탭을 열 때마다 시트가 새로 받음 (데스크톱과 같음)
export default function BlockTab({ blockedUsers, status, error, processingIds, onUnblock, onRefresh }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={TOOLBAR_CLASS}>
        <RefreshButton label="차단 목록 새로고침" onClick={onRefresh} />
      </div>
      <div className={LIST_CLASS}>
        {error !== null ? <Notice tone="error" data-block-list-error="true">{error}</Notice> : null}
        {blockedUsers.length === 0 ? (
          <Notice>{status === "loading" ? "차단 목록을 불러오는 중입니다." : "차단한 사용자가 없습니다."}</Notice>
        ) : (
          <ul aria-label="차단한 사용자">
            {blockedUsers.map((user) => (
              <BlockedRow key={user.id} user={user} processing={processingIds.has(user.id)} onUnblock={onUnblock} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
