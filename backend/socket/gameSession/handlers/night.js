// 밤 핸들러 파일
// 밤 행동 제출 · 밤 종료 버튼 · 밤 성공 연출 완료 신호, register가 등록함
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const { rejectedReply, invalidPayloadReply, respond, labeledResponder } = require('../../common/replies')
const {
    INTERNAL_ONLY_CODES,
    RESOLVE_INTERNAL_CODES,
    NIGHT_REJECT_MESSAGES,
} = require('../core/constants')
const { nightTurnRuns } = require('../core/state')
const {
    pickGameId,
    pickGameTarget,
    acceptRequest,
    acceptCoreResult,
    prepareLogs,
} = require('../core/requests')
const { readNightSuccessAck, findNightSuccessRecord } = require('../phase/night/receipts')
const { reevaluateNightWait, nightWaitRoutingFor } = require('../phase/night/wait')
const { maybeEndNightTurn } = require('../phase/night/turn')
const { finalizeNightForSession } = require('../phase/night/finalize')

// 밤 행동 제출 ack (판 id는 core가 돌려준 진짜 id만 찍음)
const respondNightAction = labeledResponder('[밤 행동 제출 ack 전달 실패]')

// 밤 행동 제출: 내 턴이면 대상 기록, 그 역할 다 냈으면 턴 끝냄
function handleSubmitNightAction(socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const ack = (body, gameId) => respondNightAction(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 05-①②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameTarget)
    if (!fields) return
    const { gameId, targetId } = fields

    // 턴 사이 연출 대기 중이면 core 부르기 전에 끊음 (다음 역할 제출이 미리 받아지는 것 막기, 지도 05-⑥)
    if (nightWaitRoutingFor(uuid, gameId)) {
        ack(rejectedReply('ACTIONS_PENDING'))
        return
    }

    // 로그엔 원본 에러·요청 판 id를 안 남김 (core가 확인한 판 id만 믿음)
    const result = acceptCoreResult(ack, () => gameSessionCore.submitNightAction(uuid, gameId, targetId), {
        internalCodes: INTERNAL_ONLY_CODES,
        onThrow: () => console.error('[밤 행동 제출 처리 에러]', { code: 'UNEXPECTED_ERROR', uuid, gameId: undefined }),
        onInternal: (code) => console.error('[밤 행동 제출 registry 불일치]', { code, uuid, gameId: undefined }),
    })
    if (!result) return

    ack({ ok: true }, result.gameId)

    isolate('[밤 턴 종료 처리 에러]', { code: 'TURN_ADVANCE_ERROR', uuid, gameId: result.gameId },
        () => maybeEndNightTurn(result.gameId))
}

// '밤 종료' 버튼 ack
const respondResolveNight = labeledResponder('[밤 행동 판정 오류]')

// '밤 종료' 버튼: prepare 뒤 밤 마무리 관문으로 넘김, 연출 대기 중이면 거절 (지도 06)
function handleResolveNight(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareNightResolution

    if (typeof callback !== 'function') return
    const ack = (body, gameId) => respondResolveNight(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 06-①②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameId)
    if (!fields) return
    const { gameId } = fields

    // 연출 대기 중이면 prepare 전에 끊음 (지도 06-⑤)
    const waitingRouting = nightWaitRoutingFor(uuid, gameId)
    if (waitingRouting) {
        ack(rejectedReply('ACTIONS_PENDING'), waitingRouting.gameId)
        return
    }

    const prepared = acceptCoreResult(ack, () => prepare(uuid, gameId),
        prepareLogs('[밤 행동 판정 오류]', uuid, RESOLVE_INTERNAL_CODES))
    if (!prepared) return

    // 관문이 답하면 그 답, 관문이 답 없이 끝나면 (이미 판정됨 등) 여기서 답함 (지도 06-⑨)
    let answered = false
    const onResult = (response) => {
        answered = true
        ack(response, prepared.session.id)
    }
    onResult.uuid = uuid

    const outcome = finalizeNightForSession(io, prepared.session, { prepared, deps, onResult })
    if (!answered) {
        ack(outcome?.ok ? { ok: true } : rejectedReply('NIGHT_ALREADY_RESOLVED'), prepared.session.id)
    }
}

// 밤 성공 연출 완료 신호: 내 수신 기록을 완료로 바꾸고 연출 기다림 다시 봄 (callback 없어도 처리)
function handleAckNightSuccess(io, socket, uuid, payload, callback) {
    const reply = typeof callback === 'function' ? (result) => respond(callback, result) : () => {}

    const request = readNightSuccessAck(payload)
    if (!request) {
        reply(invalidPayloadReply())
        return
    }

    const found = findNightSuccessRecord(io, socket, uuid, request)
    if (found.code) {
        reply({ ok: false, code: found.code, message: NIGHT_REJECT_MESSAGES[found.code] })
        return
    }
    const { session, record } = found

    // 같은 완료 신호가 또 오면 중복 표시만 (지도 05-⑩)
    if (record.completed) {
        reply({ ok: true, duplicate: true })
        return
    }
    // 여기부터 진짜 바뀜: 완료 기록, 그 사건 기다리던 연출 대기 다시 판정
    record.completed = true
    record.outcome = request.outcome
    reply({ ok: true, duplicate: false })

    const run = nightTurnRuns.get(session.id)
    if (run && run.wait && run.wait.waiting && run.wait.waiting.has(request.eventId)) {
        isolate('[밤 성공 완료 처리 오류]', { code: 'WAIT_REEVALUATE_ERROR', gameId: session.id },
            () => reevaluateNightWait(run, run.wait))
    }
}

module.exports = {
    handleSubmitNightAction,
    handleResolveNight,
    handleAckNightSuccess,
}
