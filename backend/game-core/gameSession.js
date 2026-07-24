const crypto = require('crypto')

// 5개 역할의 단일 canonical 정의. GAME_ROLES/ROLE_TEAMS는 모두 이 정의에서 파생된다
// (역할명을 여러 상수에 손으로 나열하면 하나만 바뀌었을 때 조용히 어긋날 수 있음).
// nightActionMinDayIndex는 "이 역할이 능력을 쓸 수 있는 가장 이른 dayIndex"다 — null이면
// 애초에 밤 행동이 없는 역할(CITIZEN). 후속 NIGHT 행동 슬라이스가 소비할 최소 계약이며,
// 이번 슬라이스의 어떤 실행 로직도 이 값을 참조하지 않는다.
// 바깥 객체만 Object.freeze하면 각 역할의 내부 필드는 여전히 재할당 가능하므로, canonical
// metadata를 외부에서 변형 불가능하게 하려면 역할별 정의 각각도 개별적으로 동결해야 한다.
const ROLE_DEFINITIONS = Object.freeze({
    JOKER: Object.freeze({ team: 'JOKER', nightActionMinDayIndex: 0 }),
    CITIZEN: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: null }),
    DOCTOR: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0 }),
    GUARD: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0 }),
    WITCH_HUNTER: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 1 }),
})

const GAME_ROLES = Object.freeze(
    Object.fromEntries(Object.keys(ROLE_DEFINITIONS).map((role) => [role, role])),
)
const ROLE_TEAMS = Object.freeze(
    Object.fromEntries(Object.entries(ROLE_DEFINITIONS).map(([role, def]) => [role, def.team])),
)

const MIN_SUPPORTED_PLAYERS = 2
const MAX_SUPPORTED_PLAYERS = 10

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

// 인원수 구간별 특수 시민 역할 상한("budget"). 도입 우선순위(DOCTOR → GUARD →
// WITCH_HUNTER, 사용자 확정)와 함께 computeRoleComposition이 남은 슬롯에서 이 상한만큼만
// 채운다. 2~10명 도메인에서만 정의된다(아래 MIN/MAX_SUPPORTED_PLAYERS 참고).
function getSpecialRoleBudget(playerCount) {
    if (playerCount >= 10) return { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }
    if (playerCount >= 8) return { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 }
    if (playerCount >= 6) return { DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 }
    return { DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } // 2~5명
}

// 순수 계산 — 슬롯 절삭(slot-cutting) 방식이라 항상 성공한다: 먼저 jokerCount만큼 JOKER를
// 배정하고, 남은 non-JOKER 슬롯에서 DOCTOR → GUARD → WITCH_HUNTER 순으로 "budget과 남은
// 슬롯 중 작은 값"만큼만 채운 뒤, 최종 남은 슬롯은 전부 CITIZEN이 된다. 슬롯이 모자라면
// 우선순위 뒤쪽 역할부터 0명이 될 뿐 거부/예외는 없다 — 입력 자체의 불변조건
// (jokerCount < playerCount, 정수, 0 이상, 2~10명)은 validateSessionInput이 이미
// 보장하므로 이 함수는 그 보장 위에서 계산만 한다. 어떤 유효 입력에서도 각 역할 수는
// 0 이상이고 합계는 정확히 playerCount다.
function computeRoleComposition(playerCount, jokerCount) {
    const budget = getSpecialRoleBudget(playerCount)
    let remaining = playerCount - jokerCount

    const doctorCount = Math.min(budget.DOCTOR, remaining)
    remaining -= doctorCount
    const guardCount = Math.min(budget.GUARD, remaining)
    remaining -= guardCount
    const witchHunterCount = Math.min(budget.WITCH_HUNTER, remaining)
    remaining -= witchHunterCount

    return {
        JOKER: jokerCount,
        DOCTOR: doctorCount,
        GUARD: guardCount,
        WITCH_HUNTER: witchHunterCount,
        CITIZEN: remaining, // 남은 슬롯 전부
    }
}

function assignRoles(players, jokerCount, randomFn = Math.random) {
    const shuffled = fisherYatesShuffle(players, randomFn)
    const composition = computeRoleComposition(players.length, jokerCount)
    const roles = [
        ...Array(composition.JOKER).fill(GAME_ROLES.JOKER),
        ...Array(composition.DOCTOR).fill(GAME_ROLES.DOCTOR),
        ...Array(composition.GUARD).fill(GAME_ROLES.GUARD),
        ...Array(composition.WITCH_HUNTER).fill(GAME_ROLES.WITCH_HUNTER),
        ...Array(composition.CITIZEN).fill(GAME_ROLES.CITIZEN),
    ]
    return shuffled.map((player, index) => ({ ...player, role: roles[index] }))
}

// players/jokerCount 자체의 불변조건을 검증한다. registry를 읽지 않는 순수 함수다.
// matchmaking의 기존 가드(computeCanStart 등)가 정상 경로에서 이를 막는다는 사실이
// game-core 자체의 불변조건을 보장하지 않으므로 이 파일 안에서 독립적으로 검증한다.
function validateSessionInput(players, jokerCount) {
    if (!Array.isArray(players) || players.length === 0) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'EMPTY_PLAYERS' }
    }
    // computeRoleComposition의 인원별 구성표는 2~10명 도메인에서만 정의된다. 정상 Room
    // 경로는 maxPlayers∈[4..10]/getMinPlayers() 덕분에 실질적으로 이 범위 안에 있지만,
    // game-core는 socket 계층의 가드를 신뢰하지 않고 독립적으로 재검증한다는 이 파일의
    // 원칙에 따라 여기서도 명시적으로 강제한다.
    if (players.length < MIN_SUPPORTED_PLAYERS || players.length > MAX_SUPPORTED_PLAYERS) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'PLAYER_COUNT_OUT_OF_RANGE' }
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
        // ROLE_REVEAL 확인을 추적한다. 세션 객체 안에 두어 endGameSessionForPlayer로
        // 세션이 삭제될 때 별도 정리 없이 함께 사라지게 한다.
        roleRevealAcks: new Set(),
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
    // computeRoleComposition의 구성표는 2~10명 도메인에서만 정의된다 — validateSessionInput과
    // 동일한 이유로 commit 경계에서도 독립적으로 재검증한다.
    if (session.players.size < MIN_SUPPORTED_PLAYERS || session.players.size > MAX_SUPPORTED_PLAYERS) {
        throw new Error(`commitGameSession: 지원하지 않는 인원(${session.players.size})`)
    }
    // roleRevealAcks도 candidate 경로가 고정값(빈 Set)만 만드는 필드이지만, phase/dayIndex/
    // channelId와 동일한 이유로 이 함수 안에서 독립적으로 재검증한다.
    if (!(session.roleRevealAcks instanceof Set)) {
        throw new Error('commitGameSession: session.roleRevealAcks가 Set이 아님')
    }
    if (session.roleRevealAcks.size !== 0) {
        throw new Error(`commitGameSession: session.roleRevealAcks가 비어있지 않음(size=${session.roleRevealAcks.size})`)
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
        actualCounts[player.role] += 1
    }
    // 5개 역할 전체 분포를 기대 구성과 대조한다. session에 composition을 저장해두지 않고
    // session.jokerCount/session.players.size로부터 매번 재계산해 대조한다("저장된 값을
    // 신뢰하지 않고 재계산·재검증"하는 이 파일의 기존 스타일과 동일).
    const expected = computeRoleComposition(session.players.size, session.jokerCount)
    for (const role of Object.keys(GAME_ROLES)) {
        if (actualCounts[role] !== expected[role]) {
            throw new Error(
                `commitGameSession: 실제 ${role} 수(${actualCounts[role]})가 기대값(${expected[role]})과 불일치`
            )
        }
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
            self: viewer
                ? { uuid: viewer.uuid, nickname: viewer.nickname, role: viewer.role, team: ROLE_TEAMS[viewer.role] }
                : null,
        },
    }
}

/**
 * ROLE_REVEAL 단계의 역할 확인을 처리합니다. 인증된 uuid와 클라이언트가 알고 있는 gameId만
 * 입력으로 받습니다(role 등 비밀 정보는 이 함수의 입력에도 출력에도 없습니다).
 *
 * game-core 자체가 독립적으로 입력을 검증합니다(validateSessionInput과 동일한 이유 —
 * 소켓 계층의 가드가 정상 경로에서 이를 막는다는 사실이 game-core의 불변조건을 보장하지
 * 않습니다). 모든 실패 경로는 어떤 상태도 바꾸지 않고 반환합니다.
 *
 * SESSION_NOT_FOUND/NOT_A_PARTICIPANT는 playerSession/gameSessions registry가 정상 경로에서는
 * 항상 동기화되어 있다는 불변조건이 깨졌을 때만 나오는 내부 진단용 코드입니다 — 소켓 계층은
 * 이 두 코드를 클라이언트에 그대로 전달하지 않고 INTERNAL_ERROR로 정규화해야 합니다.
 *
 * 반환하는 session은 이미 커밋된 실제 registry 참조이므로, transitioned:true를 받은 호출자는
 * 그 즉시(await 없이) game_phase_changed 방송에 사용해야 합니다.
 */
function acknowledgeRoleReveal(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    // playerSession/gameSessions/roomGameSession은 정상 경로에서 항상 함께 갱신되지만, 이
    // 함수는 그 불변조건을 "신뢰"만 하지 않고 직접 확인한다(assertValidSessionForCommit과
    // 동일한 방어적 태도).
    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (session.phase !== 'ROLE_REVEAL') return { ok: false, code: 'INVALID_PHASE' }

    if (session.roleRevealAcks.has(uuid)) return { ok: true, transitioned: false, session }

    session.roleRevealAcks.add(uuid)
    if (session.roleRevealAcks.size === session.players.size) {
        session.phase = 'NIGHT'
        return { ok: true, transitioned: true, session }
    }
    return { ok: true, transitioned: false, session }
}

/** ROLE_REVEAL→NIGHT 전이를 참가자 전체에게 알리는 공용 payload. 참가자 식별·비밀 정보를 전혀 포함하지 않는다. */
function buildPhaseChangedPayload(session) {
    return { gameId: session.id, phase: session.phase, dayIndex: session.dayIndex }
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

/**
 * 테스트 전용: gameSessions Map에서만 항목을 지웁니다(playerSession/roomGameSession은
 * 그대로 둡니다). registry 불일치(SESSION_NOT_FOUND) 회귀 테스트를 재현하기 위한 용도로만
 * 존재하며, 런타임 코드에서는 참조하지 않습니다. 이 함수를 쓰는 테스트는 실행 전후로
 * __resetStateForTests()를 호출해 다른 테스트로 상태가 새지 않게 격리해야 합니다.
 */
function __deleteGameSessionOnlyForTests(gameId) {
    gameSessions.delete(gameId)
}

module.exports = {
    GAME_ROLES,
    ROLE_DEFINITIONS,
    ROLE_TEAMS,
    prepareGameSession,
    commitGameSession,
    buildGameStartedPayload,
    endGameSessionForPlayer,
    acknowledgeRoleReveal,
    buildPhaseChangedPayload,
    __resetStateForTests,
    __getStateSnapshotForTests,
    // 테스트에서 개별 함수를 직접 호출하거나 registry를 의도적으로 파괴하기 위한 통로입니다.
    // 런타임 코드에서는 참조하지 않습니다.
    __testables: {
        assignRoles,
        validateSessionInput,
        buildSessionCandidate,
        checkGameSessionPreconditions,
        assertValidSessionForCommit,
        getSpecialRoleBudget,
        computeRoleComposition,
        __deleteGameSessionOnlyForTests,
    },
}
