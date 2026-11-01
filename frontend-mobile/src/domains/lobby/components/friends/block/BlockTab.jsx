// 차단 목록 탭 (새로고침·오류·차단한 사용자 목록 또는 불러오는 중·없음·뒤로)
// SheetBody가 block 탭일 때 그림
import { ACCEPT_EMPTY_CLASS, ACCEPT_TOOLBAR_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import { SCROLL_CLASS } from "../sheetStyle.js"
import RefreshButton from "../parts/RefreshButton.jsx"
import BackRow from "../parts/BackRow.jsx"
import BlockedRow from "./BlockedRow.jsx"

// 데스크톱 FriendBlockTab과 같은 순서·문구, 목록은 탭을 열 때마다 시트가 새로 받음
export default function BlockTab({ onBack, blockedUsers, status, error, processingIds, onUnblock, onRefresh }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`${ACCEPT_TOOLBAR_CLASS} !mt-0 !pr-0`}>
        <RefreshButton label="차단 목록 새로고침" onClick={onRefresh} />
      </div>
      <div className={SCROLL_CLASS}>
        {error !== null ? (
          <p role="status" data-block-list-error="true" className={ACCEPT_EMPTY_CLASS}>{error}</p>
        ) : null}
        <ul className="mt-2" aria-label="차단한 사용자">
          {blockedUsers.length === 0 ? (
            <li className={ACCEPT_EMPTY_CLASS}>
              {status === "loading" ? "차단 목록을 불러오는 중입니다." : "차단한 사용자가 없습니다."}
            </li>
          ) : (
            blockedUsers.map((user) => (
              <BlockedRow key={user.id} user={user} processing={processingIds.has(user.id)} onUnblock={onUnblock} />
            ))
          )}
        </ul>
      </div>
      <BackRow onBack={onBack} />
    </div>
  )
}
