// 확인·준비 핸들러 파일
// 역할 확인·낮 투표 준비 (다 되면 낮 타이머·다음 단계 방송), register가 등록·시험은 gameSession.js로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const { respond } = require('../../common/replies')
const { pickGameId, acceptRequest, acceptCoreResult, registryLogs } = require('../core/requests')
const { emitToGameChannel } = require('../delivery/broadcast')
const { emitSelfProgress } = require('../delivery/progress')
const { announceDayStep } = require('../phase/day')
const { ensureRoleRevealTimer, stopRoleRevealTimer } = require('../phase/roleReveal')

// 역할 확인 요청: 다 확인하면 낮으로 넘기고 낮 타이머 시작, 아직이면 역할 공개 마감 걸기 (BE-002)
function handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: callback이 던져도 밖으로 안 샘
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (지도 03-①②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameId)
    if (!fields) return
    const { gameId } = fields

    // 여기부터 진짜 바뀜: 내 확인 기록 (다 확인하면 core가 낮으로 넘김)
    const result = acceptCoreResult(ack, () => gameSessionCore.acknowledgeRoleReveal(uuid, gameId),
        registryLogs('[역할 확인 처리 에러]', '[역할 확인 registry 불일치]', uuid, gameId))
    if (!result) return

    ack({ ok: true })

    // 다 확인했으면 역할 공개 마감 끄고 낮 타이머 + 낮 진입 방송
    if (result.transitioned) {
        stopRoleRevealTimer(result.session.id)
        announceDayStep(io, result.session, '[phase 변경 알림 전송 실패]', () =>
            emitToGameChannel(io, result.session, 'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(result.session)))
        return
    }
    // 아직 안 누른 사람 있음: 마감 걸어 둠 (끊긴 채 안 돌아오거나 알림이 실패해도 마감 때 넘어가게)
    isolate('[역할 공개 마감 시작 실패]', { code: 'TIMER_START_ERROR', gameId }, () => ensureRoleRevealTimer(io, result.session))
}

// 낮 투표 준비 요청: 다 준비하면 토론 → 투표로 넘기고 타이머 다시 걸기
function handleAcknowledgeDayVoteReady(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: callback이 던져도 밖으로 안 샘
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (지도 04-①)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameId)
    if (!fields) return
    const { gameId } = fields

    // 여기부터 진짜 바뀜: 내 준비 기록 (다 준비하면 core가 투표로 넘김)
    const result = acceptCoreResult(ack, () => gameSessionCore.acknowledgeDayVoteReady(uuid, gameId),
        registryLogs('[낮 투표 준비 처리 에러]', '[낮 투표 준비 registry 불일치]', uuid, gameId))
    if (!result) return

    // 내 준비 상태는 나한테만 먼저 알림
    isolate('[개인 진행 상태 전송 실패]', { code: 'SELF_PROGRESS_AFTER_READY', gameId },
        () => emitSelfProgress(io, result.session, uuid))

    ack({ ok: true, readyCount: result.readyCount, requiredCount: result.requiredCount })

    // 다 준비했으면 투표 타이머 + 투표 단계 방송 (남은 토론 시간은 버림)
    if (result.transitioned) {
        announceDayStep(io, result.session, '[낮 하위 페이즈 변경 알림 전송 실패]', () =>
            emitToGameChannel(io, result.session, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(result.session)))
    }
}

module.exports = {
    handleAcknowledgeRoleReveal,
    handleAcknowledgeDayVoteReady,
}
