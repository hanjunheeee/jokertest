// 진행 표시 파일
// 단계별 몇 명 했는지 + 내가 냈는지, 스냅샷·방송이 사용
// 내 진행 번호 올리기(상태 바뀜)도 여기 둠, socket 쪽이 내 제출 알림 보낼 때 사용
const { getEligibleDayVoterUuids, getDayPhase, DAY_PHASES, getDayVoteRound, getDayVoteReadyUuids } = require('../phase/day')
const { getEligibleTribunalVoterUuids } = require('../phase/tribunal')

// 지금 단계에서 몇 명 했는지 / 몇 명 해야 하는지 (밤은 숫자 숨김)
function buildPublicPhaseProgress(session) {
    // 역할 확인: 참여 중인 사람 중 확인한 수
    if (session.phase === 'ROLE_REVEAL') {
        const pending = [...session.players.values()].filter((p) => p.isParticipating !== false)
        const acks = session.roleRevealAcks instanceof Set ? session.roleRevealAcks : new Set()
        return {
            kind: 'ROLE_REVEAL',
            doneCount: pending.filter((p) => acks.has(p.uuid)).length,
            requiredCount: pending.length,
        }
    }
    // 낮: 토론 중이면 투표 준비한 수, 투표 중이면 표 낸 수
    if (session.phase === 'DAY') {
        const eligible = getEligibleDayVoterUuids(session)
        if (getDayPhase(session) === DAY_PHASES.DISCUSSION) {
            const ready = getDayVoteReadyUuids(session)
            return {
                kind: 'DAY_DISCUSSION',
                doneCount: eligible.filter((uuid) => ready.has(uuid)).length,
                requiredCount: eligible.length,
            }
        }
        return {
            kind: 'DAY_VOTE',
            doneCount: eligible.filter((uuid) => session.dayVotes.has(uuid)).length,
            requiredCount: eligible.length,
        }
    }
    // 재판: 피고 뺀 투표할 사람 중 표 낸 수
    if (session.phase === 'TRIBUNAL' && session.tribunal) {
        const eligible = getEligibleTribunalVoterUuids(session, session.tribunal.defendantUuid)
        const votes = session.tribunal.votes instanceof Map ? session.tribunal.votes : new Map()
        return {
            kind: 'TRIBUNAL',
            doneCount: eligible.filter((uuid) => votes.has(uuid)).length,
            requiredCount: eligible.length,
        }
    }
    // 밤은 숫자 숨김 (몇 명 냈는지로 역할 인원이 샐 수 있음)
    return { kind: session.phase === 'NIGHT' ? 'NIGHT' : 'NONE', doneCount: null, requiredCount: null }
}

// 지금 단계에서 내가 낸 것 (역할 확인·투표 준비·낮 표·재판 표)
function buildSelfSubmissionFields(session, uuid) {
    const fields = {}
    // 역할 확인: 내가 확인했는지
    if (session.phase === 'ROLE_REVEAL') {
        fields.hasAcknowledgedRoleReveal = session.roleRevealAcks instanceof Set
            && session.roleRevealAcks.has(uuid)
        return fields
    }
    // 낮 토론: 내가 투표 준비 눌렀는지
    if (session.phase === 'DAY') {
        if (getDayPhase(session) === DAY_PHASES.DISCUSSION) {
            fields.isDayVoteReady = getDayVoteReadyUuids(session).has(uuid)
            return fields
        }
        // 낮 투표: 냈는지 + 누구 찍었는지 + 몇 회차인지 (내 것만이라 보여도 됨)
        const submitted = session.dayVotes.has(uuid)
        fields.hasSubmittedDayVote = submitted
        const target = submitted ? session.dayVotes.get(uuid) : null
        fields.dayVoteTargetUuid = target === undefined ? null : target
        fields.dayVoteRound = getDayVoteRound(session)
        return fields
    }
    // 재판: 표 냈는지만 (유죄·무죄는 안 실음)
    if (session.phase === 'TRIBUNAL' && session.tribunal) {
        fields.hasSubmittedTribunalVote = session.tribunal.votes instanceof Map
            && session.tribunal.votes.has(uuid)
        return fields
    }
    return fields
}

// 지금 단계에서 내가 이미 했는지
function computeHasActed(session, uuid) {
    switch (session.phase) {
        case 'ROLE_REVEAL':
            return session.roleRevealAcks.has(uuid)
        case 'NIGHT':
            return session.nightActions.has(uuid)
        // 낮은 투표 중이면 표, 토론 중이면 투표 준비
        case 'DAY':
            if (getDayPhase(session) === DAY_PHASES.VOTE) return session.dayVotes.has(uuid)
            return getDayVoteReadyUuids(session).has(uuid)
        case 'TRIBUNAL':
            return session.tribunal ? session.tribunal.votes.has(uuid) : false
        default:
            return false
    }
}

// 내 진행 번호 +1 (늦게 온 옛 알림 거르기용)
function bumpSelfProgressSeq(session) {
    // 이상한 값이면 0부터 다시
    const next = (Number.isSafeInteger(session.selfProgressSeq) ? session.selfProgressSeq : 0) + 1
    session.selfProgressSeq = next
    return next
}

module.exports = {
    buildPublicPhaseProgress,
    buildSelfSubmissionFields,
    computeHasActed,
    bumpSelfProgressSeq,
}
