// 친구 목록 탭 안 글자 거르기 설정 (거를 칸·검색 줄 문구·빈 목록 문구)
// 친구 목록·받은 신청 탭, 빈 목록 안내, 시험이 씀

// 친구는 이름만, 받은 신청은 이름·id로 거름
export const FRIEND_LIST_FILTER_FIELDS = {
  friend: ["name"],
  incomingRequest: ["name", "id"],
}

// 탭별 검색 줄 라벨·안내 글자
export const FILTER_SEARCH = {
  listTab: {
    label: "친구 검색",
    placeholder: "검색할 친구 닉네임 입력",
  },
  acceptTab: {
    label: "요청 검색",
    placeholder: "닉네임 또는 ID 입력",
  },
}

// 검색 결과 없음·받은 신청 없음 문구
export const FILTER_MSGS = {
  noResults: "검색 결과가 없습니다.",
  noIncomingRequests: "받은 친구 요청이 없습니다.",
}
