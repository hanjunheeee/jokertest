// 이탈 뒤 바로 판정 파일
// 표식 있고 남은 사람 다 냈으면 낮 투표·재판 바로 판정, 이탈 반영·투표 핸들러가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate, isolateOr } = require('../../common/isolate')
const {
    resolveOrEmpty,
    emitToEachEligible,
    deliverToParticipants,
} = require('../delivery/broadcast')
const { syncSessionPhaseTimers } = require('../phase/day')
const { clearDepartureMark, hasDepartureResolveMark } = require('./marks')
const { withTerminalFields } = require('./end')

// 표 낸 뒤 표식 있으면 낮 투표·재판 바로 판정 시도
function resolveAfterDeparture(io, uuid, gameId) {
    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session || !hasDepartureResolveMark(session)) return
    if (session.phase === 'DAY') {
        maybeResolveDayVote(io, session)
        return
    }
    if (session.phase === 'TRIBUNAL') maybeResolveTribunal(io, session)
}

// 판정 prepare에 넣을 이름: 아직 이 판에 참여 중인 첫 사람 (없으면 null)
function pickRequesterUuid(session) {
    for (const player of session.players.values()) {
        if (!gameSessionCore.isParticipatingInSession(session, player.uuid)) continue
        if (gameSessionCore.getActiveSessionForDeparture(player.uuid, session.id) !== session) continue
        return player.uuid
    }
    return null
}

// 이탈로 남은 사람 다 냈으면 낮 투표 바로 판정 (남은 참가자 한 명 이름으로 prepare)
function maybeResolveDayVote(io, session) {
    const requesterUuid = pickRequesterUuid(session)
    if (!requesterUuid) return

    const prepared = gameSessionCore.prepareDayVoteResolution(requesterUuid, session.id, session.dayIndex)
    if (!prepared.ok || prepared.alreadyResolved) return

    const committed = gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution)
    if (!committed.ok) return

    clearDepartureMark(session.id)

    const label = '[이탈 후 낮 투표 판정 실패]'
    const fields = { gameId: session.id }
    const resolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(session, prepared.resolution)
    deliverToParticipants(io, session, 'day_vote_resolved', resolvedPayload, label, fields)
    isolate(label, { code: 'TIMER_SYNC_ERROR', ...fields }, () => syncSessionPhaseTimers(io, session))
}

// 이탈로 남은 사람 다 냈으면 재판 바로 판정 (남은 참가자 한 명 이름으로 prepare)
function maybeResolveTribunal(io, session) {
    const requesterUuid = pickRequesterUuid(session)
    if (!requesterUuid) return

    const prepared = gameSessionCore.prepareTribunalVoteResolution(requesterUuid, session.id, session.dayIndex)
    if (!prepared.ok) return

    const committed = gameSessionCore.commitTribunalVoteResolution(prepared.session, prepared.resolution)
    if (!committed.ok) return

    clearDepartureMark(session.id)

    const label = '[이탈 후 재판 판정 실패]'
    const fields = { gameId: session.id }
    const resolvedPayload = isolateOr(null, label, { code: 'PAYLOAD_BUILD_ERROR', ...fields },
        () => gameSessionCore.buildTribunalVoteResolvedPayload(session))
    const broadcastPayload = withTerminalFields(session, committed.terminal, resolvedPayload, label, fields)

    const recipients = resolveOrEmpty(io, session, label, fields)
    if (broadcastPayload) {
        emitToEachEligible(session, recipients, label, fields, (s) => s.emit('tribunal_vote_resolved', broadcastPayload))
    }

    isolate(label, { code: 'TIMER_SYNC_ERROR', ...fields }, () => syncSessionPhaseTimers(io, session))
}

module.exports = {
    resolveAfterDeparture,
    maybeResolveDayVote,
    maybeResolveTribunal,
}
