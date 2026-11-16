// 친구 추가 탭 (닉네임 검색·검색 결과 또는 검색 중·오류·결과 없음, 검색 안 할 땐 보낸 신청 목록·뒤로)
// SheetBody가 request 탭일 때 그림
import { FILTER_MSGS } from "@/domains/lobby/constants/friendListFilter.js"
import { PAPER_DETAIL_CLASS, REQUEST_EMPTY_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import { useFriendSearch } from "@/domains/lobby/hooks/useFriendSearch.js"
import { useOutgoingRequests } from "@/domains/lobby/hooks/friendPanel/useOutgoingRequests.js"
import { SCROLL_CLASS } from "../sheetStyle.js"
import SearchBar from "../parts/SearchBar.jsx"
import BackRow from "../parts/BackRow.jsx"
import CandidateRow from "./CandidateRow.jsx"
import SentRow from "./SentRow.jsx"

// 데스크톱 FriendRequestTab과 같은 갈래: 검색어가 없으면 목록을 안 그리고, 결과가 없을 때만 오류·검색 중·결과 없음 한 줄
export default function AddTab({ onBack, onBlock, blockingIds }) {
  const {
    query, setQuery, results, searching, isSearching, sentIds, sendingIds, sendErrors, errorMsg, handleSearch, handleSend,
  } = useFriendSearch()
  // 보낸 신청 목록·취소 (데스크톱 FriendRequestTab과 같은 훅)
  const { outgoingRequests, outgoingError, cancelingIds, cancelErrors, handleCancel } = useOutgoingRequests()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchBar
        label="친구 검색"
        placeholder="검색할 친구 닉네임 입력"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onSubmit={handleSearch}
      />
      <div className={SCROLL_CLASS}>
        {isSearching ? (
          <ul className="mt-2">
            {results.length === 0 ? (
              <li className={REQUEST_EMPTY_CLASS}>
                {errorMsg || (searching ? "친구를 검색 중입니다." : FILTER_MSGS.noResults)}
              </li>
            ) : (
              results.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  sent={sentIds.has(candidate.id)}
                  sending={sendingIds?.has?.(candidate.id) === true}
                  sendError={sendErrors?.[candidate.id] ?? null}
                  blocking={blockingIds.has(candidate.id)}
                  onSend={handleSend}
                  onBlock={onBlock}
                />
              ))
            )}
          </ul>
        ) : (
          <>
            {/* 검색하지 않을 땐 보낸 신청 목록 (없으면 아무것도 안 그림, 데스크톱 OutgoingRequestList와 같음) */}
            {outgoingError !== null ? (
              <p role="status" data-outgoing-list-error="true" className={REQUEST_EMPTY_CLASS}>{outgoingError}</p>
            ) : null}
            {outgoingRequests.length > 0 ? (
              <>
                {/* 줄 없이 시트 종이 위에 바로 놓이는 머리글이라 종이용 색 (데스크톱 OutgoingRequestList와 같음) */}
                <p className={`mt-2 px-2 ${PAPER_DETAIL_CLASS}`}>보낸 신청 ({outgoingRequests.length})</p>
                <ul aria-label="보낸 친구 신청">
                  {outgoingRequests.map((request) => (
                    <SentRow
                      key={request.request_id}
                      request={request}
                      canceling={cancelingIds.has(request.request_id)}
                      error={cancelErrors[request.request_id] ?? null}
                      onCancel={handleCancel}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
      <BackRow onBack={onBack} />
    </div>
  )
}
