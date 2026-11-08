// MVP 뽑기 파일
// 판 중 직업별 점수 쌓기 + 끝난 판 MVP 한 명 고르기, 밤·재판 확정·결과 공개가 사용
const { ROLE_DEFINITIONS } = require('../core/rules/roles')
const { DEATH_REASONS } = require('./constants')
const { isRecoveryBlockedState } = require('../phase/night/progress')

// 셈법 (사용자 결정 2026-11-09, 간단 점수)
// - 시민: 광대 피고한테 넣은 유죄 표 1표당 1점
// - 의사: 광대가 노린 사람을 실제로 살린 밤 1번당 1점
// - 광대: 밤에 죽인 사람 1명당 1점 (광대끼리 죽인 건 안 셈)
// - 경비원: 조사한 사람이 광대였던 밤 1번당 1점
// - 마녀사냥꾼: 죽은 사람 직업 확인만 해서 0점
// - 끊김·나가기 탈락은 점수 없음

// 점수 장부 꺼내기 (없으면 만듦, 판 만들 때 칸을 안 둬도 되게)
function ensureMvpScores(session) {
    if (!(session.mvpScores instanceof Map)) session.mvpScores = new Map()
    return session.mvpScores
}

// 한 사람 점수 올리기
function addMvpPoint(session, uuid, points = 1) {
    const scores = ensureMvpScores(session)
    scores.set(uuid, (scores.get(uuid) ?? 0) + points)
}

// 팀 이름 (역할로 찾음)
function teamOf(player) {
    return ROLE_DEFINITIONS[player?.role]?.team ?? null
}

// 이 역할로 이 대상을 낸 사람들 (막힌 사람 빼고, 의사는 안 막힘)
function findCreditedActors(session, resolution, role, targetId) {
    const credited = []
    for (const player of session.players.values()) {
        if (player.role !== role) continue
        if (session.nightActions?.get(player.uuid) !== targetId) continue
        if (role !== 'DOCTOR' && isRecoveryBlockedState(resolution.recoveryStates?.get(player.uuid))) continue
        credited.push(player.uuid)
    }
    return credited
}

// 밤 확정 때 점수: 광대 죽임 · 의사 살림 · 경비원 광대 찾음
// commit이 결과 기록 뒤, 죽은 사람 밤 행동 지우기 전에 부름
function recordNightMvpPoints(session, resolution, victimUuid) {
    // 광대: 실제로 죽은 사람이 광대 아니면 그 사람 고른 광대한테 1점
    const victim = victimUuid === null ? null : session.players.get(victimUuid)
    if (victim && teamOf(victim) !== 'JOKER') {
        for (const uuid of findCreditedActors(session, resolution, 'JOKER', victimUuid)) addMvpPoint(session, uuid)
    }

    // 의사: 치료 사건(광대 노린 사람 살림)마다, 살린 사람이 광대 편 아니면 1점
    for (const event of resolution.events ?? []) {
        if (event?.type !== 'HEAL') continue
        const saved = session.players.get(event.targetId)
        if (!saved || teamOf(saved) === 'JOKER') continue
        for (const uuid of findCreditedActors(session, resolution, 'DOCTOR', event.targetId)) addMvpPoint(session, uuid)
    }

    // 경비원: 조사 결과가 광대면 1점
    const guardStep = (resolution.roleSteps ?? []).find((step) => step?.role === 'GUARD')
    if (guardStep?.status === 'RESOLVED') {
        const target = session.players.get(guardStep.targetId)
        if (target?.role === 'JOKER') {
            for (const uuid of findCreditedActors(session, resolution, 'GUARD', guardStep.targetId)) addMvpPoint(session, uuid)
        }
    }
}

// 재판 확정 때 점수: 피고가 광대면 유죄 낸 시민한테 1점씩 (결과가 무죄여도 표는 셈)
function recordTribunalMvpPoints(session, resolution) {
    const defendant = session.players.get(resolution.defendantUuid)
    if (defendant?.role !== 'JOKER') return
    for (const { voterUuid, choice } of resolution.ballotSnapshot ?? []) {
        if (choice !== 'GUILTY') continue
        if (session.players.get(voterUuid)?.role !== 'CITIZEN') continue
        addMvpPoint(session, voterUuid)
    }
}

// 끝난 판 MVP 고르기 ({ uuid } 또는 null)
// 이긴 팀 → 점수 높은 사람 → 끝까지 산 사람 → 자리 순서(판 사람 목록 순서, 무작위 없음)
function pickMvp(session) {
    const winner = session?.winResult?.winner
    if (winner !== 'CITIZEN' && winner !== 'JOKER') return null

    // 이긴 팀 사람 (산 채로 판 떠난 사람은 전적에서도 패라 뺌, 다 빠지면 팀 전체)
    const team = [...session.players.values()].filter((player) => teamOf(player) === winner)
    const stayed = team.filter((player) => player.deathReason !== DEATH_REASONS.DISCONNECT)
    const candidates = stayed.length > 0 ? stayed : team
    if (candidates.length === 0) return null

    // 앞에서부터 보며 더 나은 사람만 바꿔 앉힘 (같으면 앞자리 그대로)
    const scores = session.mvpScores instanceof Map ? session.mvpScores : new Map()
    let best = null
    for (const player of candidates) {
        if (best === null) { best = player; continue }
        const diff = (scores.get(player.uuid) ?? 0) - (scores.get(best.uuid) ?? 0)
        if (diff > 0 || (diff === 0 && player.alive === true && best.alive !== true)) best = player
    }
    return { uuid: best.uuid }
}

module.exports = { recordNightMvpPoints, recordTribunalMvpPoints, pickMvp }
