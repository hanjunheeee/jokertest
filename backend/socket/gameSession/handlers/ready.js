// 확인·준비 핸들러 파일
// 역할 확인(ok만 답함)·낮 투표 준비 (다 되면 낮 타이머·다음 단계 방송), register가 등록·시험은 gameSession.js로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const { respond } = require('../../common/replies')
const { pickGameId, acceptRequest, acceptCoreResult, registryLogs } = require('../core/requests')
const { emitToGameChannel } = require('../delivery/broadcast')
const { emitSelfProgress } = require('../delivery/progress')
const { announceDayStep } = require('../phase/day')

// 역할 확인 요청: 서버는 확인을 안 기다려 ok만 답함 (사용자 결정 2026-11-09)
// 옛 화면이 보내도 답 기다리다 실패 안내 안 띄우게 처리기는 남김, 첫 낮은 역할 공개 마감 타이머만 넘김
function handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    respond(callback, { ok: true })
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
