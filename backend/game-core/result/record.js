// 전적 기록 만드는 파일
// 판 하나 → DB에 넣을 전적 기록 + 테스트 판인지 구분, socket 쪽 전적 저장이 사용
const { ROLE_TEAMS } = require('../core/roles')
const { observeNightCommit } = require('../core/observer')
const { ABORTED_WINNER, ABORTED_WIN_REASON, WIN_REASON_BY_WINNER, DEATH_REASONS } = require('./constants')

// 테스트 판인지 운영 판인지 (시험 환경이면 test)
function resolveGameSource() {
    if (process.env.GAME_SOURCE_OVERRIDE === 'production') return 'production'
    return process.env.NODE_ENV === 'test' ? 'test' : 'production'
}

// 끝난 판 → 전적 기록 (참가자·역할·생존·통계)
function buildGameResultRecord(session, {
    completed = session.phase === 'ENDED' && !!session.winResult,
    disconnectedUuid,
    endedAt = Date.now(),
} = {}) {
    observeNightCommit('RESULT_RECORD_BUILD_STARTED', { gameId: session?.id ?? null, completed })

    const winner = completed ? session.winResult.winner : ABORTED_WINNER
    const resolvedEndedAt = new Date(completed ? session.endedAt ?? endedAt : endedAt)

    const players = []
    const stats = []
    for (const player of session.players.values()) {
        const interruptedLeaver = !completed && player.uuid === disconnectedUuid
        const isAlive = interruptedLeaver ? false : player.alive === true
        const deathReason = isAlive
            ? null
            : interruptedLeaver
                ? DEATH_REASONS.DISCONNECT
                : player.deathReason ?? null
        const team = player.team ?? ROLE_TEAMS[player.role] ?? null
        const won = completed ? team === winner : interruptedLeaver ? false : null

        players.push({
            game_id: session.id,
            user_id: player.uuid,
            nickname_snapshot: player.nickname,
            role: player.role,
            team,
            won,
            is_alive: isAlive,
            death_reason: deathReason,
        })

        if (won === null) continue
        stats.push({
            user_id: player.uuid,
            total_games: 1,
            survival_count: isAlive ? 1 : 0,
            execution_count: deathReason === DEATH_REASONS.EXECUTION ? 1 : 0,
        })
    }

    return {
        result: {
            id: session.id,
            room_id: session.roomId ?? null,
            started_at: new Date(session.startedAt ?? resolvedEndedAt.getTime()),
            ended_at: resolvedEndedAt,
            winner,
            win_reason: completed ? (WIN_REASON_BY_WINNER[winner] ?? null) : ABORTED_WIN_REASON,
            day_index: session.dayIndex,
            player_count: session.players.size,
            settings: {
                jokerCount: session.jokerCount ?? null,
                roleComposition: { ...(session.roleComposition ?? {}) },
                timerSettings: {
                    ...(session.timerSettings ?? {}),
                    roleNightActionTimes: { ...(session.timerSettings?.roleNightActionTimes ?? {}) },
                },
                gameSource: { v: 1, value: session.gameSource ?? resolveGameSource() },
            },
            completed,
        },
        players,
        stats,
    }
}

module.exports = { resolveGameSource, buildGameResultRecord }