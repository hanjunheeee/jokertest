import {
  FRIEND_ACCEPT_ALL_BUTTON_CLASS,
  FRIEND_ACCEPT_ALL_LABEL_CLASS,
  FRIEND_ACCEPT_BACK_BUTTON_CLASS,
  FRIEND_ACCEPT_BUTTON_IMAGE_CLASS,
  FRIEND_ACCEPT_EMPTY_CLASS,
  FRIEND_ACCEPT_LIST_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_CLASS,
  FRIEND_ACCEPT_TAB_CLASS,
  FRIEND_ACCEPT_TOOLBAR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import BackButton from "@/shared/ui/BackButton.jsx"
import FriendListSearchBar from "@/domains/lobby/components/friendList/FriendListSearchBar.jsx"
import IncomingFriendRow from "@/domains/lobby/components/friendList/accept/IncomingFriendRow.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

// 받은 친구 요청을 한 번에 모두 수락하는 버튼입니다.
function AcceptAllButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={FRIEND_ACCEPT_ALL_BUTTON_CLASS}
      aria-label="전부 수락"
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.acceptAllButton}
        alt=""
        className={FRIEND_ACCEPT_BUTTON_IMAGE_CLASS}
      />
      <span className={FRIEND_ACCEPT_ALL_LABEL_CLASS}>전부 수락</span>
    </button>
  )
}

// 받은 친구 요청 목록을 다시 가져오는 새로고침 버튼입니다.
function FriendAcceptRefreshButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="친구 신청 목록 새로고침"
      className={FRIEND_ACCEPT_REFRESH_BUTTON_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.refreshButton}
        alt=""
        className={FRIEND_ACCEPT_BUTTON_IMAGE_CLASS}
      />
    </button>
  )
}

// 받은 친구 요청 탭 상단의 전부 수락/새로고침 버튼 영역입니다.
function FriendAcceptToolbar({ onAcceptAll, onRefresh }) {
  return (
    <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
      <AcceptAllButton onClick={onAcceptAll} />
      <FriendAcceptRefreshButton onClick={onRefresh} />
    </div>
  )
}

// 받은 친구 요청이 없을 때 보여주는 빈 상태 문구입니다.
function FriendAcceptEmptyState() {
  return (
    <li className={FRIEND_ACCEPT_EMPTY_CLASS}>
      받은 친구 요청이 없습니다.
    </li>
  )
}

// 받은 친구 요청 목록을 렌더링합니다.
function FriendAcceptRequestList({ incomingRequests, onAccept, onDecline }) {
  return (
    <ul className={FRIEND_ACCEPT_LIST_CLASS}>
      {incomingRequests.length === 0 ? (
        <FriendAcceptEmptyState />
      ) : (
        incomingRequests.map((request) => (
          <IncomingFriendRow
            key={request.request_id || request.id}
            requestId={request.request_id}
            name={request.name}
            profileSrc={request.profile}
            onAccept={onAccept}
            onDecline={onDecline}
          />
        ))
      )}
    </ul>
  )
}

// 받은 친구 요청을 검색하고 수락/거절하는 탭 화면입니다.
export default function FriendAcceptTab({
  onBack,
  incomingRequests = [],
  onAccept,
  onDecline,
  onAcceptAll,
  onRefresh,
}) {
  return (
    <div className={FRIEND_ACCEPT_TAB_CLASS}>
      <FriendListSearchBar label="요청 검색" placeholder="닉네임 또는 ID 입력" />
      <FriendAcceptToolbar onAcceptAll={onAcceptAll} onRefresh={onRefresh} />
      <FriendAcceptRequestList
        incomingRequests={incomingRequests}
        onAccept={onAccept}
        onDecline={onDecline}
      />
      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className={FRIEND_ACCEPT_BACK_BUTTON_CLASS}
      />
    </div>
  )
}
