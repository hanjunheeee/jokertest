// 행동 칸 알림 글 고르기: 낮 표·토론 준비·밤 고르기가 거절됐거나 끊긴 채 눌렀을 때 보일 글 하나 (상태를 안 건드리는 순수 계산)
// PC 구석 행동 패널·모바일 행동 줄이 사용 (재판 표 거절 글은 재판 창이 따로 그림)

// 빈 글·글 아님은 없는 것으로 봄
const textOrNull = (value) => (typeof value === "string" && value.trim().length > 0 ? value : null)

// 지금 단계의 글만 고름 (지난 단계 글이 남아 보이지 않게)
// 예: 밤 + nightActionError "동료 광대는 고를 수 없습니다." → 그 글, 낮 투표 + dayVoteError { message: "…" } → 그 글, 없으면 null
export function selectActionNotice(ctx) {
  const phase = ctx?.gameState?.phase ?? null
  if (phase === "NIGHT") return textOrNull(ctx.nightActionError)
  if (phase !== "DAY") return null
  if (ctx.dayPhase === "DAY_VOTE") return textOrNull(ctx.dayVoteError?.message)
  if (ctx.dayPhase === "DAY_DISCUSSION") return textOrNull(ctx.dayReadyError)
  return null
}
