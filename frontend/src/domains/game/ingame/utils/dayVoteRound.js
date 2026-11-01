// 낮 투표 회차(1·2차) 필드 검사와 지금 회차 읽기
// 검사는 판정 방송·스냅샷·투표 액션이, 회차 읽기는 행동 패널·카드 메뉴·투표 훅이 사용

// 회차 필드 검사 → 회차 조각 (틀리면 null)
export function parseDayVoteRoundFields(raw, rosterIds) {
  // 회차는 없으면 1차, 1·2차만
  const round = Object.hasOwn(raw, "round") ? raw.round : 1
  if (!Number.isInteger(round) || round < 1 || round > 2) return null
  // 재투표 제외 명단: 빈칸·명단 밖·중복이면 거절
  const excluded = Object.hasOwn(raw, "revoteExcludedUuids") ? raw.revoteExcludedUuids : []
  if (!Array.isArray(excluded)) return null
  if (excluded.some((id) => typeof id !== "string" || !id || (rosterIds && !rosterIds.has(id)))) return null
  if (new Set(excluded).size !== excluded.length) return null
  // 재투표면 1차에서 2명 이상 제외, 아니면 제외 명단이 비어야 함
  if (raw.outcome === "REVOTE") {
    if (raw.round !== 1 || excluded.length < 2) return null
  } else if (excluded.length !== 0) return null
  // 필드가 하나라도 오면 회차 조각, 둘 다 없으면 빈 조각
  return Object.hasOwn(raw, "round") || Object.hasOwn(raw, "revoteExcludedUuids")
    ? { round, revoteExcludedUuids: [...excluded] }
    : {}
}

// 지금 낮 투표 회차 (없으면 1차)
export function getDayVoteRound(state) {
  return state?.dayVoteRound ?? 1
}
