// 개인 진행 상태 전송 파일
// 내 제출 상태를 나한테만 보냄 (누가 누굴 찍었는지 안 새게), 준비·투표 핸들러·이탈 반영이 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const { getSocketForUuid } = require('../connection/ownership')
const { isEligibleRecipient } = require('./eligibility')

// 내 제출 상태를 나한테만 보냄 (onlyUuid 없으면 참여 중인 전원 각자에게, 지도 12-⑧)
function emitSelfProgress(io, session, onlyUuid = null) {
    if (!session || !(session.players instanceof Map)) return
    const label = '[개인 진행 상태 전송 실패]'
    // 순번·공개 진행은 한 번만 만들어 모두 같은 값 받음, 만들다 던지면 아무에게도 안 보냄
    let seq = null
    let progress = null
    const built = isolate(label, { code: 'SELF_PROGRESS_BUILD_ERROR', gameId: session.id }, () => {
        seq = gameSessionCore.bumpSelfProgressSeq(session)
        progress = gameSessionCore.buildPublicProgress(session)
    })
    if (!built) return
    const participationRevision = Number.isSafeInteger(session.participationRevision)
        ? session.participationRevision
        : 0

    // 나간 사람·안 붙은 사람·자격 없는 소켓은 건너뜀, 한 명 실패해도 나머지는 보냄
    for (const player of session.players.values()) {
        if (onlyUuid !== null && player.uuid !== onlyUuid) continue
        if (player.isParticipating === false) continue
        const targetSocket = getSocketForUuid(io, player.uuid)
        if (!targetSocket) continue
        if (!isEligibleRecipient(session, targetSocket, player.uuid)) continue
        isolate(label, { code: 'SELF_PROGRESS_DELIVERY_ERROR', uuid: player.uuid, gameId: session.id },
            () => targetSocket.emit('session_self_progress', {
                gameId: session.id,
                phase: session.phase,
                dayIndex: session.dayIndex,
                participationRevision,
                selfProgressSeq: seq,
                progress,
                self: gameSessionCore.buildSelfFields(session, player.uuid),
            }))
    }
}

// 표 제출 뒤 내 진행 상태만 나한테 (지금 판이 그대로일 때만)
function emitProgressAfterSubmit(io, uuid, gameId, code) {
    isolate('[개인 진행 상태 전송 실패]', { code, gameId }, () => {
        const committed = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
        if (committed) emitSelfProgress(io, committed, uuid)
    })
}

module.exports = {
    emitSelfProgress,
    emitProgressAfterSubmit,
}
