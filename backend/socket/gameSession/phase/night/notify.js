// 밤 개별 전달 파일
// 밤 성공 사건을 행동자·대상 소켓에만 + 연출 대기 시작·해제 알림, 밤 턴·연출 대기가 씀
const { isNonEmptyString } = require('../../../common/shape')
const { isolate } = require('../../../common/isolate')
const { registeredSocketIdFor } = require('../../connection/ownership')
const { isCurrentNightRun, isStillDeliverableTo } = require('./checks')
const { buildNightPayload } = require('./contract')
const { recordNightReceipt, discardNightReceipt } = require('./receipts')

// 밤 성공 사건을 행동자·대상 소켓에만 하나씩 보냄, 보낸 기록은 완료 ACK·재접속 복구용 (지도 05-⑧)
function emitNightSuccessEvents(run, contract) {
    if (!contract || !Array.isArray(contract.events) || contract.events.length === 0) return
    const { io, session } = run
    if (!isCurrentNightRun(run)) return
    if (session.id !== contract.gameId) return
    if (session.dayIndex !== contract.nightDayIndex) return

    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.get !== 'function') return

    const deliveredPairs = new Set()

    for (const event of contract.events) {
        for (const recipient of event.recipients ?? []) {
            const dedupeKey = `${event.eventId}:${recipient.socketId}`
            if (deliveredPairs.has(dedupeKey)) continue

            // 계약 때 정한 소켓이 아직 그 계정·그 자리인지 보내기 직전 다시 봄
            if (!isNonEmptyString(recipient.socketId)) continue
            const recipientSocket = registry.get(recipient.socketId)
            if (!recipientSocket) continue
            if (!isStillDeliverableTo(io, session, recipientSocket, recipient.uuid, recipient.membershipId)) continue

            const payload = buildNightPayload(contract, event, recipient)
            const { record, refused } = recordNightReceipt(session, event, recipient, recipientSocket, payload)
            if (refused) continue
            if (record && record.completed === true) continue

            deliveredPairs.add(dedupeKey)

            const boundSocketId = record ? record.socketId : null
            try {
                recipientSocket.emit('night_action_success', payload)
            } catch {
                console.error('[밤 성공 사건 전달 실패]', { code: 'DELIVERY_ERROR', eventId: event.eventId, gameId: session.id })
                discardNightReceipt(session, event.eventId, recipient.uuid, recipientSocket, boundSocketId)
            }
        }
    }
}

// 연출 대기 시작·해제 알림 (기다리는 사람 말고 나머지 참가자에게)
function emitNightWait(run, token, waiting) {
    const { session } = run
    const targets = token.notifyTargets ?? []
    if (targets.length === 0) return
    const registry = run.io?.sockets?.sockets
    if (!registry || typeof registry.get !== 'function') return

    for (const target of targets) {
        // 정해 둔 대상의 지금 소켓이 아직 그 자리인지 보내기 직전 다시 봄
        const socketId = registeredSocketIdFor(target.uuid)
        if (!isNonEmptyString(socketId)) continue
        const targetSocket = registry.get(socketId)
        if (!targetSocket) continue
        if (!isStillDeliverableTo(run.io, session, targetSocket, target.uuid, target.membershipId)) continue

        isolate('[연출 대기 알림 전송 실패]', { code: 'DELIVERY_ERROR', gameId: session.id },
            () => targetSocket.emit('night_presentation_wait', {
                gameId: session.id,
                nightDayIndex: token.nightDayIndex,
                waiting,
            }))
    }
}

module.exports = {
    emitNightSuccessEvents,
    emitNightWait,
}
