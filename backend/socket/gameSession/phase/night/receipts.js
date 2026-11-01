// 밤 성공 수신 기록 파일
// 밤 성공 사건 수신 기록 보관함(판별·밤별) + 완료 신호 모양·주인 검사, socket gameSession 밤 턴·스냅샷·완료 핸들러가 씀
const gameSessionCore = require('../../../../game-core/gameSession')
const { isPlainObject, isNonEmptyString, hasOnlyKeys } = require('../../../common/shape')
const { getOrCreate } = require('../../../common/maps')
const { isCurrentSocketForUuid } = require('../../connection/ownership')
const { isEligibleSessionRecipient, hasMembershipOutsideSession } = require('../../delivery/eligibility')
const { NIGHT_SUCCESS_ACK_ALLOWED_KEYS, NIGHT_SUCCESS_OUTCOMES } = require('../../core/constants')

// 판 → { nightDayIndex, byEvent: 사건 id → uuid → 수신 기록 } (판 객체가 사라지면 같이 사라짐)
// 시험 초기화 때 통째로 갈아 끼움
let nightSuccessReceiptsBySession = new WeakMap()

// 그 판 수신 기록 보관함 (없으면 undefined)
function getNightSuccessReceipts(session) {
    return nightSuccessReceiptsBySession.get(session)
}

// 이 밤 수신 기록 칸 열기: 없거나 지난 밤 것이면 새로 (같은 밤이면 그대로 둠)
function ensureNightSuccessReceipts(session) {
    const storedReceipts = nightSuccessReceiptsBySession.get(session)
    if (!storedReceipts || storedReceipts.nightDayIndex !== session.dayIndex) {
        nightSuccessReceiptsBySession.set(session, { nightDayIndex: session.dayIndex, byEvent: new Map() })
    }
}

// 판 끝: 그 판 수신 기록 지움
function deleteNightSuccessReceipts(session) {
    nightSuccessReceiptsBySession.delete(session)
}

// 시험용 초기화: 보관함 통째로 새로
function resetNightSuccessReceipts() {
    nightSuccessReceiptsBySession = new WeakMap()
}

// 밤 성공 payload 검사 복사: 모양 틀리면 null (재접속 복구 때 그대로 다시 보냄)
function copyNightSuccessPayload(payload) {
    if (!isPlainObject(payload)) return null
    if (!isNonEmptyString(payload.gameId)) return null
    if (!isNonEmptyString(payload.eventId)) return null
    if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return null
    if (!isNonEmptyString(payload.type)) return null
    if (!Array.isArray(payload.perspectives) || payload.perspectives.length === 0) return null
    const copy = {
        gameId: payload.gameId,
        nightDayIndex: payload.nightDayIndex,
        eventId: payload.eventId,
        type: payload.type,
        perspectives: [...payload.perspectives],
    }
    if (payload.perspectives.includes('USER')) {
        if (!isNonEmptyString(payload.targetId)) return null
        copy.targetId = payload.targetId
    }
    return copy
}

// 밤 성공 수신 기록 남기기: 같은 계정 다른 자리(membershipId)면 거절, 미완료면 지금 소켓으로 다시 묶음
function recordNightSuccessReceipt(session, event, recipient, socket, payload = null) {
    const store = nightSuccessReceiptsBySession.get(session)
    if (!store) return { record: null, created: false, refused: false }
    const byUuid = getOrCreate(store.byEvent, event.eventId, () => new Map())
    const existing = byUuid.get(recipient.uuid)
    if (existing) {
        if (existing.membershipId !== recipient.membershipId) {
            return { record: null, created: false, refused: true }
        }
        if (existing.completed !== true && socket) {
            existing.socket = socket
            existing.socketId = typeof socket.id === 'string' ? socket.id : recipient.socketId
        }
        return { record: existing, created: false, refused: false }
    }
    const record = {
        membershipId: recipient.membershipId,
        socketId: recipient.socketId,
        socket,
        completed: false,
        payload: copyNightSuccessPayload(payload),
    }
    byUuid.set(recipient.uuid, record)
    return { record, created: true, refused: false }
}

// 보내기 실패한 그 소켓 묶음만 풂 (완료됐거나 다른 소켓으로 다시 묶인 기록은 그대로)
function discardNightSuccessReceiptIfUncompleted(session, eventId, uuid, failedSocket = null, failedSocketId = null) {
    const byUuid = nightSuccessReceiptsBySession.get(session)?.byEvent.get(eventId)
    const record = byUuid?.get(uuid)
    if (!record || record.completed === true) return
    if (record.socket !== failedSocket) return
    if (record.socketId !== failedSocketId) return
    record.socket = null
    record.socketId = null
}

// 아직 완료 안 된 내 수신 기록 (같은 자리·payload 멀쩡한 것만, 재접속 복구용)
function collectPendingNightSuccessRecords(store, uuid, membershipId) {
    const pending = []
    for (const byUuid of store.byEvent.values()) {
        const record = byUuid.get(uuid)
        if (!record) continue
        if (record.completed === true) continue
        if (record.membershipId !== membershipId) continue
        if (copyNightSuccessPayload(record.payload) === null) continue
        pending.push(record)
    }
    return pending
}

// 그 밤 사건 완료 신호를 아직 받을 때인지: 그 밤이거나 바로 다음 낮·재판 (끝난 판은 둘 다)
function isNightSuccessCompletionWindowOpen(session, nightDayIndex) {
    if (session.phase === 'NIGHT') return session.dayIndex === nightDayIndex
    if (session.phase === 'DAY' || session.phase === 'TRIBUNAL') return session.dayIndex === nightDayIndex + 1
    if (session.phase === 'ENDED') return session.dayIndex === nightDayIndex || session.dayIndex === nightDayIndex + 1
    return false
}

// 밤 성공 완료 신호 모양: 허용 키만, 판 id·밤 번호·사건 id·결과 값 (틀리면 null, 지도 05-⑩)
function readNightSuccessAck(payload) {
    if (!isPlainObject(payload)) return null
    if (!hasOnlyKeys(payload, NIGHT_SUCCESS_ACK_ALLOWED_KEYS)) return null
    const { gameId, nightDayIndex, eventId } = payload
    if (!isNonEmptyString(gameId)) return null
    if (!Number.isInteger(nightDayIndex) || nightDayIndex < 0) return null
    if (!isNonEmptyString(eventId)) return null
    const outcome = 'outcome' in payload ? payload.outcome : 'COMPLETED'
    if (!NIGHT_SUCCESS_OUTCOMES.has(outcome)) return null
    return { gameId, nightDayIndex, eventId, outcome }
}

// 완료 신호 낸 소켓이 그 사건 받은 바로 그 소켓·자리인지 → { session, record } 또는 { code }
// 옛 탭·다른 판·지난 밤 신호는 거절 (지도 05-⑩ · 08-②)
function findNightSuccessRecord(io, socket, uuid, { gameId, nightDayIndex, eventId }) {
    if (!isCurrentSocketForUuid(uuid, socket, io)) return { code: 'NOT_ELIGIBLE' }
    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session) return { code: 'NOT_ELIGIBLE' }

    // 그 밤 사건을 아직 받을 수 있는 때인지, 보관함에 그 사건이 있는지
    if (!isNightSuccessCompletionWindowOpen(session, nightDayIndex)) return { code: 'STALE_EVENT' }
    const store = nightSuccessReceiptsBySession.get(session)
    if (!store || store.nightDayIndex !== nightDayIndex) return { code: 'STALE_EVENT' }
    const byUuid = store.byEvent.get(eventId)
    if (!byUuid) return { code: 'STALE_EVENT' }

    // 내 수신 기록 있고, 그때 소켓·자리 그대로고, 지금도 받을 자격 있는지
    const record = byUuid.get(uuid)
    if (!record) return { code: 'NOT_ELIGIBLE' }
    if (record.socket !== socket || record.socketId !== socket.id) return { code: 'NOT_ELIGIBLE' }
    if ((session.players.get(uuid)?.membershipId ?? null) !== record.membershipId) return { code: 'NOT_ELIGIBLE' }
    if (!isEligibleSessionRecipient(session, socket, uuid)) return { code: 'NOT_ELIGIBLE' }
    if (hasMembershipOutsideSession(session, uuid)) return { code: 'NOT_ELIGIBLE' }
    return { session, record }
}

module.exports = {
    getNightSuccessReceipts,
    ensureNightSuccessReceipts,
    deleteNightSuccessReceipts,
    resetNightSuccessReceipts,
    copyNightSuccessPayload,
    recordNightSuccessReceipt,
    discardNightSuccessReceiptIfUncompleted,
    collectPendingNightSuccessRecords,
    isNightSuccessCompletionWindowOpen,
    readNightSuccessAck,
    findNightSuccessRecord,
}
