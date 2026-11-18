// 낮 투표 판정 결과 값 → 글 한 표: 짧은 글(투표 현황 창 "결과" 칸)·까닭 글(재판 없이 밤일 때 "밤이 되었습니다" 아래 줄)
// PC 투표 현황 창(InGameVoteStatusContent)·밤 안내 까닭(constants/ingamePhaseEntrance.js)·모바일 투표 현황(VoteStatusContent)이 읽음

// 까닭 글은 투표 현황 창을 안 열어도 왜 밤이 됐는지 모두 알게 함 (사용자 결정 2026-11-18), 재판을 거쳐 온 밤(TRIBUNAL)엔 없음
export const DAY_VOTE_OUTCOME_TEXTS = Object.freeze({
  TRIBUNAL: { label: "재판 회부", nightReason: null },
  TIE: { label: "동점", nightReason: "최다 득표가 동점이라 재판이 열리지 않았습니다" },
  // 기권이 최다 득표 이상이라 재판 없이 밤 (2026-11-16 규칙)
  ABSTAIN_MAJORITY: { label: "기권이 많아 재판 없음", nightReason: "기권이 많아 재판이 열리지 않았습니다" },
  ABSTAINED: { label: "전원 기권", nightReason: "모두 기권하여 재판이 열리지 않았습니다" },
  // 뽑힌 사람이 그 순간 끊겨 있어 재판 없이 밤 (글이 없으면 영어 값이 그대로 보여서 넣음)
  DEFENDANT_DISCONNECTED: {
    label: "재판 대상의 연결이 끊겨 재판 없음",
    nightReason: "재판 대상의 연결이 끊겨 재판이 열리지 않았습니다",
  },
})
