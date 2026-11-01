// 밤 연출 계약 파일
// 역할 턴 성공 사건·받을 사람(행동자·대상 소켓) 계약 만들기 + 받는 사람별 성공 payload, socket gameSession 밤 턴이 씀
const gameSessionCore = require('../../../../game-core/gameSession')
const { isNonEmptyString } = require('../../../common/shape')
const { isolateOr } = require('../../../common/isolate')
const { isSessionOnlyRecipient } = require('../../delivery/eligibility')
const { resolveSessionSockets } = require('../../delivery/broadcast')
const {
    NIGHT_CONTRACT_VERSION,
    NIGHT_EVENT_TYPES,
    NIGHT_PERSPECTIVES,
} = require('../../core/constants')

// 계약 깊은 복사 (저장본이 밖에서 바뀌지 않게)
function cloneNightContract(contract) {
    return {
        version: contract.version,
        gameId: contract.gameId,
        nightDayIndex: contract.nightDayIndex,
        role: contract.role,
        revision: contract.revision,
        step: { ...contract.step },
        healingClosed: contract.healingClosed,
        events: contract.events.map((event) => ({
            eventId: event.eventId,
            type: event.type,
            targetId: event.targetId,
            actorUuids: [...event.actorUuids],
            recipients: event.recipients.map((recipient) => ({
                uuid: recipient.uuid,
                membershipId: recipient.membershipId,
                socketId: recipient.socketId,
                perspectives: [...recipient.perspectives],
            })),
        })),
        recoveryStates: { ...contract.recoveryStates },
    }
}

// 사건 받을 사람: 행동자는 USER·대상은 TARGET 시점, 받을 소켓 정해진 계정만
function buildNightRecipients(session, socketIdByUuid, actorUuids, targetId) {
    const wanted = new Map()
    for (const uuid of actorUuids) {
        if (!isNonEmptyString(uuid)) continue
        wanted.set(uuid, new Set(['USER']))
    }
    if (isNonEmptyString(targetId)) {
        const perspectives = wanted.get(targetId) ?? new Set()
        perspectives.add('TARGET')
        wanted.set(targetId, perspectives)
    }

    const recipients = []
    for (const [uuid, perspectives] of wanted) {
        if (!socketIdByUuid.has(uuid)) continue
        recipients.push({
            uuid,
            membershipId: session.players.get(uuid)?.membershipId ?? null,
            socketId: socketIdByUuid.get(uuid),
            perspectives: NIGHT_PERSPECTIVES.filter((perspective) => perspectives.has(perspective)),
        })
    }
    return recipients
}

// 밤 연출 계약 만들기: 이 역할 턴 성공 사건 + 받을 사람(행동자·대상 소켓), 같은 리비전은 저장본 재사용
function buildNightPresentationContract(run, completed) {
    const { io, session } = run
    const role = completed?.role ?? null
    const revision = completed?.revision ?? null

    const stored = run.contracts.get(role)
    if (stored && stored.revision === revision) return cloneNightContract(stored)

    const progress = gameSessionCore.getNightProgress(session)
    const step = { ...(completed?.step ?? {}) }

    const recoveryStates = {}
    for (const [uuid, state] of progress?.recoveryStates ?? []) recoveryStates[uuid] = state

    const eventType = NIGHT_EVENT_TYPES[role] ?? null
    const descriptors = []
    if (eventType === 'KILL' || eventType === 'HEAL') {
        for (const event of progress?.events ?? []) {
            if (event?.type !== eventType) continue
            descriptors.push({ type: event.type, targetId: event.targetId ?? null })
        }
    } else if (eventType !== null && step.status === 'RESOLVED' && typeof step.targetId === 'string') {
        descriptors.push({ type: eventType, targetId: step.targetId })
    }

    // 사건이 있으면 행동자 모으기 (회복 대기·사망 후보 행동자는 의사 빼고 제외)
    const actorUuids = []
    if (descriptors.length > 0) {
        const submissions = isolateOr([], '[밤 연출 계약 오류]', { code: 'ACTOR_COLLECT_ERROR', role, gameId: session.id },
            () => gameSessionCore.collectRoleNightSubmissions(session, role))
        const states = gameSessionCore.NIGHT_RECOVERY_STATES
        for (const submission of submissions) {
            if ((submission?.target ?? null) === null) continue
            if (role !== 'DOCTOR') {
                const state = progress?.recoveryStates?.get(submission.actorUuid)
                if (state === states.PENDING_RECOVERY || state === states.DEATH_CANDIDATE) continue
            }
            if (!actorUuids.includes(submission.actorUuid)) actorUuids.push(submission.actorUuid)
        }
    }

    // 받을 수 있는 계정마다 소켓 하나 고정 (다른 판·대기방 소속 생긴 계정은 뺌)
    const socketIdByUuid = new Map()
    if (descriptors.length > 0) {
        const candidates = isolateOr([], '[밤 연출 계약 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', role, gameId: session.id },
            () => resolveSessionSockets(io, session))
        for (const candidate of candidates) {
            const uuid = candidate?.data?.user?.uuid ?? null
            if (!isNonEmptyString(uuid)) continue
            if (socketIdByUuid.has(uuid)) continue
            if (!isSessionOnlyRecipient(session, candidate, uuid)) continue
            socketIdByUuid.set(uuid, typeof candidate.id === 'string' ? candidate.id : null)
        }
    }

    const contract = {
        version: NIGHT_CONTRACT_VERSION,
        gameId: session.id,
        nightDayIndex: run.nightDayIndex,
        role,
        revision,
        step,
        healingClosed: completed?.healingClosed === true,
        events: descriptors.map((descriptor, index) => ({
            eventId: `night-presentation:${session.id}:${run.nightDayIndex}:${role}:${revision}:${index}`,
            type: descriptor.type,
            targetId: descriptor.targetId,
            actorUuids: [...actorUuids],
            recipients: buildNightRecipients(session, socketIdByUuid, actorUuids, descriptor.targetId),
        })),
        recoveryStates,
    }
    run.contracts.set(role, contract)
    return cloneNightContract(contract)
}

// 받는 사람별 밤 성공 payload (USER 시점에만 대상 id 실음)
function buildNightPayload(contract, event, recipient) {
    const payload = {
        gameId: contract.gameId,
        nightDayIndex: contract.nightDayIndex,
        eventId: event.eventId,
        type: event.type,
        perspectives: [...recipient.perspectives],
    }
    if (recipient.perspectives.includes('USER')) payload.targetId = event.targetId
    return payload
}

module.exports = {
    cloneNightContract,
    buildNightRecipients,
    buildNightPresentationContract,
    buildNightPayload,
}
