// 판 열기 파일
// 판 후보 마지막 검사 + 장부에 넣기 (여기서 진짜 판 생김)
// matchmaking이 게임 시작 때 gameSession.js 통해서 사용
const { MIN_SUPPORTED_PLAYERS, MAX_SUPPORTED_PLAYERS, INITIAL_GAME_PHASE, INITIAL_DAY_INDEX } = require('./constants')
const { RATE_FIELD } = require('../chat')
const { GAME_ROLES } = require('../core/rules/roles')
const { computeRoleComposition, validateResolvedComposition } = require('../core/rules/roleComposition')
const { registerGameSession } = require('../core/registry/write')
const { endGameSessionForPlayer } = require('../core/registry/write')
const { isParticipantBlockedFromMatchmaking, hasSessionId, hasRoomSession, getPlayerGameId, getSessionById } = require('../queries')

// 후보 판 모양 전부 검사 (조작·빠진 값 막기)
function assertValidSessionForCommit(session) {
    // 판 id·방 id가 있는지, 사람이 2~10명인지
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
    // 기록 칸이 전부 제 모양이고 비어 있는지 (새 판인데 뭐가 들어 있으면 거절)
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
    // 채팅 간격 기록 칸들도 비어 있어야 함
    for (const field of Object.values(RATE_FIELD)) {
        if (!(session[field] instanceof Map)) {
            throw new Error(`commitGameSession: session.${field}이 Map이 아님`)
        }
        if (session[field].size !== 0) {
            throw new Error(`commitGameSession: session.${field}이 비어있지 않음(size=${session[field].size})`)
        }
    }
    // 밤 판정·낮 투표도 아직 아무것도 없어야 함 (투표는 1회차부터)
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
    // 방송 채널 = 방 id, 역할 확인 단계·0일째로 시작
    if (session.channelId !== session.roomId) {
        throw new Error('commitGameSession: channelId가 roomId와 일치하지 않음')
    }
    if (session.phase !== INITIAL_GAME_PHASE) {
        throw new Error(`commitGameSession: 잘못된 phase(${session.phase})`)
    }
    if (session.dayIndex !== INITIAL_DAY_INDEX) {
        throw new Error(`commitGameSession: 잘못된 dayIndex(${session.dayIndex})`)
    }
    // 광대 수는 0 이상, 전체 인원보다 적어야 함
    if (!Number.isInteger(session.jokerCount) || session.jokerCount < 0 || session.jokerCount >= session.players.size) {
        throw new Error(`commitGameSession: 잘못된 session.jokerCount(${session.jokerCount})`)
    }
    // 사람마다 uuid·닉네임·역할·생존 확인하면서 역할별 인원 셈
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
    // 기대 인원: 구성 칸 없으면 광대 수로 계산, 있으면 그 구성이 맞는지 먼저 봄
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
    // 실제 역할 인원이 기대랑 다르면 어느 역할인지 적어서 throw
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
    // 후보 모양부터 검사 (틀리면 throw)
    assertValidSessionForCommit(session)

    // 판 id 겹침·같은 방 판 이미 있음 막기
    if (hasSessionId(session.id)) {
        throw new Error(`GameSession id 충돌: ${session.id}`)
    }
    if (hasRoomSession(session.roomId)) {
        throw new Error(`Room에 이미 활성 GameSession 존재: ${session.roomId}`)
    }
    // 참가자가 옛 판에 남아 있을 때: 끝난 판이면 거기서 빼고, 아직 묶여 있으면 throw
    for (const uuid of session.players.keys()) {
        const existingGameId = getPlayerGameId(uuid)
        if (existingGameId && existingGameId !== session.id) {
            const existingSession = getSessionById(existingGameId)
            if (existingSession?.phase === 'ENDED') {
                endGameSessionForPlayer(uuid, 'SUPERSEDED_BY_NEW_GAME', existingGameId)
            } else if (isParticipantBlockedFromMatchmaking(uuid)) {
                throw new Error(`참가자가 이미 다른 GameSession에 속함: ${uuid}`)
            }
        }
    }
    // 여기부터 진짜 바뀜: 장부 3개에 같이 넣음 = 판 생김
    registerGameSession(session)
}

module.exports = {
    assertValidSessionForCommit,
    commitGameSession,
}