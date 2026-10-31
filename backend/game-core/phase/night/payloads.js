// 밤 방송 내용 파일
// 밤 차례 시작·끝 + 밤 결과 방송 내용

// 역할 차례 시작 방송 (마감 시각 포함)
function buildNightTurnStartedPayload(session, role, deadline) {
    return { gameId: session.id, dayIndex: session.dayIndex, role, deadline }
}

// 역할 차례 끝 방송
function buildNightTurnEndedPayload(session, role) {
    return { gameId: session.id, dayIndex: session.dayIndex, role }
}

// 광대한테: 암살 실패 알림
function buildAssassinationFailureNotice() {
    return { actionType: 'ASSASSINATE', success: false }
}

// 밤 결과 적용 방송 (단계·생존 목록·죽은 사람·사망 공개)
function buildNightResultAppliedPayload(session, victimUuid, deathReveals = []) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
        deathReveals: (Array.isArray(deathReveals) ? deathReveals : []).map(({ victimUuid: v, source }) => ({
            victimUuid: v,
            source,
        })),
    }
}

module.exports = {
    buildNightTurnStartedPayload,
    buildNightTurnEndedPayload,
    buildAssassinationFailureNotice,
    buildNightResultAppliedPayload,
}
