// 판 만들기 파일
// 판 후보 만들기 + 시작 전 검사, matchmaking이 게임 시작 때 사용
const crypto = require('crypto')
const { validateSessionInput, buildRoomSettingsSource, buildTimerSettings } = require('./input')
const { resolveRoleComposition } = require('../roleComposition')
const { assignRoles } = require('./assign')
const { INITIAL_GAME_PHASE, INITIAL_DAY_INDEX } = require('./constants')
const { resolveGameSource } = require('../result')
const { roomGameSession } = require('../core/state')
const { isParticipantBlockedFromMatchmaking } = require('../queries')

// 방 → 판 후보 (역할 나누고 판 기본값 채움, 아직 장부에 안 넣음)
function buildSessionCandidate(room, { randomFn, gameIdFn = crypto.randomUUID } = {}) {
    const players = [...room.players.values()]
    const jokerCount = room.settings?.jokerCount ?? 0

    const validation = validateSessionInput(players, jokerCount)
    if (!validation.ok) return validation

    const resolved = resolveRoleComposition(room.settings, players.length)
    if (!resolved.ok) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: `INVALID_ROLE_COMPOSITION:${resolved.reason}` }
    }

    const assigned = assignRoles(players, resolved.composition, randomFn)
    for (const player of assigned) player.isParticipating = true
    const session = {
        id: gameIdFn(),
        startedAt: Date.now(),
        roomId: room.id,
        roomCode: typeof room.code === 'string' && room.code ? room.code : null,
        roomSettingsSource: buildRoomSettingsSource(room),
        channelId: room.id,
        hostUuid: room.hostUuid ?? null,
        roomInstanceId: room.instanceId ?? room.id,
        bootEpoch: room.bootEpoch ?? null,
        participationRevision: 0,
        selfProgressSeq: 0,
        phase: INITIAL_GAME_PHASE,
        dayIndex: INITIAL_DAY_INDEX,
        jokerCount: resolved.composition.JOKER,
        gameSource: resolveGameSource(),
        roleComposition: { ...resolved.composition },
        players: new Map(assigned.map((p) => [p.uuid, p])),
        roleRevealAcks: new Set(),
        nightActions: new Map(),
        jokerChatRateLimit: new Map(),
        dayChatRateLimit: new Map(),
        deadChatRateLimit: new Map(),
        nightResolution: null,
        nightProgress: null,
        dayVotes: new Map(),
        dayPhase: null,
        dayVoteReadyUuids: new Set(),
        dayVoteRound: 1,
        dayVoteExcludedUuids: new Set(),
        dayVoteResolution: null,
        tribunal: null,
        dayVoteSfx: new Map(),
        timerSettings: buildTimerSettings(room.settings),
    }
    return { ok: true, session }
}

// 같은 방 판 이미 있는지·참가자가 다른 판에 있는지
function checkGameSessionPreconditions(room) {
    if (roomGameSession.has(room.id)) {
        return { ok: false, code: 'DUPLICATE_ROOM_SESSION' }
    }
    for (const uuid of room.players.keys()) {
        if (isParticipantBlockedFromMatchmaking(uuid)) {
            return { ok: false, code: 'PLAYER_ALREADY_IN_SESSION' }
        }
    }
    return { ok: true }
}

// 판 만들기 준비: 검사 + 후보 만들기
function prepareGameSession(room, opts) {
    const precondition = checkGameSessionPreconditions(room)
    if (!precondition.ok) return precondition
    return buildSessionCandidate(room, opts)
}

module.exports = {
    buildSessionCandidate,
    checkGameSessionPreconditions,
    prepareGameSession,
}