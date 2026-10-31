// 끊김 탈락 파일
// 끊긴 사람 탈락 처리 + 탈락 방송 내용 (지도 08)
const { isObserverBusy, observeNightCommit } = require('../core/observer')
const { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession } = require('../core/terminal')
const { DEATH_REASONS } = require('../result')
const { expireDeadPlayerNightEffects } = require('../phase/night')

// 끊긴 사람 탈락: 죽음 처리·기권 표시·밤 행동 지움, 승패 나면 판 닫기
function commitDisconnectElimination(session, uuid) {
    if (isObserverBusy()) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const victim = session.players.get(uuid)
    if (!victim) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (victim.alive !== true) return { ok: false, code: 'ALREADY_ELIMINATED' }

    victim.alive = false
    victim.deathReason = DEATH_REASONS.DISCONNECT
    observeNightCommit('DISCONNECT_DEATH_FINALIZED', { gameId: session.id, victimUuid: uuid, reason: DEATH_REASONS.DISCONNECT })
    expireDeadPlayerNightEffects(session, [uuid])

    if (!session.forfeitedUuids) session.forfeitedUuids = new Set()
    session.forfeitedUuids.add(uuid)
    if (!session.detachedUuids) session.detachedUuids = new Set()
    session.detachedUuids.add(uuid)

    const winResult = evaluateWinCondition(session)
    observeNightCommit('WIN_EVALUATED', { gameId: session.id, source: 'DISCONNECT', winner: winResult?.winner ?? null })
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, victimUuid: uuid, terminal: { winner: winResult.winner } }
    }

    return { ok: true, victimUuid: uuid, terminal: null }
}

// 끊김 탈락 방송 (생존 목록·탈락한 사람)
function buildDisconnectEliminationPayload(session, victimUuid) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
    }
}

module.exports = {
    commitDisconnectElimination,
    buildDisconnectEliminationPayload,
}
