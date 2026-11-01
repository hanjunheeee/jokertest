// 전적 기록 만드는 파일
// 판 하나 → DB에 넣을 전적 기록 + 테스트 판인지 구분, socket 쪽 전적 저장이 사용
const { ROLE_TEAMS } = require('../core/rules/roles')
const { observeNightCommit } = require('../core/tools/observer')
const { ABORTED_WINNER, ABORTED_WIN_REASON, WIN_REASON_BY_WINNER, DEATH_REASONS } = require('./constants')

// 테스트 판인지 운영 판인지 (시험 환경이면 test)
function resolveGameSource() {
    // 환경 변수로 운영 판이라고 못박았으면 그대로 운영
    if (process.env.GAME_SOURCE_OVERRIDE === 'production') return 'production'
    return process.env.NODE_ENV === 'test' ? 'test' : 'production'
}

// 끝난 판 → 전적 기록 (참가자·역할·생존·통계)
function buildGameResultRecord(session, {
    completed = session.phase === 'ENDED' && !!session.winResult,
    disconnectedUuid,
    endedAt = Date.now(),
} = {}) {
    // 시험 관찰자한테 기록 만들기 시작 알림
    observeNightCommit('RESULT_RECORD_BUILD_STARTED', { gameId: session?.id ?? null, completed })

    // 끝까지 간 판이면 진짜 승자, 깨진 판이면 승자 없음
    const winner = completed ? session.winResult.winner : ABORTED_WINNER
    // 끝난 시각: 끝까지 간 판은 판에 적힌 시각 먼저
    const resolvedEndedAt = new Date(completed ? session.endedAt ?? endedAt : endedAt)

    // 사람별 참가 기록 + 사람별 통계 더할 값
    const players = []
    const stats = []
    for (const player of session.players.values()) {
        // 판 깨지게 만든 나간 사람은 죽은 걸로 침 (끊김)
        const interruptedLeaver = !completed && player.uuid === disconnectedUuid
        const isAlive = interruptedLeaver ? false : player.alive === true
        const deathReason = isAlive
            ? null
            : interruptedLeaver
                ? DEATH_REASONS.DISCONNECT
                : player.deathReason ?? null
        const team = player.team ?? ROLE_TEAMS[player.role] ?? null
        // 이겼는지: 끝난 판은 팀 비교, 깨진 판은 나간 사람만 패, 나머지는 null
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

        // 승패 없는 사람은 통계에 안 셈
        if (won === null) continue
        stats.push({
            user_id: player.uuid,
            total_games: 1,
            survival_count: isAlive ? 1 : 0,
            execution_count: deathReason === DEATH_REASONS.EXECUTION ? 1 : 0,
        })
    }

    // 판 한 줄 + 참가자 줄들 + 통계 줄들
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
            // 판 설정은 복사해서 넣음 (나중에 판이 바뀌어도 기록은 그대로)
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