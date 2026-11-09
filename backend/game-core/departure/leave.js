// 게임 중 나가기 파일
// 나간 사람 정리 + 멈춘 단계 넘기기, socket 나가기 처리가 사용 (지도 12)
const { assertSessionNotEnded, enterNightPhase } = require('../core/rules/terminal')
const { commitDisconnectElimination, recordForfeit } = require('./eliminate')
const { releasePlayerSession } = require('../core/registry/write')
const { TRIBUNAL_PENDING, tallyTribunalBallots, buildTribunalBallotSnap } = require('../phase/tribunal/ballots')
const { TRIBUNAL_CANCELLED, TRIBUNAL_CANCEL_REASONS } = require('../phase/tribunal/constants')
const { getDayPhase, enterDayVotePhase, getDayVoteReadyUuids } = require('../phase/day/state')
const { DAY_PHASES } = require('../phase/day/constants')
const { getDayVoterUuids } = require('../phase/day/ballots')
const { hasForfeited, getParticipationRevision } = require('../queries/participation')

// 방장이 나가면 아직 참여 중인 다음 사람한테 넘김 (없으면 null)
function passHostOnLeave(session, uuid) {
    if (session.hostUuid !== uuid) return { hostChanged: false, newHostUuid: session.hostUuid ?? null }
    let newHostUuid = null
    for (const candidate of session.players.values()) {
        if (candidate.uuid === uuid) continue
        if (candidate.isParticipating === false) continue
        newHostUuid = candidate.uuid
        break
    }
    session.hostUuid = newHostUuid
    return { hostChanged: true, newHostUuid }
}

// 역할 확인·투표 준비·낮 표·밤 행동에서 나 빼기, 지운 것은 cleanup에 적음
function removeFromRecords(session, uuid, cleanup) {
    // 역할 확인·투표 준비 명단에서 빼기
    if (session.roleRevealAcks instanceof Set) {
        cleanup.removedRoleRevealAck = session.roleRevealAcks.delete(uuid)
    }
    if (session.dayVoteReadyUuids instanceof Set) {
        cleanup.removedDayVoteReady = session.dayVoteReadyUuids.delete(uuid)
    }
    // 내 낮 표 지우고, 나를 찍은 표는 기권으로 바꿈
    if (session.dayVotes instanceof Map) {
        cleanup.removedDayVote = session.dayVotes.delete(uuid)
        for (const [voterUuid, targetUuid] of session.dayVotes) {
            if (targetUuid !== uuid) continue
            session.dayVotes.set(voterUuid, null)
            cleanup.normalizedVoterUuids.push(voterUuid)
        }
    }
    // 내 밤 행동 지우고, 나를 고른 밤 행동은 빈 값으로
    if (session.nightActions instanceof Map) {
        session.nightActions.delete(uuid)
        for (const [actorUuid, targetId] of session.nightActions) {
            if (targetId === uuid) session.nightActions.set(actorUuid, null)
        }
    }
}

// 안 끝난 재판이면 내 재판 표 지움, 피고가 나갔으면 재판 취소하고 밤으로 (취소했으면 true)
function removeFromTribunal(session, uuid, { wasDefendant, cleanup }) {
    const tribunal = session.tribunal
    if (!tribunal || tribunal.resolved === true) return false
    if (tribunal.votes instanceof Map) {
        cleanup.removedTribunalVote = tribunal.votes.delete(uuid)
    }
    if (!wasDefendant) return false
    // 피고가 나갔으면 재판 취소: 보관함 비우고 그때까지 표만 셈
    TRIBUNAL_PENDING.delete(session)
    const counts = tallyTribunalBallots(
        buildTribunalBallotSnap(session, tribunal),
        tribunal.defendantUuid,
    ).counts
    // 취소 결과 기록, 처형 없이 바로 밤으로
    tribunal.outcome = TRIBUNAL_CANCELLED
    tribunal.cancelReason = TRIBUNAL_CANCEL_REASONS.DEFENDANT_LEFT
    tribunal.counts = { guilty: counts.guilty, notGuilty: counts.notGuilty }
    tribunal.executedUuid = null
    tribunal.resolved = true
    enterNightPhase(session)
    return true
}

// 게임 중 나가기: 산 사람이면 탈락, 방장 넘기기, 남은 표·준비·밤 행동에서 빼기
// 피고가 나가면 재판 취소하고 밤으로
function commitParticipantDeparture(session, uuid, { reason = 'PARTICIPANT_LEFT' } = {}) {
    // 판 없거나 끝난 판이면 거절
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    // 판에 없거나 이미 나간 사람이면 거절 (두 번 나가기, 지도 12-⑥)
    const player = session.players.get(uuid)
    if (!player) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (player.isParticipating === false) return { ok: false, code: 'ALREADY_LEFT' }
    if (hasForfeited(session, uuid)) return { ok: false, code: 'ALREADY_LEFT' }

    // 나가기 전 모습 적어 둠 (살았나·무슨 단계·재판 피고였나)
    const wasAlive = player.alive === true
    const phaseAtDeparture = session.phase
    const wasDefendant = session.phase === 'TRIBUNAL'
        && session.tribunal?.defendantUuid === uuid
        && session.tribunal?.resolved !== true

    let eliminated = false
    let terminal = null
    // 여기부터 진짜 바뀜: 산 사람이면 끊김 탈락으로 죽임
    if (wasAlive) {
        const applied = commitDisconnectElimination(session, uuid)
        if (!applied.ok) return applied
        eliminated = true
        terminal = applied.terminal
    } else {
        // 이미 죽은 사람은 기권·떠난 명단에만 넣음
        recordForfeit(session, uuid)
    }

    // 참여 끝 표시, 참여 번호 +1 (밤 판정이 그사이 바뀐 것 알아채게)
    player.isParticipating = false
    session.participationRevision = getParticipationRevision(session) + 1

    // 내 판 기록이 이 판일 때만 지움 (다른 판 기록 안 건드림, 지도 12-⑤)
    const released = releasePlayerSession(uuid, session.id)

    const { hostChanged, newHostUuid } = passHostOnLeave(session, uuid)

    // 뭘 지웠는지 socket 쪽에 알려 줄 기록
    const cleanup = {
        removedRoleRevealAck: false,
        removedDayVoteReady: false,
        removedDayVote: false,
        normalizedVoterUuids: [],
        removedTribunalVote: false,
    }
    let tribunalCancelled = false

    // 승패 안 났을 때만 남은 기록에서 나 빼기
    if (!terminal) {
        removeFromRecords(session, uuid, cleanup)
        tribunalCancelled = removeFromTribunal(session, uuid, { wasDefendant, cleanup })
    }

    return {
        ok: true,
        reason,
        victimUuid: uuid,
        eliminated,
        terminal,
        wasAlive,
        phaseAtDeparture,
        hostChanged,
        newHostUuid,
        participationRevision: session.participationRevision,
        released,
        tribunalCancelled,
        cleanup,
    }
}

// 나간 사람 때문에 다 찬 단계면 넘김 (토론 → 투표)
// 역할 공개는 확인을 안 기다려 여기서 안 넘김, 10초 마감만 넘김 (사용자 결정 2026-11-09)
function advanceStalledPhase(session) {
    // 낮 토론 중: 남은 산 사람 다 준비했으면 투표로
    if (session.phase === 'DAY' && getDayPhase(session) === DAY_PHASES.DISCUSSION) {
        const eligibleUuids = getDayVoterUuids(session)
        if (eligibleUuids.length === 0) return { transitioned: null }
        const readyUuids = getDayVoteReadyUuids(session)
        if (!eligibleUuids.every((uuid) => readyUuids.has(uuid))) return { transitioned: null }
        enterDayVotePhase(session)
        return { transitioned: 'DAY_VOTE' }
    }
    return { transitioned: null }
}

module.exports = {
    commitParticipantDeparture,
    advanceStalledPhase,
}
