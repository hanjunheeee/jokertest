// 전부 수락 결과를 한 줄 안내 문구로 만드는 계산
// 받은 친구 신청 탭의 결과 안내가 씀

// 끝나기 전엔 진행 문구, 끝나면 건수별 문구를 이어 붙임 (아직 안 돌렸으면 null)
export function buildAcceptAllSummary(result) {
  if (result === null || result === undefined) return null
  if (result.running) return "받은 요청을 하나씩 처리하는 중입니다…"
  if (result.completedAt === null) return null

  const parts = []
  if (result.accepted > 0) parts.push(`${result.accepted}건 수락`)
  if (result.failed > 0) parts.push(`${result.failed}건 실패`)
  if (result.unconfirmed > 0) parts.push(`${result.unconfirmed}건은 결과를 확정하지 못했습니다`)
  if (parts.length === 0) parts.push("처리할 요청이 없었습니다")
  return parts.join(" · ")
}
