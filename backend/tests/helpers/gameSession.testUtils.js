// 판 시험 도우미 파일, 판 만들기·단계 넘기기·비밀 새는지 검사
// 백엔드 판 시험이 씀, 판은 늘 5명 이상 (어느 환경에서나 5~10명 규칙)
const assert = require('node:assert/strict')

const gameSession = require('../../game-core/gameSession')
const { buildSessionCandidate } = gameSession.__testables
const {
    commitGameSession,
    acknowledgeRoleReveal,
    acknowledgeDayVoteReady,
    submitNightAction,
    prepareNightResolution,
    commitNightResolution,
    submitDayVote,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    submitTribunalVote,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    commitGameChatMessage,
    GAME_ROLES,
} = gameSession

function makePlayer(uuid, nickname = `nick-${uuid}`, extra = {}) {
    return { uuid, nickname, isReady: true, ...extra }
}

// 기본 5명 방 (5명 밑은 판 만들기에서 거절됨)
function makeRoom({ id = 'room-1', players, jokerCount = 1 } = {}) {
    const playerList = players ?? ['u1', 'u2', 'u3', 'u4', 'u5'].map((uuid) => makePlayer(uuid))
    return {
        id,
        players: new Map(playerList.map((p) => [p.uuid, p])),
        settings: { jokerCount },
    }
}

function sequenceRandom(sequence) {
    let i = 0
    return () => sequence[Math.min(i++, sequence.length - 1)]
}

function setupTribunalReadySession({
    uuids = ['t1', 't2', 't3', 't4', 't5'],
    defendantUuid = 't3',
    roomId = `tribunal-${uuids.join('-')}`,
    randomFn = Math.random,
} = {}) {
    const room = makeRoom({
        id: roomId,
        players: uuids.map((uuid) => makePlayer(uuid)),
    })
    const prepared = gameSession.prepareGameSession(room, { randomFn })
    gameSession.commitGameSession(prepared.session)
    const session = prepared.session
    session.phase = 'TRIBUNAL'
    session.dayVoteResolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: defendantUuid,
        publicVoteCount: uuids.length,
        publicAbstainCount: 0,
    }
    session.tribunal = { candidateId: defendantUuid, dayIndex: session.dayIndex, defendantUuid, votes: new Map() }
    return { session, defendantUuid }
}

function commitRoleRevealSession({ id, uuids, jokerCount = 1 }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    return candidate.session
}

function validSession(overrides = {}) {
    return {
        id: 'game-1',
        roomId: 'room-1',
        channelId: 'room-1',
        phase: 'ROLE_REVEAL',
        dayIndex: 0,
        jokerCount: 1,
        players: new Map([
            ['u1', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.JOKER, alive: true }],
            ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.CITIZEN, alive: true }],
            ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN, alive: true }],
            ['u4', { uuid: 'u4', nickname: 'D', role: GAME_ROLES.CITIZEN, alive: true }],
            ['u5', { uuid: 'u5', nickname: 'E', role: GAME_ROLES.CITIZEN, alive: true }],
        ]),
        roleRevealAcks: new Set(),
        nightActions: new Map(),
        jokerChatRateLimit: new Map(),
        dayChatRateLimit: new Map(),
        deadChatRateLimit: new Map(),
        nightResolution: null,
        dayVotes: new Map(),
        dayVoteRound: 1,
        dayVoteExcludedUuids: new Set(),
        ...overrides,
    }
}

function ackAllAndRewindToFirstNight(session, { dayIndex = 0 } = {}) {
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    session.dayIndex = dayIndex
    session.nightActions = new Map()
    session.nightResolution = null
    session.dayVotes = new Map()
    session.dayVoteResolution = null
    session.tribunal = null
}

function commitFullRoleSessionAtNight({ id = 'room-full', gameIdFn } = {}) {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`fp-${id}-${i}`))
    const room = makeRoom({ id, players, jokerCount: 1 })
    const opts = { randomFn: () => 0.999, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
    const byRole = (role) => [...session.players.values()].find((p) => p.role === role).uuid
    return {
        session,
        jokerUuid: byRole('JOKER'),
        doctorUuid: byRole('DOCTOR'),
        guardUuid: byRole('GUARD'),
        witchHunterUuid: byRole('WITCH_HUNTER'),
        citizenUuid: byRole('CITIZEN'),
    }
}

// 5명·광대 2 첫 밤: 시민 하나 죽으면 2:2라 바로 광대 승
function commitJokerPairSessionAtNight({ id = 'room-joker', gameIdFn } = {}) {
    const players = Array.from({ length: 5 }, (_, i) => makePlayer(`j${i}-${id}`))
    const room = makeRoom({ id, players, jokerCount: 2 })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const citizenUuids = [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    return { session, jokerUuids, citizenUuid: citizenUuids[0], citizenUuids }
}

// 5명·광대 1 첫 밤: 한 명 죽어도 1:3이라 승부 안 남
function nightSessionOf5NoWin({ id = 'room-cnr5' } = {}) {
    const room = makeRoom({
        id,
        players: Array.from({ length: 5 }, (_, i) => makePlayer(`cnr5-${i}`)),
        jokerCount: 1,
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    ackAllAndRewindToFirstNight(candidate.session)
    return candidate.session
}

function commitAssassinationNight({ id = 'room-reveal' } = {}) {
    const session = nightSessionOf5NoWin({ id })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const victimUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    submitNightAction(jokerUuid, session.id, victimUuid)
    const prepared = prepareNightResolution(jokerUuid, session.id)
    assert.equal(prepared.ok, true, `commitAssassinationNight: 밤 판정 준비 실패(${prepared.code})`)
    assert.equal(prepared.session, session)
    const applied = commitNightResolution(session, prepared.resolution)
    return { session, jokerUuid, victimUuid, prepared, applied }
}

function nightSessionWithDoctor({ id, jokerCount = 1, playerCount = 5 } = {}) {
    const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`nd-${id}-${i}`))
    const room = makeCustomRoom({
        id,
        players,
        roleCounts: { JOKER: jokerCount, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
    const byRole = (role) => [...session.players.values()].filter((p) => p.role === role).map((p) => p.uuid)
    const [doctorUuid] = byRole('DOCTOR')
    const jokerUuids = byRole('JOKER')
    const citizenUuids = byRole('CITIZEN')
    return { session, doctorUuid, jokerUuids, jokerUuid: jokerUuids[0], citizenUuids }
}

function nightSessionWithDuplicateRole({
    id = 'room-dup',
    role,
    count = 2,
    jokerCount = 1,
    playerCount = 6,
    dayIndex = 0,
} = {}) {
    const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`dup-${id}-${i}`))
    const room = makeCustomRoom({
        id,
        players,
        roleCounts: { JOKER: jokerCount, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, [role]: count },
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    assert.equal(candidate.ok, true, `nightSessionWithDuplicateRole: 세션 조립 실패(${candidate.reason})`)
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session, { dayIndex })
    const byRole = (r) => [...session.players.values()].filter((p) => p.role === r).map((p) => p.uuid)
    return {
        session,
        roleUuids: byRole(role),
        jokerUuids: byRole('JOKER'),
        citizenUuids: byRole('CITIZEN'),
    }
}

function advanceDayToVotePhase(session) {
    if (session.dayPhase === 'DAY_VOTE') return
    for (const player of session.players.values()) {
        if (player.alive) acknowledgeDayVoteReady(player.uuid, session.id)
    }
    assert.equal(session.dayPhase, 'DAY_VOTE')
}

// 첫 낮 판 (기본 5명·광대 1, 5~10명), 앞 다섯 명은 uuidA~uuidE로도 줌
function commitSessionAtDay({ id = 'room-day', advanceToVote = true, playerCount = 5 } = {}) {
    const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`d${i}-${id}`))
    const room = makeRoom({ id, players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')
    if (advanceToVote) advanceDayToVotePhase(session)
    const uuids = [...session.players.keys()]
    const [uuidA, uuidB, uuidC, uuidD, uuidE] = uuids
    return { session, uuids, uuidA, uuidB, uuidC, uuidD, uuidE }
}

function castAllVotes(session, votesByUuid) {
    for (const [voterUuid, vote] of Object.entries(votesByUuid)) {
        submitTribunalVote(voterUuid, session.id, session.dayIndex, vote)
    }
}

function makeWinConditionSession(playerSpecs) {
    return { players: new Map(playerSpecs.map((p) => [p.uuid, p])) }
}

function ackAll(session) {
    ackAllAndRewindToFirstNight(session)
}

function resolveJokerOnlyNight(session, jokerUuid, targetUuid) {
    submitNightAction(jokerUuid, session.id, targetUuid)
    const prepared = prepareNightResolution(jokerUuid, session.id)
    return commitNightResolution(prepared.session, prepared.resolution)
}

function resolveDayVotes(session, votesByUuid) {
    advanceDayToVotePhase(session)
    for (const [voterUuid, targetUuid] of Object.entries(votesByUuid)) {
        submitDayVote(voterUuid, session.id, targetUuid)
    }
    const [anyVoter] = Object.keys(votesByUuid)
    const prepared = prepareDayVoteResolution(anyVoter, session.id, session.dayIndex)
    return commitDayVoteResolution(prepared.session, prepared.resolution)
}

function resolveTribunalVotes(session, votesByUuid) {
    for (const [voterUuid, vote] of Object.entries(votesByUuid)) {
        submitTribunalVote(voterUuid, session.id, session.dayIndex, vote)
    }
    const [anyVoter] = Object.keys(votesByUuid)
    const prepared = prepareTribunalVoteResolution(anyVoter, session.id, session.dayIndex)
    return commitTribunalVoteResolution(prepared.session, prepared.resolution)
}

const FORBIDDEN_PRIVATE_KEYS = new Set([
    'role', 'team', 'allies',
    'votes', 'nightActions', 'dayVotes', 'roleRevealAcks',
    'nightTargetUuid', 'dayVoteTargetUuid', 'tribunalVoteUuid', 'tribunalVote',
])

const APPROVED_PUBLIC_VALUE_PATHS = new Set([
    'players.*.uuid',
    'nightResult.victimUuid',
    'nightResult.deathReveals.*.victimUuid',
    'nightResult.deathReveals.*.source',
    'dayVoteResolution.tribunalTargetUuid',
    'tribunal.defendantUuid',
    'tribunal.executedUuid',
    'tribunal.outcome',
    'winResult.winner',
])

function normalizeSnapshotPath(path) {
    return path.map((segment) => (typeof segment === 'number' ? '*' : segment)).join('.')
}

function assertNoForbiddenPrivateData(value, secretValues, path = [], insideSelf = false) {
    if (Array.isArray(value)) {
        value.forEach((item, i) => assertNoForbiddenPrivateData(item, secretValues, [...path, i], insideSelf))
        return
    }
    if (value !== null && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
            const nextInsideSelf = insideSelf || (path.length === 0 && key === 'self')
                || (path.length === 1 && path[0] === 'winResult' && key === 'reveals')
            assert.ok(
                nextInsideSelf || !FORBIDDEN_PRIVATE_KEYS.has(key),
                `forbidden key "${key}" found at ${[...path, key].join('.') || '(root)'}`,
            )
            assertNoForbiddenPrivateData(val, secretValues, [...path, key], nextInsideSelf)
        }
        return
    }
    if (typeof value === 'string' && !insideSelf && !APPROVED_PUBLIC_VALUE_PATHS.has(normalizeSnapshotPath(path))) {
        for (const secret of secretValues) {
            assert.notStrictEqual(value, secret.value, `leaked ${secret.label} at ${path.join('.') || '(root)'}`)
        }
    }
}

function collectOtherPlayerRoleSecrets(session, viewerUuid) {
    const secrets = []
    for (const player of session.players.values()) {
        if (player.uuid === viewerUuid) continue
        secrets.push({ value: player.role, label: `role(${player.uuid})=${player.role}` })
    }
    return secrets
}

function makeCustomRoom({ id = 'custom-room', players, roleCounts, maxPlayers = 10 } = {}) {
    const playerList = players ?? ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid))
    const counts = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, ...roleCounts }
    return {
        id,
        players: new Map(playerList.map((p) => [p.uuid, p])),
        settings: {
            maxPlayers,
            jokerCount: counts.JOKER,
            roleCompositionMode: 'custom',
            roleCounts: counts,
        },
    }
}

function countRoles(session) {
    const counts = { JOKER: 0, CITIZEN: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
    for (const player of session.players.values()) counts[player.role] += 1
    return counts
}

function setupGameChatSession({ id = 'room-gc', phase = 'DAY', uuids = ['gc1', 'gc2', 'gc3', 'gc4', 'gc5'], gameIdFn } = {}) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    session.phase = phase
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const citizenUuids = [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    return { session, jokerUuid, citizenUuids }
}

function chatRateLimitSnapshot(session) {
    return {
        DAY: [...session.dayChatRateLimit.entries()],
        DEAD: [...session.deadChatRateLimit.entries()],
        JOKER: [...session.jokerChatRateLimit.entries()],
    }
}

function commitPrepared(prepared, options = {}) {
    const now = Object.hasOwn(options, 'now') ? options.now : prepared.sentAt
    return commitGameChatMessage(prepared, { now: () => now })
}

function tamperPrepared(prepared, patch = {}) {
    const { message, ...top } = patch
    Object.assign(prepared, top)
    if (Object.hasOwn(patch, 'message')) {
        if (message === null || typeof message !== 'object') prepared.message = message
        else Object.assign(prepared.message, message)
    }
    return prepared
}

function handBuiltPrepared({ session, channel, actorUuid, nickname, text, sentAt, dayIndex, messageId = 'forged-id' }) {
    return {
        ok: true,
        session,
        channel,
        actorUuid,
        nickname,
        sanitizedText: text,
        sentAt,
        dayIndex,
        message: { gameId: session.id, messageId, senderUuid: actorUuid, nickname, text, sentAt, dayIndex },
    }
}

function sourcedNightResolution(session, fields = {}) {
    const resolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        pendingEliminationTargetId: null,
        privateResults: new Map(),
        resolved: true,
        ...fields,
    }
    return gameSession.__registerNightPreparationForTests(session, resolution)
}

module.exports = {
    makePlayer,
    makeRoom,
    sequenceRandom,
    sourcedNightResolution,
    setupTribunalReadySession,
    commitRoleRevealSession,
    validSession,
    ackAllAndRewindToFirstNight,
    commitFullRoleSessionAtNight,
    commitJokerPairSessionAtNight,
    nightSessionOf5NoWin,
    commitAssassinationNight,
    nightSessionWithDoctor,
    nightSessionWithDuplicateRole,
    advanceDayToVotePhase,
    commitSessionAtDay,
    castAllVotes,
    makeWinConditionSession,
    ackAll,
    resolveJokerOnlyNight,
    resolveDayVotes,
    resolveTribunalVotes,
    FORBIDDEN_PRIVATE_KEYS,
    APPROVED_PUBLIC_VALUE_PATHS,
    normalizeSnapshotPath,
    assertNoForbiddenPrivateData,
    collectOtherPlayerRoleSecrets,
    makeCustomRoom,
    countRoles,
    setupGameChatSession,
    chatRateLimitSnapshot,
    commitPrepared,
    tamperPrepared,
    handBuiltPrepared,
}
