// 친구 추가 탭 (닉네임 검색·검색 결과 또는 검색 중·오류·결과 없음·뒤로)
// SheetBody가 request 탭일 때 그림
import { FILTER_MSGS } from "@/domains/lobby/constants/friendListFilter.js"
import { REQUEST_EMPTY_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import { useFriendSearch } from "@/domains/lobby/hooks/useFriendSearch.js"
import { SCROLL_CLASS } from "../sheetStyle.js"
import SearchBar from "../parts/SearchBar.jsx"
import BackRow from "../parts/BackRow.jsx"
import CandidateRow from "./CandidateRow.jsx"

// 데스크톱 FriendRequestTab과 같은 갈래: 검색어가 없으면 목록을 안 그리고, 결과가 없을 때만 오류·검색 중·결과 없음 한 줄
export default function AddTab({ onBack, onBlock, blockingIds }) {
  const { query, setQuery, results, searching, isSearching, sentIds, errorMsg, handleSearch, handleSend } = useFriendSearch()

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
                  blocking={blockingIds.has(candidate.id)}
                  onSend={handleSend}
                  onBlock={onBlock}
                />
              ))
            )}
          </ul>
        ) : null}
      </div>
      <BackRow onBack={onBack} />
    </div>
  )
}
