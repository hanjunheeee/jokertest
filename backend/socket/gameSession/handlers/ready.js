// 확인·준비 핸들러 파일
// 역할 확인 · 낮 투표 준비 요청 (다 되면 다음 단계 방송 + 낮 타이머), register가 등록함
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate, isolateWithError } = require('../../common/isolate')
const { respond } = require('../../common/replies')
const { pickGameId, acceptRequest, acceptCoreResult, registryLogs } = require('../core/requests')
const { emitToGameChannel } = require('../delivery/broadcast')
const { emitSelfSubmissionProgress } = require('../delivery/progress')
const { startDayPhaseTimer } = require('../phase/day')

// 역할 확인 요청: 다 확인하면 낮으로 넘기고 낮 타이머 시작
function handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (지도 03-①②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameId)
    if (!fields) return
    const { gameId } = fields

    const result = acceptCoreResult(ack, () => gameSessionCore.acknowledgeRoleReveal(uuid, gameId),
        registryLogs('[역할 확인 처리 에러]', '[역할 확인 registry 불일치]', uuid, gameId))
    if (!result) return

    ack({ ok: true })

    // 다 확인했으면 낮 진입 방송 + 낮 타이머
    if (result.transitioned) {
        announceDayStep(io, result.session, '[phase 변경 알림 전송 실패]', () =>
            emitToGameChannel(io, result.session, 'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(result.session)))
    }
}

// 낮 단계 바뀜 방송 + 낮 타이머 다시 걸기, 방송이 던져도 타이머는 검 (방송 실패는 원본 에러 찍음)
function announceDayStep(io, session, emitLabel, emitStep) {
    isolateWithError(emitLabel, emitStep)
    isolate('[낮 타이머 시작 실패]', { code: 'TIMER_START_ERROR', gameId: session.id }, () => startDayPhaseTimer(io, session))
}

// 낮 투표 준비 요청: 다 준비하면 토론 → 투표로 넘기고 타이머 다시 걸기
function handleAcknowledgeDayVoteReady(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (지도 04-①)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameId)
    if (!fields) return
    const { gameId } = fields

    const result = acceptCoreResult(ack, () => gameSessionCore.acknowledgeDayVoteReady(uuid, gameId),
        registryLogs('[낮 투표 준비 처리 에러]', '[낮 투표 준비 registry 불일치]', uuid, gameId))
    if (!result) return

    // 내 준비 상태는 나한테만 먼저 알림
    isolate('[개인 진행 상태 전송 실패]', { code: 'SELF_PROGRESS_AFTER_READY', gameId },
        () => emitSelfSubmissionProgress(io, result.session, uuid))

    ack({ ok: true, readyCount: result.readyCount, requiredCount: result.requiredCount })

    // 다 준비했으면 투표 단계 방송 + 투표 타이머
    if (result.transitioned) {
        announceDayStep(io, result.session, '[낮 하위 페이즈 변경 알림 전송 실패]', () =>
            emitToGameChannel(io, result.session, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(result.session)))
    }
}

module.exports = {
    handleAcknowledgeRoleReveal,
    handleAcknowledgeDayVoteReady,
}
