// 입장 시도 기록 파일
// 입장 시도 꺼내기·없애기·중단 기록 + 방 인원 세기 (지도 23)
// 입장·초대 수락·방(준비·시작·나가기·끊김·방장·방 정보)·설정·줄이 사용
const { BOOT_EPOCH } = require('../core/constants')
const { publishedAdmissions, roomAdmissionAttempts } = require('../core/state')
const { deps } = require('../core/deps')

// 입장 시도 순번 (서버 켜진 동안 계속 늘어남)
let admissionAttemptSeq = 0

// 입장 시도 id: 부팅 번호 앞 8자 + 순번 (재시작 뒤 옛 시도 id랑 안 겹침)
function nextAttemptId() {
    admissionAttemptSeq += 1
    return `adm-${BOOT_EPOCH.slice(0, 8)}-${admissionAttemptSeq}`
}

// 명단에 넣은 시도의 되돌릴 권리 내려놓기 (내 것일 때만)
function releasePublished(attempt) {
    if (attempt && publishedAdmissions.get(attempt.accountUuid) === attempt) {
        publishedAdmissions.delete(attempt.accountUuid)
    }
}

// 사람의 입장 시도 꺼내기 (기한 지났으면 없앰)
function getAdmissionAttempt(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (!attempt) return null
    // 명단에 넣은 시도는 영수증 기다리는 중이라 기한 안 봄
    if (attempt.phase !== 'published' && attempt.expiresAt <= Date.now()) {
        roomAdmissionAttempts.delete(uuid)
        return null
    }
    return attempt
}

// 입장 시도 없애고 이유 표시, 진행 중 수락 흐름이 보고 멈춤 (부른 쪽이 되돌리기·중단 기록)
function invalidateAttempt(uuid, reason) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (!attempt) return null
    roomAdmissionAttempts.delete(uuid)
    attempt.invalidated = reason ?? 'INVALIDATED'
    return attempt
}

// 없앤 시도를 초대에 "입장 중단"으로 기록 (안 기다림, 실패는 로그만)
function compensateAttempt(attempt, reason) {
    // 초대 id 없는 시도면 기록할 행 없음
    if (!attempt || typeof attempt.inviteId !== 'string') return

    // 수락 기록 끝난 뒤에 기록 (먼저 하면 아직 바꿀 행이 없어서 안 남음)
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

// 방 없어지거나 시작될 때 그 방 입장 시도 전부 없애고 중단 기록
function invalidateRoomAttempts(roomId, reason) {
    // 돌면서 지우니 복사본으로 돎
    for (const [uuid, attempt] of [...roomAdmissionAttempts]) {
        if (attempt.roomId !== roomId) continue
        roomAdmissionAttempts.delete(uuid)
        compensateAttempt(attempt, reason)
    }
}

// 이 방에 입장 중인 사람 있는지 (있으면 시작 못 함, 시작 가능 표시도 꺼짐)
function hasPendingAdmission(roomId) {
    for (const [uuid] of roomAdmissionAttempts) {
        const attempt = getAdmissionAttempt(uuid)
        if (attempt && attempt.roomId === roomId) return true
    }
    return false
}

// 방 인원 = 명단 + 자리 잡은 입장 시도 (excludeUuid는 빼고 셈, 내 자리 두 번 안 세게)
function countRoomOccupancy(room, excludeUuid = null) {
    let count = 0
    for (const uuid of room.players.keys()) {
        if (uuid !== excludeUuid) count += 1
    }
    // 명단에 넣은 시도는 위에서 셌으니 자리만 잡은(reserved) 것만 더함
    for (const [uuid] of roomAdmissionAttempts) {
        if (uuid === excludeUuid) continue
        const attempt = getAdmissionAttempt(uuid)
        if (!attempt || attempt.roomId !== room.id) continue
        if (attempt.phase === 'reserved') count += 1
    }
    return count
}

// 기다리는 일에 시간 제한, 넘으면 admissionTimeout 붙여 거절 (원래 일은 계속 돎)
function withAdmissionTimeout(promise, ms, code) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error(code), { admissionTimeout: code })), ms)
        // 이 타이머 때문에 프로세스가 안 끝나는 일 막기
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
    releasePublished,
    getAdmissionAttempt,
    invalidateAttempt,
    compensateAttempt,
    invalidateRoomAttempts,
    hasPendingAdmission,
    countRoomOccupancy,
    withAdmissionTimeout,
}
