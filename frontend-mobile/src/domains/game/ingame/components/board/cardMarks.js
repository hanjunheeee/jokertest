// 카드 강조·표시 고르기: 고른 대상 강조, 낸 투표·밤 지목 표시
// Board가 카드마다 부름 (행동 컨텍스트 값만 읽음)

// 표시 글 (작은 카드 위쪽 띠)
export const MARK_LABELS = {
    vote: "내 투표",
    night: "내 지목",
}

// 데스크톱과 같이 고른 대상이면 강조, 낸 투표·밤 행동 대상이면 표시 종류
export function resolveCardMark(ctx, playerId) {
    if (!ctx) return { highlight: false, mark: null }
    const highlight = playerId === ctx.selectedDayVoteTargetId || playerId === ctx.selectedNightTargetId
    const phase = ctx.gameState?.phase ?? null
    if (phase === "DAY" && ctx.dayVoteHasSubmitted && ctx.dayVoteLastSubmittedTargetId === playerId) {
        return { highlight, mark: "vote" }
    }
    if (phase === "NIGHT" && ctx.nightActionLastSubmittedTargetId === playerId) {
        return { highlight, mark: "night" }
    }
    return { highlight, mark: null }
}
