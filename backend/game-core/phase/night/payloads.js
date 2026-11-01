// 밤 방송 내용 파일
// 밤 차례·결과·사망 공개 방송 내용, socket 밤 방송·스냅샷·밤 판정이 사용
const { PUBLIC_NIGHT_DEATH_SOURCES } = require('./constants')

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
        // 생존 목록엔 uuid·생사만 (역할 안 실음)
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
        // 사망 공개도 누가·무엇에 죽었나만 골라 담음
        deathReveals: (Array.isArray(deathReveals) ? deathReveals : []).map(({ victimUuid: v, source }) => ({
            victimUuid: v,
            source,
        })),
    }
}

// 죽은 이유 하나로 정하기 (하나로 안 정해지면 모름)
function resolveNightDeathSource(resolution, victimUuid) {
    // 광대 암살·마녀사냥꾼 처형 중 이 사람 겨눈 쪽 모으기
    const attributions = []
    if (resolution?.assassinationTargetId === victimUuid) attributions.push(PUBLIC_NIGHT_DEATH_SOURCES.JOKER)
    if (resolution?.witchHunterExecutionTargetId === victimUuid) {
        attributions.push(PUBLIC_NIGHT_DEATH_SOURCES.WITCH_HUNTER)
    }
    return attributions.length === 1 ? attributions[0] : PUBLIC_NIGHT_DEATH_SOURCES.UNKNOWN_NIGHT
}

// 밤 사망 공개 목록 (중복 빼고)
function buildNightDeathReveals(resolution, victimUuids) {
    const reveals = [] 
    const seen = new Set()
    for (const victimUuid of victimUuids) {
        // 빈 값·이미 넣은 사람은 건너뜀
        if (typeof victimUuid !== 'string' || victimUuid.length === 0) continue
        if (seen.has(victimUuid)) continue
        seen.add(victimUuid)
        reveals.push({ victimUuid, source: resolveNightDeathSource(resolution, victimUuid) })
    }
    return reveals
}

module.exports = {
    buildNightTurnStartedPayload,
    buildNightTurnEndedPayload,
    buildAssassinationFailureNotice,
    buildNightResultAppliedPayload,
    resolveNightDeathSource,
    buildNightDeathReveals,
}
