// 친구 추가 탭 (닉네임 검색·검색 결과 또는 보낸 신청 목록·뒤로)
// FriendListPanelContent가 request 탭일 때 그림
import {
  REQUEST_BACK_BTN_CLASS,
  REQUEST_TAB_CLASS,
} from "../../../constants/friendListStyle.js"
import { useFriendSearch } from "../../../hooks/useFriendSearch.js"
import { useOutgoingRequests } from "../../../hooks/friendPanel/useOutgoingRequests.js"
import BackButton from "../../../../../shared/ui/BackButton.jsx"
import FriendListSearchBar from "../FriendListSearchBar.jsx"
import FriendRequestResultsList from "./results/FriendRequestResultsList.jsx"
import OutgoingRequestList from "./outgoing/OutgoingRequestList.jsx"

// 검색·신청 상태는 useFriendSearch가 가지고, 차단은 패널에서 받음
export default function FriendRequestTab({ onBack, onBlock, blockingIds = new Set() }) {
  const {
    query,
    setQuery,
    results,
    searching,
    isSearching,
    sentIds,
    errorMsg,
    sendingIds,
    sendErrors,
    handleSearch,
    handleSend,
  } = useFriendSearch()
  const { outgoingRequests, outgoingError, cancelingIds, cancelErrors, handleCancel } = useOutgoingRequests()

  return (
    <div className={REQUEST_TAB_CLASS}>
      <FriendListSearchBar
        label="친구 검색"
        placeholder="검색할 친구 닉네임 입력"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onSubmit={handleSearch}
      />
      <FriendRequestResultsList
        results={results}
        searching={searching}
        isSearching={isSearching}
        errorMsg={errorMsg}
        sentIds={sentIds}
        sendingIds={sendingIds}
        sendErrors={sendErrors}
        onSend={handleSend}
        onBlock={onBlock}
        blockingIds={blockingIds}
      />
      {/* 검색하지 않을 땐 그 자리에 보낸 신청 목록 (검색 결과와 같이 안 보임) */}
      {isSearching ? null : (
        <OutgoingRequestList
          requests={outgoingRequests}
          error={outgoingError}
          cancelingIds={cancelingIds}
          cancelErrors={cancelErrors}
          onCancel={handleCancel}
        />
      )}
      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className={REQUEST_BACK_BTN_CLASS}
      />
    </div>
  )
}
