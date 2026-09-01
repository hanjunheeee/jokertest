/** 친구 목록 로컬 필터 — 검색 대상 필드 */
export const FRIEND_LIST_FILTER_FIELDS = {
  friend: ["name"],
  incomingRequest: ["name", "id"],
}

/** 친구 목록 로컬 필터 — 검색 UI 문구 */
export const FRIEND_LIST_FILTER_SEARCH = {
  listTab: {
    label: "친구 검색",
    placeholder: "검색할 친구 닉네임 입력",
  },
  acceptTab: {
    label: "요청 검색",
    placeholder: "닉네임 또는 ID 입력",
  },
}

/** 친구 목록 로컬 필터 — 빈 상태 문구 */
export const FRIEND_LIST_FILTER_MESSAGES = {
  noResults: "검색 결과가 없습니다.",
  noIncomingRequests: "받은 친구 요청이 없습니다.",
}
