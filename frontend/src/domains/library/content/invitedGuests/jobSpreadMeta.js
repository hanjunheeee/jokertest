/** 초대받은 자들 — 직업별 숙련도 랭킹 표시 상한 */
export const INVITED_GUESTS_MASTERY_RANKING_LIMIT = 5

/** 초대받은 자들 — 책 spread 총 페이지 수 (1 spread = 1직업) */
export const INVITED_GUESTS_PAGE_COUNT = 5

/** 초대받은 자들 — spread 순서·직업 key (1 spread = 1직업) */
export const INVITED_GUESTS_JOB_SPREAD_META = [
  { id: "guest-noble", jobKey: "noble", jobLabel: "귀족" },
  { id: "guest-clown", jobKey: "clown", jobLabel: "광대" },
  { id: "guest-doctor", jobKey: "doctor", jobLabel: "주치의" },
  { id: "guest-guard", jobKey: "guard", jobLabel: "경비원" },
  { id: "guest-witch-hunter", jobKey: "witchHunter", jobLabel: "마녀사냥꾼" },
]
