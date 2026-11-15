// 재판 판정 파일
// 재판 마감 때 표 세서 확정 + 결과 방송(승부 났으면 종료 필드)·다음 단계 타이머, 재판 마감 타이머가 phaseHooks로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate, isolateOr } = require('../../common/isolate')
const { resolveOrEmpty, emitToEachEligible } = require('../delivery/broadcast')
const { syncSessionPhaseTimers } = require('../phase/day')
const { pickRequesterUuid } = require('../core/requester')
const { withTerminalFields } = require('./end')

// 투표할 사람이 다 냈으면 재판 판정 (남은 참가자 한 명 이름으로 prepare), 확정했으면 true
// 재판 마감 타이머가 안 낸 사람 기권 채운 뒤 부름
function maybeResolveTribunal(io, session) {
    // 남은 참가자 없으면 prepare에 넣을 이름 없음
    const requesterUuid = pickRequesterUuid(session)
    if (!requesterUuid) return false

    // 아직 다 안 냈거나 이미 끝난 재판이면 그만
    const prepared = gameSessionCore.prepareTribunalVoteResolution(requesterUuid, session.id, session.dayIndex)
    if (!prepared.ok) return false

    // 여기부터 진짜 바뀜: 판정 확정 (그사이 표 바뀌었으면 core가 거절)
    const committed = gameSessionCore.commitTribunalVoteResolution(prepared.session, prepared.resolution)
    if (!committed.ok) return false

    // 확정됐으니 결과 방송(승부 났으면 종료 필드)·타이머 맞춤
    const label = '[재판 판정 실패]'
    const fields = { gameId: session.id }
    const resolvedPayload = isolateOr(null, label, { code: 'PAYLOAD_BUILD_ERROR', ...fields },
        () => gameSessionCore.buildTribunalVoteResolvedPayload(session))
    const broadcastPayload = withTerminalFields(session, committed.terminal, resolvedPayload, label, fields, io)

    const recipients = resolveOrEmpty(io, session, label, fields)
    if (broadcastPayload) {
        emitToEachEligible(session, recipients, label, fields, (s) => s.emit('tribunal_vote_resolved', broadcastPayload))
    }

    isolate(label, { code: 'TIMER_SYNC_ERROR', ...fields }, () => syncSessionPhaseTimers(io, session))
    return true
}

module.exports = {
    maybeResolveTribunal,
}
