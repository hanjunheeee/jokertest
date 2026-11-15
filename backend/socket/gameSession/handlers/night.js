// 밤 핸들러 파일
// 밤 행동 제출 (그 역할 다 고르면 5초 뒤 턴 닫힘), register가 등록·시험은 gameSession.js로 바로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const { labeledResponder } = require('../../common/replies')
const { INTERNAL_ONLY_CODES } = require('../core/constants')
const { pickGameTarget, acceptRequest, acceptCoreResult } = require('../core/requests')
const { settleNightTurnIfComplete } = require('../phase/night/turn')

// 밤 행동 제출 ack (판 id는 core가 돌려준 진짜 id만 찍음)
const respondNightAction = labeledResponder('[밤 행동 제출 ack 전달 실패]')

// 밤 행동 제출: 내 턴이면 대상 기록, 그 역할 다 골랐으면 턴 마감 5초로 당김
function handleSubmitNightAction(socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: 성공 때만 core가 준 판 id 넘김
    const ack = (body, gameId) => respondNightAction(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 05-①②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameTarget)
    if (!fields) return
    const { gameId, targetId } = fields

    // 로그엔 원본 에러·요청 판 id를 안 남김 (core가 확인한 판 id만 믿음)
    const result = acceptCoreResult(ack, () => gameSessionCore.submitNightAction(uuid, gameId, targetId), {
        internalCodes: INTERNAL_ONLY_CODES,
        onThrow: () => console.error('[밤 행동 제출 처리 에러]', { code: 'UNEXPECTED_ERROR', uuid, gameId: undefined }),
        onInternal: (code) => console.error('[밤 행동 제출 registry 불일치]', { code, uuid, gameId: undefined }),
    })
    if (!result) return

    // 답 먼저, 그 역할 산 사람 다 골랐으면 5초 뒤 턴 닫기 (실패는 로그만)
    ack({ ok: true }, result.gameId)

    isolate('[밤 턴 마감 당기기 실패]', { code: 'TURN_SETTLE_ERROR', uuid, gameId: result.gameId },
        () => settleNightTurnIfComplete(result.gameId))
}

module.exports = {
    handleSubmitNightAction,
}
