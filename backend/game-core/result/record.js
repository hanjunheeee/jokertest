// 전적 기록 만드는 파일
// 판 → DB 전적 기록 + 테스트 판 구분, 전적 저장·판 만들기가 사용
const { ROLE_TEAMS } = require('../core/rules/roles')
const { observeNightCommit } = require('../core/tools/observer')
const { ABORTED_WINNER, ABORTED_WIN_REASON, WIN_REASON_BY_WINNER, DEATH_REASONS } = require('./constants')

// 테스트 판인지 운영 판인지 (시험 환경이면 test)
function resolveGameSource() {
    // 환경 변수로 운영 판이라고 못박았으면 그대로 운영
    if (process.env.GAME_SOURCE_OVERRIDE === 'production') return 'production'
    return process.env.NODE_ENV === 'test' ? 'test' : 'production'
}

// 죽은 이유: 산 사람은 없음, 판 깨지게 만든 나간 사람은 끊김, 나머지는 판에 적힌 이유
function resolveDeathReason(player, isAlive, interruptedLeaver) {
    if (isAlive) return null
    if (interruptedLeaver) return DEATH_REASONS.DISCONNECT
    return player.deathReason ?? null
}

// 이겼는지: 끝난 판은 팀 비교, 깨진 판은 나간 사람만 패, 나머지는 null
// 산 채로 판을 떠난 사람(나가기·추방·끊김 탈락)은 편이 이겨도 패 (BE-007), 죽은 뒤 나간 사람은 편 결과 그대로
function resolveWon(player, team, { completed, winner, interruptedLeaver }) {
    if (completed) return team === winner && player.deathReason !== DEATH_REASONS.DISCONNECT
    if (interruptedLeaver) return false
    return null
}

// 사람 한 명 → 참가 기록 한 줄
function buildPlayerRow(session, player, { completed, disconnectedUuid, winner }) {
    // 판 깨지게 만든 나간 사람은 죽은 걸로 침 (끊김)
    const interruptedLeaver = !completed && player.uuid === disconnectedUuid
    const isAlive = interruptedLeaver ? false : player.alive === true
    const team = player.team ?? ROLE_TEAMS[player.role] ?? null
    return {
        game_id: session.id,
        user_id: player.uuid,
        nickname_snapshot: player.nickname,
        role: player.role,
        team,
        won: resolveWon(player, team, { completed, winner, interruptedLeaver }),
        is_alive: isAlive,
        death_reason: resolveDeathReason(player, isAlive, interruptedLeaver),
    }
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
        const row = buildPlayerRow(session, player, { completed, disconnectedUuid, winner })
        players.push(row)

        // 승패 없는 사람은 통계에 안 셈
        if (row.won === null) continue
        stats.push({
            user_id: player.uuid,
            total_games: 1,
            survival_count: row.is_alive ? 1 : 0,
            execution_count: row.death_reason === DEATH_REASONS.EXECUTION ? 1 : 0,
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
            // 점검 강제 종료 판은 MAINTENANCE (abortReason은 점검 판 끝내기가 붙임), 나머지 깨진 판은 ABORTED
            win_reason: completed ? (WIN_REASON_BY_WINNER[winner] ?? null) : (session.abortReason ?? ABORTED_WIN_REASON),
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