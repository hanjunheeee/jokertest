const crypto = require('crypto')

const GAME_ROLES = { JOKER: 'JOKER', CITIZEN: 'CITIZEN' }
const INITIAL_GAME_PHASE = 'ROLE_REVEAL' // 아직 밤이 시작되지 않은 역할 확인 단계(사용자 확정)
const INITIAL_DAY_INDEX = 0

/** gameId → { id, roomId, channelId, phase, dayIndex, jokerCount, players: Map<uuid,{uuid,nickname,role}> } */
const gameSessions = new Map()
/** uuid → gameId — 한 사용자가 속한 활성 GameSession 역매핑(중복 참여 방지에도 사용) */
const playerSession = new Map()
/** roomId → gameId — Room 하나당 활성 GameSession을 하나만 허용하기 위한 역매핑 */
const roomGameSession = new Map()

// 순수 계산 — 어떤 Map도 읽지 않는다. randomFn을 주입하면 완전히 결정적이다.
function fisherYatesShuffle(items, randomFn) {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

function assignRoles(players, jokerCount, randomFn = Math.random) {
    const shuffled = fisherYatesShuffle(players, randomFn)
    return shuffled.map((player, index) => ({
        ...player,
        role: index < jokerCount ? GAME_ROLES.JOKER : GAME_ROLES.CITIZEN,
    }))
}

// players/jokerCount 자체의 불변조건을 검증한다. registry를 읽지 않는 순수 함수다.
// matchmaking의 기존 가드(computeCanStart 등)가 정상 경로에서 이를 막는다는 사실이
// game-core 자체의 불변조건을 보장하지 않으므로 이 파일 안에서 독립적으로 검증한다.
function validateSessionInput(players, jokerCount) {
    if (!Array.isArray(players) || players.length === 0) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'EMPTY_PLAYERS' }
    }
    const seenUuids = new Set()
    for (const player of players) {
        if (!player || typeof player.uuid !== 'string' || player.uuid.length === 0) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_UUID' }
        }
        if (typeof player.nickname !== 'string' || player.nickname.trim().length === 0) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_NICKNAME' }
        }
        if (seenUuids.has(player.uuid)) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'DUPLICATE_UUID' }
        }
        seenUuids.add(player.uuid)
    }
    if (!Number.isInteger(jokerCount) || jokerCount < 0) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_JOKER_COUNT' }
    }
    if (jokerCount >= players.length) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'JOKER_COUNT_TOO_HIGH' }
    }
    return { ok: true }
}

// prepare 계산 자체는 입력 검증 통과 후에만 진행한다. registry를 전혀 읽지 않는다.
function buildSessionCandidate(room, { randomFn, gameIdFn = crypto.randomUUID } = {}) {
    const players = [...room.players.values()]
    const jokerCount = room.settings?.jokerCount ?? 0

    const validation = validateSessionInput(players, jokerCount)
    if (!validation.ok) return validation

    const assigned = assignRoles(players, jokerCount, randomFn)
    const session = {
        id: gameIdFn(),
        roomId: room.id,
        channelId: room.id, // 기존 Socket.IO room(roomId)을 그대로 승계
        phase: INITIAL_GAME_PHASE,
        dayIndex: INITIAL_DAY_INDEX,
        // commit 경계(assertValidSessionForCommit)에서 실제 역할 분포와 대조하기 위해
        // jokerCount를 session에 함께 보관한다.
        jokerCount,
        // validateSessionInput이 uuid 중복을 이미 걸러냈으므로 이 Map 생성이 조용히
        // 참가자를 덮어쓸 수 없다.
        players: new Map(assigned.map((p) => [p.uuid, p])),
    }
    return { ok: true, session }
}

// 읽기 전용 precondition — registry를 조회만 하고 바꾸지 않는다. "순수 함수"라고
// 부르지 않는다(외부 상태를 읽으므로).
function checkGameSessionPreconditions(room) {
    if (roomGameSession.has(room.id)) {
        return { ok: false, code: 'DUPLICATE_ROOM_SESSION' }
    }
    for (const uuid of room.players.keys()) {
        if (playerSession.has(uuid)) {
            return { ok: false, code: 'PLAYER_ALREADY_IN_SESSION' }
        }
    }
    return { ok: true }
}

// prepare = precondition 검사 + (통과 시) candidate 생성(그 안에서 입력 검증도 수행).
// 이 함수 자체도 registry에 쓰기는 하지 않는다.
function prepareGameSession(room, opts) {
    const precondition = checkGameSessionPreconditions(room)
    if (!precondition.ok) return precondition
    return buildSessionCandidate(room, opts)
}

// commitGameSession은 matchmaking.js가 직접 호출하는 export 함수라, buildSessionCandidate를
// 거치지 않고 (이론상 잘못 조립된) session 객체가 그대로 들어올 가능성까지 스스로 방어해야
// game-core의 불변조건이 "이 파일 안에서" 완결된다. validateSessionInput은 buildSessionCandidate
// 경로만 보호하므로, commit 시점에도 session 구조 자체를 다시 검증한다.
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
    // channelId/phase/dayIndex는 현재 candidate 경로에서 고정값만 만들어지지만, 수동
    // 조립된 session까지 완전히 방어한다는 이 함수의 목적에 맞춰 여기서도 검사한다.
    if (session.channelId !== session.roomId) {
        throw new Error('commitGameSession: channelId가 roomId와 일치하지 않음')
    }
    if (session.phase !== INITIAL_GAME_PHASE) {
        throw new Error(`commitGameSession: 잘못된 phase(${session.phase})`)
    }
    if (session.dayIndex !== INITIAL_DAY_INDEX) {
        throw new Error(`commitGameSession: 잘못된 dayIndex(${session.dayIndex})`)
    }
    // jokerCount 자체의 범위와, 실제 배정된 JOKER 수가 그 값과 일치하는지를 함께 검사한다.
    // 개별 role이 JOKER/CITIZEN 중 하나라는 것만으로는 "시민이 최소 한 명 있어야 한다"는
    // 불변조건(jokerCount < players.size)이 깨진 session(예: 전원 JOKER)을 걸러낼 수 없다.
    if (!Number.isInteger(session.jokerCount) || session.jokerCount < 0 || session.jokerCount >= session.players.size) {
        throw new Error(`commitGameSession: 잘못된 session.jokerCount(${session.jokerCount})`)
    }
    let actualJokerCount = 0
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
        if (player.role === GAME_ROLES.JOKER) actualJokerCount += 1
    }
    // role이 JOKER/CITIZEN 두 값으로만 제한된 상태에서 JOKER 수까지 일치하면, 나머지
    // 전원이 CITIZEN이라는 것도 함께 보장된다(별도 CITIZEN 카운트 검사가 필요 없음).
    if (actualJokerCount !== session.jokerCount) {
        throw new Error(
            `commitGameSession: 실제 JOKER 수(${actualJokerCount})가 session.jokerCount(${session.jokerCount})와 불일치`
        )
    }
}

// commit — 쓰기 시작 전에 스스로 다시 한 번 검증한다(호출 순서에 대한 신뢰만으로
// 안전을 주장하지 않는다). 구조 검증(assertValidSessionForCommit) → registry 충돌
// 검증 순서로 전부 통과한 뒤에만 Map.set을 시작해, 쓰기 도중 예외로 일부만 반영되는
// 상황을 막는다. Map.set 호출 "사이"에 발생하는 진짜 런타임 예외(OOM 등)까지는
// 방어하지 않는다 — 그런 경우는 프로세스 자체가 이미 불안정한 상태이므로 이
// 슬라이스의 책임 범위 밖으로 둔다.
function commitGameSession(session) {
    assertValidSessionForCommit(session)

    if (gameSessions.has(session.id)) {
        throw new Error(`GameSession id 충돌: ${session.id}`)
    }
    if (roomGameSession.has(session.roomId)) {
        throw new Error(`Room에 이미 활성 GameSession 존재: ${session.roomId}`)
    }
    for (const uuid of session.players.keys()) {
        if (playerSession.has(uuid)) {
            throw new Error(`참가자가 이미 다른 GameSession에 속함: ${uuid}`)
        }
    }
    gameSessions.set(session.id, session)
    roomGameSession.set(session.roomId, session.id)
    session.players.forEach((_, uuid) => playerSession.set(uuid, session.id))
}

// 특정 참가자 시점의 game_started payload. 다른 참가자의 role은 절대 포함하지 않는다.
function buildGameStartedPayload(session, viewerUuid) {
    const viewer = session.players.get(viewerUuid)
    return {
        gameId: session.id,
        state: {
            id: session.id,
            phase: session.phase,
            dayIndex: session.dayIndex,
            players: [...session.players.values()].map(({ uuid, nickname }) => ({ uuid, nickname })), // role 없음
            self: viewer ? { uuid: viewer.uuid, nickname: viewer.nickname, role: viewer.role } : null,
        },
    }
}

/**
 * 특정 uuid가 속한 활성 GameSession을 즉시 종료합니다(참가자 전원을 3개 registry에서
 * 제거). uuid가 어떤 활성 GameSession에도 속해있지 않으면 아무 것도 바꾸지 않고
 * { ok:false, code:'NOT_IN_SESSION' }을 반환합니다 — 대기방 disconnect 등 무관한 호출과
 * 안전하게 공존하기 위한 계약입니다.
 *
 * expectedGameId(선택)를 넘기면, uuid의 현재 세션이 정확히 그 gameId일 때만 종료를
 * 진행합니다 — 일치하지 않으면 { ok:false, code:'STALE_SESSION_MISMATCH' }를 반환하고
 * 아무 것도 바꾸지 않습니다. 종료 요청을 처리하는 시점과 그 요청이 원래 발생한 시점
 * 사이에 지연이 생길 수 있는 호출자가, 그 사이 같은 uuid가 새로 시작한 다른
 * GameSession을 대신 삭제해버리는 ABA 문제를 막기 위한 가드입니다. 이번 슬라이스의
 * 유일한 호출자(backend/socket/gameSession.js의 onDisconnect)는 disconnect 감지와 이
 * 함수 호출 사이에 await이 없어 항상 최신 상태를 읽으므로 지금 당장은 expectedGameId
 * 없이 호출해도 안전하지만, 가드 자체는 이 함수의 계약으로 지금 추가해 둔다.
 *
 * Socket.IO 관련 지식은 이 함수에 없습니다(순수 registry 조작). 알림 전송·Socket.IO
 * channel 정리는 소켓 계층(backend/socket/gameSession.js)의 책임입니다.
 */
function endGameSessionForPlayer(uuid, reason, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (expectedGameId !== undefined && gameId !== expectedGameId) {
        return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    }

    const session = gameSessions.get(gameId)
    gameSessions.delete(gameId)
    roomGameSession.delete(session.roomId)
    session.players.forEach((_, playerUuid) => playerSession.delete(playerUuid))

    return { ok: true, session, reason }
}

/** 테스트 전용: 모듈 내부 상태를 초기화합니다. 런타임 코드에서는 호출하지 마세요. */
function __resetStateForTests() {
    gameSessions.clear()
    playerSession.clear()
    roomGameSession.clear()
}

/** 테스트 전용: 내부 Map을 라이브 참조가 아닌 복제된 일반 객체로 반환합니다. */
function __getStateSnapshotForTests() {
    return {
        gameSessions: [...gameSessions.entries()].map(([id, s]) => [id, { ...s, players: [...s.players.entries()] }]),
        playerSession: [...playerSession.entries()],
        roomGameSession: [...roomGameSession.entries()],
    }
}

module.exports = {
    GAME_ROLES,
    prepareGameSession,
    commitGameSession,
    buildGameStartedPayload,
    endGameSessionForPlayer,
    __resetStateForTests,
    __getStateSnapshotForTests,
    // 테스트에서 개별 함수를 직접 호출하기 위한 통로입니다. 런타임 코드에서는 참조하지 않습니다.
    __testables: { assignRoles, validateSessionInput, buildSessionCandidate, checkGameSessionPreconditions, assertValidSessionForCommit },
}
