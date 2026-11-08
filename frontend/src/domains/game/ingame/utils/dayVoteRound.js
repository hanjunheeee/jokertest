// 낮 투표 번호 필드 검사와 지금 번호 읽기
// 검사는 판정 방송·스냅샷·투표 액션이, 번호 읽기는 행동 패널·카드 메뉴·투표 훅이 사용
// 재투표 삭제로 서버는 늘 1번만 보냄, 옛 칸(round·revoteExcludedUuids)은 받아도 안 터지게 둠 (사용자 결정 2026-11-09)

// 번호 필드 검사 → 번호 조각 (틀리면 null), 제외 명단 칸은 안 씀
export function parseDayVoteRoundFields(raw) {
  // 번호는 없으면 빈 조각, 있으면 1 이상 정수만
  if (!Object.hasOwn(raw, "round")) return {}
  if (!Number.isInteger(raw.round) || raw.round < 1) return null
  return { round: raw.round }
}

// 지금 낮 투표 번호 (없으면 1)
export function getDayVoteRound(state) {
  return state?.dayVoteRound ?? 1
}
