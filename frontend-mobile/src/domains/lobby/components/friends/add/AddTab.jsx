// 친구 추가 탭 (닉네임 검색·검색 결과 또는 보낸 신청 목록·뒤로)
// SheetBody가 request 탭일 때 그림
import { FILTER_MSGS } from "@/domains/lobby/constants/friendListFilter.js"
import { REQUEST_EMPTY_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import { useOutgoingRequests } from "@/domains/lobby/hooks/friendPanel/useOutgoingRequests.js"
import { useFriendSearch } from "@/domains/lobby/hooks/useFriendSearch.js"
import { SCROLL_CLASS } from "../sheetStyle.js"
import SearchBar from "../parts/SearchBar.jsx"
import BackRow from "../parts/BackRow.jsx"
import CandidateRow from "./CandidateRow.jsx"
import OutgoingList from "./OutgoingList.jsx"

// 검색 중이면 검색 결과를, 검색하지 않을 땐 보낸 신청 목록을 그림
export default function AddTab({ onBack, onBlock, blockingIds, blockErrors = {} }) {
  const {
    query, setQuery, results, searching, isSearching, sentIds, sendingIds, sendErrors, errorMsg, handleSearch, handleSend,
  } = useFriendSearch()
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
                  blockError={blockErrors?.[candidate.id] ?? null}
                  blocking={blockingIds.has(candidate.id)}
                  onSend={handleSend}
                  onBlock={onBlock}
                />
              ))
            )}
          </ul>
        ) : (
          <OutgoingList
            requests={outgoingRequests}
            error={outgoingError}
            cancelingIds={cancelingIds}
            cancelErrors={cancelErrors}
            onCancel={handleCancel}
          />
        )}
      </div>
      <BackRow onBack={onBack} />
    </div>
  )
}
