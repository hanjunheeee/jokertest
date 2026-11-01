// 바뀜 방송 파일
// 단계 바뀜 + 참여 바뀜(누가 나감) 방송 내용
// socket 쪽이 gameSession.js 통해서 방송할 때 사용
const { buildPublicPhaseProgress } = require('./progress')

// 단계 바뀜 방송 (판 id·단계·날짜)
// 역할 같은 비밀은 안 실음 (지도 03-⑦)
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
        // 사람마다 생존·참여 여부만 (역할 없음)
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
