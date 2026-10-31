// 판 열기 파일
// 판 후보 마지막 검사 + 장부에 넣기 (여기서 진짜 판 생김)
const { MIN_SUPPORTED_PLAYERS, MAX_SUPPORTED_PLAYERS, INITIAL_GAME_PHASE, INITIAL_DAY_INDEX } = require('./constants')
const { RATE_FIELD } = require('../chat')
const { GAME_ROLES } = require('../core/roles')
const { computeRoleComposition, validateResolvedComposition } = require('../roleComposition')
const { gameSessions, roomGameSession, playerSession } = require('../core/state')
const { endGameSessionForPlayer } = require('../core/cleanup')
const { isParticipantBlockedFromMatchmaking } = require('../queries')

// 후보 판 모양 전부 검사 (조작·빠진 값 막기)
function assertValidSessionForCommit(session) {
    if (!session || typeof session.id !== 'string' || session.id.length === 0) {
        throw new Error('commitGameSession: 잘못된 session.id')
    }
    if (typeof session.roomId !== 'string' || session.roomId.length === 0) {
        throw new Error('commitGameSession: 잘못된 session.roomId')
    }
    if (!(session.players instanceof Map) || session.players.size === 0) {
        throw new Error('commitGameSession: session.players가 비어있거나 Map이 아님')
    }
    if (session.players.size < MIN_SUPPORTED_PLAYERS || session.players.size > MAX_SUPPORTED_PLAYERS) {
        throw new Error(`commitGameSession: 지원하지 않는 인원(${session.players.size})`)
    }
    if (!(session.roleRevealAcks instanceof Set)) {
        throw new Error('commitGameSession: session.roleRevealAcks가 Set이 아님')
    }
    if (session.roleRevealAcks.size !== 0) {
        throw new Error(`commitGameSession: session.roleRevealAcks가 비어있지 않음(size=${session.roleRevealAcks.size})`)
    }
    if (!(session.nightActions instanceof Map)) {
        throw new Error('commitGameSession: session.nightActions가 Map이 아님')
    }
    if (session.nightActions.size !== 0) {
        throw new Error(`commitGameSession: session.nightActions가 비어있지 않음(size=${session.nightActions.size})`)
    }
    for (const field of Object.values(RATE_FIELD)) {
        if (!(session[field] instanceof Map)) {
            throw new Error(`commitGameSession: session.${field}이 Map이 아님`)
        }
        if (session[field].size !== 0) {
            throw new Error(`commitGameSession: session.${field}이 비어있지 않음(size=${session[field].size})`)
        }
    }
    if (session.nightResolution !== null) {
        throw new Error('commitGameSession: session.nightResolution이 null이 아님')
    }
    if (!(session.dayVotes instanceof Map)) {
        throw new Error('commitGameSession: session.dayVotes가 Map이 아님')
    }
    if (session.dayVotes.size !== 0) {
        throw new Error(`commitGameSession: session.dayVotes가 비어있지 않음(size=${session.dayVotes.size})`)
    }
    if (session.dayVoteRound !== 1) {
        throw new Error(`commitGameSession: 잘못된 session.dayVoteRound(${session.dayVoteRound})`)
    }
    if (!(session.dayVoteExcludedUuids instanceof Set)) {
        throw new Error('commitGameSession: session.dayVoteExcludedUuids가 Set이 아님')
    }
    if (session.dayVoteExcludedUuids.size !== 0) {
        throw new Error(
            `commitGameSession: session.dayVoteExcludedUuids가 비어있지 않음(size=${session.dayVoteExcludedUuids.size})`,
        )
    }
    if (session.channelId !== session.roomId) {
        throw new Error('commitGameSession: channelId가 roomId와 일치하지 않음')
    }
    if (session.phase !== INITIAL_GAME_PHASE) {
        throw new Error(`commitGameSession: 잘못된 phase(${session.phase})`)
    }
    if (session.dayIndex !== INITIAL_DAY_INDEX) {
        throw new Error(`commitGameSession: 잘못된 dayIndex(${session.dayIndex})`)
    }
    if (!Number.isInteger(session.jokerCount) || session.jokerCount < 0 || session.jokerCount >= session.players.size) {
        throw new Error(`commitGameSession: 잘못된 session.jokerCount(${session.jokerCount})`)
    }
    const actualCounts = { JOKER: 0, CITIZEN: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
    for (const [key, player] of session.players) {
        if (!player || typeof player.uuid !== 'string' || player.uuid.length === 0) {
            throw new Error('commitGameSession: 잘못된 player.uuid')
        }
        if (key !== player.uuid) {
            throw new Error(`commitGameSession: players Map key(${key})와 player.uuid(${player.uuid}) 불일치`)
        }
        if (typeof player.nickname !== 'string' || player.nickname.trim().length === 0) {
            throw new Error('commitGameSession: 잘못된 player.nickname')
        }
        if (!Object.values(GAME_ROLES).includes(player.role)) {
            throw new Error(`commitGameSession: 허용되지 않은 role(${player.role})`)
        }
        if (player.alive !== true) {
            throw new Error('commitGameSession: 잘못된 player.alive(신규 세션은 전원 생존 상태여야 함)')
        }
        actualCounts[player.role] += 1
    }
    let expected
    if (session.roleComposition === undefined) {
        expected = computeRoleComposition(session.players.size, session.jokerCount)
    } else {
        const compositionCheck = validateResolvedComposition(
            session.roleComposition, session.players.size, session.jokerCount,
        )
        if (!compositionCheck.ok) {
            throw new Error(`commitGameSession: 잘못된 session.roleComposition(${compositionCheck.reason})`)
        }
        expected = session.roleComposition
    }
    const mismatchedRoles = Object.keys(GAME_ROLES).filter((role) => actualCounts[role] !== expected[role])
    if (mismatchedRoles.length > 0) {
        const detail = mismatchedRoles
            .map((role) => `실제 ${role} 수(${actualCounts[role]})가 기대값(${expected[role]})과 불일치`)
            .join(', ')
        throw new Error(`commitGameSession: ${detail}`)
    }
}

// 판 장부 3개에 같이 넣기 (같은 방 두 번 시작이면 throw)
function commitGameSession(session) {
    assertValidSessionForCommit(session)

    if (gameSessions.has(session.id)) {
        throw new Error(`GameSession id 충돌: ${session.id}`)
    }
    if (roomGameSession.has(session.roomId)) {
        throw new Error(`Room에 이미 활성 GameSession 존재: ${session.roomId}`)
    }
    for (const uuid of session.players.keys()) {
        const existingGameId = playerSession.get(uuid)
        if (existingGameId && existingGameId !== session.id) {
            const existingSession = gameSessions.get(existingGameId)
            if (existingSession?.phase === 'ENDED') {
                endGameSessionForPlayer(uuid, 'SUPERSEDED_BY_NEW_GAME', existingGameId)
            } else if (isParticipantBlockedFromMatchmaking(uuid)) {
                throw new Error(`참가자가 이미 다른 GameSession에 속함: ${uuid}`)
            }
        }
    }
    gameSessions.set(session.id, session)
    roomGameSession.set(session.roomId, session.id)
    session.players.forEach((_, uuid) => playerSession.set(uuid, session.id))
}

module.exports = {
    assertValidSessionForCommit,
    commitGameSession,
}