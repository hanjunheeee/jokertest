// 바뀜 방송 파일
// 단계 바뀜 + 참여 바뀜(누가 나감) 방송 내용
const { buildPublicPhaseProgress } = require('./progress')

// 단계 바뀜 방송 (판 id·단계·날짜)
function buildPhaseChangedPayload(session) {
    return { gameId: session.id, phase: session.phase, dayIndex: session.dayIndex }
}

// 누가 나갔을 때 방송 (방장·참여 번호·사람 목록·진행 표시)
function buildParticipationChangedPayload(session, departedUuid) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        hostUuid: session.hostUuid ?? null,
        participationRevision: session.participationRevision ?? 0,
        departedUuid,
        players: [...session.players.values()].map((player) => ({
            uuid: player.uuid,
            membershipId: player.membershipId ?? null,
            alive: player.alive === true,
            isParticipating: player.isParticipating !== false,
        })),
        progress: buildPublicPhaseProgress(session),
    }
}

module.exports = {
    buildPhaseChangedPayload,
    buildParticipationChangedPayload,
}
