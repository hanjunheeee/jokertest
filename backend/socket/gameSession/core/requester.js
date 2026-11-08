// 판정 요청자 고르기 파일
// 누른 사람 없는 판정(낮 투표 마감·재판 마감·이탈 뒤 바로 판정)이 core prepare에 넣을 이름 고르기
const gameSessionCore = require('../../../game-core/gameSession')

// 아직 이 판에 참여 중이고 내 판 기록도 이 판인 첫 사람 (없으면 null)
// 판 첫 사람을 그냥 쓰면 그 사람이 나간 판은 prepare가 NOT_IN_SESSION으로 실패함 (known 1-1)
function pickRequesterUuid(session) {
    for (const player of session.players.values()) {
        if (!gameSessionCore.isParticipatingInSession(session, player.uuid)) continue
        if (gameSessionCore.getActiveSessionForDeparture(player.uuid, session.id) !== session) continue
        return player.uuid
    }
    return null
}

module.exports = {
    pickRequesterUuid,
}
