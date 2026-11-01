// 친구 추가 탭 (닉네임 검색·검색 중·오류·결과 없음·검색 결과)
// SheetBody가 request 탭일 때 그림
import { FILTER_MSGS } from "@/domains/lobby/constants/friendListFilter.js"
import { useFriendSearch } from "@/domains/lobby/hooks/useFriendSearch.js"
import { LIST_CLASS } from "../sheetStyle.js"
import SearchBar from "../parts/SearchBar.jsx"
import Notice from "../parts/Notice.jsx"
import CandidateRow from "./CandidateRow.jsx"

// 검색·신청 상태는 데스크톱 useFriendSearch가 가짐, 차단은 시트에서 받음
export default function AddTab({ onBlock, blockingIds }) {
  const { query, setQuery, results, searching, isSearching, sentIds, errorMsg, handleSearch, handleSend } = useFriendSearch()

  // 결과가 있을 때 난 신청 실패 문구는 데스크톱에선 안 보임 → 폰에선 목록 위에 보임
  const showErrorAbove = errorMsg !== "" && results.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchBar
        label="친구 검색"
        placeholder="검색할 친구 닉네임 입력"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onSubmit={handleSearch}
      />
      <div className={LIST_CLASS}>
        {!isSearching ? <Notice>닉네임을 입력하고 검색을 누르세요.</Notice> : null}
        {isSearching && results.length === 0 ? (
          <Notice tone={errorMsg ? "error" : "muted"}>
            {errorMsg || (searching ? "친구를 검색 중입니다." : FILTER_MSGS.noResults)}
          </Notice>
        ) : null}
        {showErrorAbove ? <Notice tone="error">{errorMsg}</Notice> : null}
        {isSearching && results.length > 0 ? (
          <ul aria-label="친구 검색 결과">
            {results.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                sent={sentIds.has(candidate.id)}
                blocking={blockingIds.has(candidate.id)}
                onSend={handleSend}
                onBlock={onBlock}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
