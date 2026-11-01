// 끊김 탈락 파일
// 끊긴 사람 탈락 처리(기권 명단 넣기 포함, 지도 08) + 탈락 방송 내용 만들기
// 탈락은 게임 중 나가기가, 방송 내용(상태 안 바꿈)은 socket 쪽이 사용
const { isObserverBusy, observeNightCommit } = require('../core/tools/observer')
const { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession } = require('../core/rules/terminal')
const { DEATH_REASONS } = require('../result/constants')
const { expireDeadPlayerNightEffects } = require('../phase/night/commit')

// 끊긴 사람 탈락: 죽음 처리·기권 표시·밤 행동 지움, 승패 나면 판 닫기
function commitDisconnectElimination(session, uuid) {
    // 밤 확정 관찰자 도는 중에 다시 들어오면 거절 (시험용)
    if (isObserverBusy()) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
    // 끝난 판이면 거절
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    // 판에 있고 아직 살아 있는 사람만
    const victim = session.players.get(uuid)
    if (!victim) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (victim.alive !== true) return { ok: false, code: 'ALREADY_ELIMINATED' }

    // 여기부터 진짜 바뀜: 끊김 사망, 그 사람 밤 행동 지움
    victim.alive = false
    victim.deathReason = DEATH_REASONS.DISCONNECT
    observeNightCommit('DISCONNECT_DEATH_FINALIZED', { gameId: session.id, victimUuid: uuid, reason: DEATH_REASONS.DISCONNECT })
    expireDeadPlayerNightEffects(session, [uuid])

    // 기권 명단(참여 중 아님으로 침)·떠난 명단에 넣음
    // 떠난 명단이 다 차면 끝난 판 정리 때 판 지움
    recordForfeit(session, uuid)

    // 승패 나면 판 닫기
    const winResult = evaluateWinCondition(session)
    observeNightCommit('WIN_EVALUATED', { gameId: session.id, source: 'DISCONNECT', winner: winResult?.winner ?? null })
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, victimUuid: uuid, terminal: { winner: winResult.winner } }
    }

    return { ok: true, victimUuid: uuid, terminal: null }
}

// 기권 명단·떠난 명단에 넣음 (명단 없으면 새로 만듦)
// 끊김 탈락이랑 이미 죽은 사람 나가기가 같이 씀
function recordForfeit(session, uuid) {
    if (!session.forfeitedUuids) session.forfeitedUuids = new Set()
    session.forfeitedUuids.add(uuid)
    if (!session.detachedUuids) session.detachedUuids = new Set()
    session.detachedUuids.add(uuid)
}

// 끊김 탈락 방송 (생존 목록·탈락한 사람)
function buildDisconnectPayload(session, victimUuid) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        // 역할·죽은 이유 없이 uuid·생존만 (지도 12-⑧)
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
    }
}

module.exports = {
    commitDisconnectElimination,
    recordForfeit,
    buildDisconnectPayload,
}
