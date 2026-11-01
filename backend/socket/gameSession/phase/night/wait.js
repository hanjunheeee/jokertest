// 밤 연출 대기 파일
// 턴 사이 연출 대기 만들기·켜기·다시 판정·풀기 + 대기 중인지 조회, 밤 턴·밤 마무리·이탈·핸들러가 씀
// 풀면 다음 턴은 phaseHooks로 부름 (turn이 이 파일을 require해서 고리 막기)
const gameSessionCore = require('../../../../game-core/gameSession')
const { isNonEmptyString } = require('../../../common/shape')
const { isolate } = require('../../../common/isolate')
const { getOrCreate } = require('../../../common/maps')
const { NIGHT_TURN_STAGES } = require('../../core/constants')
const { nightTurnRuns, phaseHooks } = require('../../core/state')
const { deactivateWaitToken } = require('../../core/timers')
const { isSessionOnlyRecipient } = require('../../delivery/eligibility')
const { resolveSessionSockets } = require('../../delivery/broadcast')
const { isCurrentWaitToken, isEligibleForWait } = require('./checks')
const { getNightSuccessReceipts } = require('./receipts')
const { emitNightWait } = require('./notify')

// 연출 대기 표 만들기: 턴 닫고 대기 단계로 (아직 대기 켜기 전, 켜기는 activate가 함)
function beginNightWait(run, completed, contract) {
    const { session } = run
    run.waitSeq += 1
    const token = {
        run,
        session,
        gameId: session.id,
        nightDayIndex: run.nightDayIndex,
        role: completed.role,
        revision: completed.revision ?? null,
        waitId: `${session.id}:${run.nightDayIndex}:${completed.role}:${completed.revision}:${run.waitSeq}`,
        contract,
        active: false,
        timerId: null,
        waiting: null,
        notifyTargets: null,
    }
    // 여기부터 진짜 바뀜: 대기 단계로, 지금 역할·마감 시각 비움 (턴 사이 제출 막기는 핸들러가 함)
    run.stage = NIGHT_TURN_STAGES.PRESENTATION_WAIT
    run.wait = token
    session.nightTurnRole = null
    session.nightTurnDeadline = null
    return token
}

// 연출 대기 풀기: 지금 대기 표고 아직 그 밤일 때만, 풀면 다음 역할 턴으로
function releaseNightPresentationWait(run, token) {
    if (!isCurrentWaitToken(run, token)) return false
    const { session } = run
    if (session.phase !== 'NIGHT') return false
    if (session.dayIndex !== run.nightDayIndex) return false

    // 여기부터 진짜 바뀜: 대기 끄고 다음 턴 준비
    deactivateWaitToken(run, token)
    run.wait = null
    run.stage = NIGHT_TURN_STAGES.IDLE

    isolate('[연출 대기 해제 통지 오류]', { code: 'RELEASE_NOTIFY_ERROR', gameId: session.id },
        () => emitNightWait(run, token, false))

    // 다음 턴 열기는 night/turn 것을 주입받아 부름 (require 고리 막기)
    phaseHooks.advanceNightTurn(run)
    return true
}

// 이 판이 지금 연출 대기 단계인지 (대기 중엔 밤 마무리·제출 거절)
function isNightPresentationWaitActive(gameId) {
    const run = nightTurnRuns.get(gameId)
    return !!run && run.stage === NIGHT_TURN_STAGES.PRESENTATION_WAIT
}

// 연출 대기 시작: 사건 받은 사람 완료 신호를 기다리고, 나머지에겐 대기 알림, 상한 타이머 걸기 (지도 05-⑨)
function activateNightWait(run, token) {
    if (!isCurrentWaitToken(run, token)) return
    const { session } = run

    // 사건별로 기다릴 사람 모으기, 지금 받을 수 있는 사람이 하나도 없으면 바로 풂
    const contract = token.contract
    const waiting = new Map()
    let hasEvents = false
    let anyCurrentlyEligible = false
    if (contract && Array.isArray(contract.events)) {
        for (const event of contract.events) {
            for (const recipient of event.recipients ?? []) {
                if (!isNonEmptyString(recipient.uuid)) continue
                hasEvents = true
                const byUuid = getOrCreate(waiting, event.eventId, () => new Map())
                const membershipId = recipient.membershipId ?? null
                byUuid.set(recipient.uuid, membershipId)
                if (!anyCurrentlyEligible && isEligibleForWait(run, session, recipient.uuid, membershipId)) {
                    anyCurrentlyEligible = true
                }
            }
        }
    }

    token.waiting = waiting

    if (!hasEvents || !anyCurrentlyEligible) {
        releaseNightPresentationWait(run, token)
        return
    }

    // 기다리는 사람 명단 (대기 알림 대상에서 빼려고)
    const waitingUuids = new Set()
    for (const byUuid of waiting.values()) {
        for (const uuid of byUuid.keys()) waitingUuids.add(uuid)
    }

    // 기다리는 사람 말고 나머지 참가자에게 대기 알림 (계산이 중간에 던지면 거기까지 모은 사람만)
    const notifyTargets = []
    isolate('[연출 대기 통지 대상 계산 오류]', { code: 'NOTIFY_TARGET_ERROR', gameId: session.id }, () => {
        const candidates = resolveSessionSockets(run.io, session)
        for (const candidate of candidates) {
            const uuid = candidate?.data?.user?.uuid ?? null
            if (!isNonEmptyString(uuid)) continue
            if (waitingUuids.has(uuid)) continue
            if (!isSessionOnlyRecipient(session, candidate, uuid)) continue
            notifyTargets.push({ uuid, membershipId: session.players.get(uuid)?.membershipId ?? null })
        }
    })
    token.notifyTargets = notifyTargets

    isolate('[연출 대기 통지 오류]', { code: 'ACTIVATE_NOTIFY_ERROR', gameId: session.id },
        () => emitNightWait(run, token, true))

    // 여기부터 진짜 바뀜: 대기 켜고 상한 타이머 (완료 신호 안 와도 넘어가게)
    token.active = true
    token.timerId = run.setTimeoutFn(() => {
        if (run.wait !== token) return
        releaseNightPresentationWait(run, token)
    }, run.presentationWaitTimeoutMs)

    // 켜는 사이 자격 잃었거나 이미 완료한 사람 있으면 바로 풀리게 한 번 판정
    reevaluateNightWait(run, token)
}

// 연출 대기 다시 판정: 자격 잃은 사람은 기다림에서 빼고, 남은 사람 다 완료면 풂 (지도 05-⑨)
function reevaluateNightWait(run, token) {
    // 지난 표거나 아직 안 켠 표면 무시
    if (!isCurrentWaitToken(run, token)) return
    const { session } = run
    if (token.active !== true) return

    const waiting = token.waiting
    if (!waiting) return

    // 자격 잃은 사람 빼고, 남은 사람 없는 사건은 지움
    for (const [eventId, byUuid] of [...waiting]) {
        for (const [uuid, membershipId] of [...byUuid]) {
            if (!isEligibleForWait(run, session, uuid, membershipId)) {
                byUuid.delete(uuid)
            }
        }
        if (byUuid.size === 0) waiting.delete(eventId)
    }

    // 남은 사람이 전부 완료 신호 냈으면 풂, 한 명이라도 안 냈으면 계속 기다림
    const store = getNightSuccessReceipts(session)
    for (const [eventId, byUuid] of waiting) {
        const eventRecords = store?.byEvent.get(eventId)
        for (const uuid of byUuid.keys()) {
            const record = eventRecords?.get(uuid)
            if (!record || record.completed !== true) return
        }
    }

    releaseNightPresentationWait(run, token)
}

// 이 판이 연출 대기 중이면 그 판 routing (턴 사이 제출·판정 막기, 지도 05-⑥ · 06-⑤)
function nightWaitRoutingFor(uuid, gameId) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (routing && routing.gameId === gameId && isNightPresentationWaitActive(routing.gameId)) return routing
    return null
}

// 스냅샷 때 연출 대기 표시 여부: 대기 켜져 있고 내가 사건 받는 사람이 아니면 true, 알림 대상에도 넣음
function resolveNightWaitForSnap(session, uuid) {
    // 지금 run의 켜진 대기 표고 아직 그 밤인지
    const run = nightTurnRuns.get(session.id)
    if (!run) return false
    if (run.stage !== NIGHT_TURN_STAGES.PRESENTATION_WAIT) return false
    const token = run.wait
    if (!token || token.active !== true) return false
    if (token.run !== run) return false
    if (token.session !== session) return false
    if (token.gameId !== session.id) return false
    if (session.phase !== 'NIGHT') return false
    if (token.nightDayIndex !== run.nightDayIndex) return false
    if (session.dayIndex !== run.nightDayIndex) return false

    // 나도 지금 같은 자리로 연결돼 받을 수 있는지
    const membershipId = session.players.get(uuid)?.membershipId ?? null
    if (!isEligibleForWait(run, session, uuid, membershipId)) return false

    // 사건 받는 사람은 연출을 직접 보니 대기 표시 안 함
    const contract = token.contract
    if (contract && Array.isArray(contract.events)) {
        for (const event of contract.events) {
            for (const recipient of event.recipients ?? []) {
                if (recipient?.uuid === uuid) return false
            }
        }
    }

    // 다시 붙은 사람도 대기 해제 알림 받게 알림 대상에 넣음 (이미 있으면 안 넣음)
    if (Array.isArray(token.notifyTargets)) {
        const already = token.notifyTargets.some(
            (target) => target.uuid === uuid && target.membershipId === membershipId,
        )
        if (!already) token.notifyTargets.push({ uuid, membershipId })
    }
    return true
}

module.exports = {
    beginNightWait,
    releaseNightPresentationWait,
    isNightPresentationWaitActive,
    activateNightWait,
    reevaluateNightWait,
    nightWaitRoutingFor,
    resolveNightWaitForSnap,
}
