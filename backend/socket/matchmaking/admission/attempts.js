// 입장 시도 기록 파일
// 초대 수락 중인 입장 시도 꺼내기·없애기 + 방 인원 세기 (지도 23)
const { BOOT_EPOCH } = require('../core/constants')
const { publishedAdmissions, roomAdmissionAttempts } = require('../core/state')
const { deps } = require('../core/deps')

// 입장 시도 id 번호
let admissionAttemptSeq = 0

// 입장 시도 id 만들기 (부팅 번호 + 순번)
function nextAttemptId() {
    admissionAttemptSeq += 1
    return `adm-${BOOT_EPOCH.slice(0, 8)}-${admissionAttemptSeq}`
}

// 명단에 넣은 시도의 되돌릴 권리 내려놓기 (내 것일 때만)
function releasePublishedAdmission(attempt) {
    if (attempt && publishedAdmissions.get(attempt.accountUuid) === attempt) {
        publishedAdmissions.delete(attempt.accountUuid)
    }
}

// 사람의 입장 시도 꺼내기 (기한 지났으면 없앰)
function getAdmissionAttempt(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (!attempt) return null
    if (attempt.phase !== 'published' && attempt.expiresAt <= Date.now()) {
        roomAdmissionAttempts.delete(uuid)
        return null
    }
    return attempt
}

// 입장 시도 없애기
function invalidateAdmissionAttempt(uuid, reason) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (!attempt) return null
    roomAdmissionAttempts.delete(uuid)
    attempt.invalidated = reason ?? 'INVALIDATED'
    return attempt
}

// 없앤 시도의 초대 되돌리기
function compensateInvalidatedAttempt(attempt, reason) {
    if (!attempt || typeof attempt.inviteId !== 'string') return

    const settled = attempt.decisionSettled === true || !attempt.decisionPromise
    const waitForDecision = settled
        ? Promise.resolve()
        : Promise.resolve(attempt.decisionPromise).then(() => null, () => null)

    waitForDecision
        .then(() => deps.gameInviteService.recordEntryInterrupted({
            inviteId: attempt.inviteId, attemptId: attempt.attemptId, reason,
        }))
        .catch((err) => console.error('[초대 입장 보상 실패]', err))
}

// 방 없어질 때 그 방 입장 시도 전부 없앰
function invalidateAdmissionAttemptsForRoom(roomId, reason) {
    for (const [uuid, attempt] of [...roomAdmissionAttempts]) {
        if (attempt.roomId !== roomId) continue
        roomAdmissionAttempts.delete(uuid)
        compensateInvalidatedAttempt(attempt, reason)
    }
}

// 이 방에 입장 중인 사람 있는지 (있으면 시작·준비 막음)
function hasPendingAdmissionForRoom(roomId) {
    for (const [uuid] of roomAdmissionAttempts) {
        const attempt = getAdmissionAttempt(uuid)
        if (attempt && attempt.roomId === roomId) return true
    }
    return false
}

// 방 인원 = 명단 + 자리 잡은 입장 시도
function countRoomOccupancy(room, excludeUuid = null) {
    let count = 0
    for (const uuid of room.players.keys()) {
        if (uuid !== excludeUuid) count += 1
    }
    for (const [uuid] of roomAdmissionAttempts) {
        if (uuid === excludeUuid) continue
        const attempt = getAdmissionAttempt(uuid)
        if (!attempt || attempt.roomId !== room.id) continue
        if (attempt.phase === 'reserved') count += 1
    }
    return count
}

// 기다리는 일에 시간 제한 걸기
function withAdmissionTimeout(promise, ms, code) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error(code), { admissionTimeout: code })), ms)
        if (typeof timer.unref === 'function') timer.unref()
        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (error) => { clearTimeout(timer); reject(error) },
        )
    })
}

module.exports = {
    admissionAttemptSeq,
    nextAttemptId,
    releasePublishedAdmission,
    getAdmissionAttempt,
    invalidateAdmissionAttempt,
    compensateInvalidatedAttempt,
    invalidateAdmissionAttemptsForRoom,
    hasPendingAdmissionForRoom,
    countRoomOccupancy,
    withAdmissionTimeout,
}
