// 차단 목록 탭 (새로고침·오류·차단한 사용자 목록·뒤로)
// FriendListPanelContent가 block 탭일 때 그림
import {
  FRIEND_ACCEPT_BACK_BUTTON_CLASS,
  FRIEND_ACCEPT_EMPTY_CLASS,
  FRIEND_ACCEPT_LIST_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS,
  FRIEND_ACCEPT_TAB_CLASS,
  FRIEND_ACCEPT_TOOLBAR_CLASS,
} from "../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import BackButton from "../../../../../shared/ui/BackButton.jsx"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"
import BlockedUserRow from "./BlockedUserRow.jsx"

// 받은 신청 탭과 같은 틀을 씀, 비었을 땐 불러오는 중·없음 안내
export default function FriendBlockTab({
  onBack,
  blockedUsers = [],
  status = "idle",
  error = null,
  processingIds = new Set(),
  onUnblock,
  onRefresh,
}) {
  return (
    <div className={FRIEND_ACCEPT_TAB_CLASS}>
      <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="차단 목록 새로고침"
          className={FRIEND_ACCEPT_REFRESH_BUTTON_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset src={FRIEND_LIST_ASSETS.refreshButton} alt="" className={FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS} />
        </button>
      </div>

      {error !== null ? (
        <p role="status" data-block-list-error="true" className={FRIEND_ACCEPT_EMPTY_CLASS}>
          {error}
        </p>
      ) : null}

      <ul className={FRIEND_ACCEPT_LIST_CLASS} aria-label="차단한 사용자">
        {blockedUsers.length === 0 ? (
          <li className={FRIEND_ACCEPT_EMPTY_CLASS}>
            {status === "loading" ? "차단 목록을 불러오는 중입니다." : "차단한 사용자가 없습니다."}
          </li>
        ) : (
          blockedUsers.map((user) => (
            <BlockedUserRow
              key={user.id}
              user={user}
              onUnblock={onUnblock}
              processing={processingIds.has(user.id)}
            />
          ))
        )}
      </ul>

      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className={FRIEND_ACCEPT_BACK_BUTTON_CLASS}
      />
    </div>
  )
}
