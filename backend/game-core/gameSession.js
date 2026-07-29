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

const JOKER_CHAT_MAX_LENGTH = 150
const JOKER_CHAT_MIN_INTERVAL_MS = 500

// 금지 문자: LF(\n)만 제외한 C0 제어문자 전체(TAB 포함) · DEL · C1 제어문자(NEL 포함) ·
// Arabic Letter Mark · LRM/RLM · bidi embedding/override · bidi isolate. bidi/서식 문자는
// 채팅에서 텍스트 표시 순서를 조작하는 스푸핑 벡터라 명시적으로 차단한다. 이 문자열은 v3에서
// 스크립트로 생성·검증된 값을 그대로 재사용한다(손으로 다시 타이핑하지 않음).
const JOKER_CHAT_FORBIDDEN_CHARS_PATTERN =
    /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

// 서버·프런트 동일 규칙(공유 모듈이 없는 저장소라 수동 동기화 —
// frontend/src/domains/game/ingame/utils/sanitizeJokerChatText.js). 순서: CRLF/CR 정규화 →
// 금지 문자 검사(정규화된 문자열 기준) → trim → 길이 검사(1~150).
function sanitizeJokerChatText(rawText) {
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (JOKER_CHAT_FORBIDDEN_CHARS_PATTERN.test(normalized)) {
        return { ok: false, code: 'INVALID_CHARACTERS' }
    }
    const trimmed = normalized.trim()
    if (trimmed.length === 0) return { ok: false, code: 'EMPTY_MESSAGE' }
    if (trimmed.length > JOKER_CHAT_MAX_LENGTH) return { ok: false, code: 'MESSAGE_TOO_LONG' }
    return { ok: true, text: trimmed }
}

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
        // NIGHT pending action을 추적한다. uuid → targetId(참가자 uuid) | null(SKIP).
        // roleRevealAcks와 동일한 이유로 세션 객체 안에 둔다.
        nightActions: new Map(),
        // JOKER 전용 NIGHT 채팅 스팸 방지용 "마지막 전송 시각"(uuid → epoch ms). 채팅 자체는
        // 영구 저장하지 않으므로 이 Map은 rate limit 판정에만 쓰인다. roleRevealAcks/nightActions와
        // 동일한 이유로 세션 객체 안에 둔다.
        jokerChatRateLimit: new Map(),
        // 이번 밤의 판정 결과(prepareNightResolution → commitNightResolution이 채운다). 커밋
        // 시점엔 항상 null이어야 하고(assertValidSessionForCommit), 판정 이후에는 다시 null로
        // 돌아가지 않는 immutable 값이 된다(재판정 금지 계약).
        nightResolution: null,
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
    // nightActions도 roleRevealAcks와 동일한 이유로 커밋 시점엔 항상 빈 Map이어야 한다.
    if (!(session.nightActions instanceof Map)) {
        throw new Error('commitGameSession: session.nightActions가 Map이 아님')
    }
    if (session.nightActions.size !== 0) {
        throw new Error(`commitGameSession: session.nightActions가 비어있지 않음(size=${session.nightActions.size})`)
    }
    // jokerChatRateLimit도 roleRevealAcks/nightActions와 동일한 이유로 커밋 시점엔 항상 빈 Map이어야 한다.
    if (!(session.jokerChatRateLimit instanceof Map)) {
        throw new Error('commitGameSession: session.jokerChatRateLimit이 Map이 아님')
    }
    if (session.jokerChatRateLimit.size !== 0) {
        throw new Error(`commitGameSession: session.jokerChatRateLimit이 비어있지 않음(size=${session.jokerChatRateLimit.size})`)
    }
    // nightResolution도 roleRevealAcks/nightActions/jokerChatRateLimit과 동일한 이유로
    // 커밋 시점엔 항상 null이어야 한다(아직 판정된 적 없는 새 세션).
    if (session.nightResolution !== null) {
        throw new Error('commitGameSession: session.nightResolution이 null이 아님')
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
// self.allies는 viewer가 JOKER일 때만 own-property로 존재한다 — 다른 JOKER의 uuid만 담고
// role 등 다른 정보는 포함하지 않는다(JOKER끼리만 서로 동료임을 아는 정책의 서버 측 계약).
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
                ? {
                      uuid: viewer.uuid,
                      nickname: viewer.nickname,
                      role: viewer.role,
                      team: ROLE_TEAMS[viewer.role],
                      ...(viewer.role === 'JOKER'
                          ? {
                                allies: [...session.players.values()]
                                    .filter((p) => p.role === 'JOKER' && p.uuid !== viewer.uuid)
                                    .map((p) => p.uuid),
                            }
                          : {}),
                  }
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

// 이 밤에 행동 가능한 역할인지 판정한다. nightActionMinDayIndex가 null이면(CITIZEN) 애초에
// 밤 행동이 없는 역할이라 항상 false다. 이 함수가 nightActionMinDayIndex를 최초로 소비한다
// (ROLE_DEFINITIONS 주석이 예고한 "후속 NIGHT 행동 슬라이스"가 바로 이것).
function isEligibleForNightAction(role, dayIndex) {
    const minDayIndex = ROLE_DEFINITIONS[role]?.nightActionMinDayIndex
    return minDayIndex !== null && minDayIndex !== undefined && dayIndex >= minDayIndex
}

// registry(session.players)를 읽기만 하는 순수 계산 — 이 밤에 행동 가능한 모든 참가자
// uuid를 반환한다. 제출 완료 여부와는 무관하다(session.nightActions는 참조하지 않는다).
function getEligibleNightActorUuids(session) {
    const uuids = []
    for (const player of session.players.values()) {
        if (isEligibleForNightAction(player.role, session.dayIndex)) uuids.push(player.uuid)
    }
    return uuids
}

// JOKER의 non-null target을 집계해 최다 득표 대상 하나를 반환한다. 동률(2명 이상이 공동
// 최다)이거나 전원 SKIP/미제출이면 null이다. Map 순회 순서에 의존하지 않도록 득표수 자체만
// 비교한다(먼저 등장한 대상이 아니라, 오직 표 수만으로 승자를 가린다).
function tallyJokerAssassinationTarget(session) {
    const voteCounts = new Map()
    for (const player of session.players.values()) {
        if (player.role !== 'JOKER') continue
        const target = session.nightActions.get(player.uuid)
        if (target === undefined || target === null) continue
        voteCounts.set(target, (voteCounts.get(target) ?? 0) + 1)
    }
    if (voteCounts.size === 0) return null

    let winner = null
    let winnerVotes = 0
    let tie = false
    for (const [target, votes] of voteCounts) {
        if (votes > winnerVotes) {
            winner = target
            winnerVotes = votes
            tie = false
        } else if (votes === winnerVotes) {
            tie = true
        }
    }
    return tie ? null : winner
}

// DOCTOR의 non-null target 전체를 Set으로 반환한다(이번 밤의 보호 대상 집합). 자기 보호를
// 포함해 별도 필터 없이 그대로 모은다.
function computeDoctorProtectionSet(session) {
    const protectedIds = new Set()
    for (const player of session.players.values()) {
        if (player.role !== 'DOCTOR') continue
        const target = session.nightActions.get(player.uuid)
        if (target === undefined || target === null) continue
        protectedIds.add(target)
    }
    return protectedIds
}

// 해당 GUARD 본인의 non-null target에 대한 조사 결과({targetId, team})를 계산한다.
// SKIP(null)이거나 미제출(entry 없음)이면 null — 개인 결과 이벤트를 만들지 않는다는 계약과
// 대응한다.
function computeGuardInvestigationResult(session, actorUuid) {
    const targetId = session.nightActions.get(actorUuid)
    if (targetId === undefined || targetId === null) return null
    const targetPlayer = session.players.get(targetId)
    return { targetId, team: ROLE_TEAMS[targetPlayer.role] }
}

// 해당 WITCH_HUNTER 본인의 non-null target에 대한 확인 결과({targetId, role})를 계산한다.
// computeGuardInvestigationResult와 동일하게 SKIP/미제출은 null이다.
function computeWitchHunterConfirmationResult(session, actorUuid) {
    const targetId = session.nightActions.get(actorUuid)
    if (targetId === undefined || targetId === null) return null
    const targetPlayer = session.players.get(targetId)
    return { targetId, role: targetPlayer.role }
}

// 자기 자신을 대상으로 지정할 수 있는 역할. DOCTOR(보호)만 허용한다 — GUARD/WITCH_HUNTER가
// 자기 자신을 지정하면 INVALID_TARGET으로 거부한다. JOKER의 자기 자신 대상은 team 검사에서
// 먼저 no-op으로 처리되므로 이 Set까지 도달하지 않는다(아래 submitNightAction 참고).
const SELF_TARGET_ALLOWED_ROLES = new Set(['DOCTOR'])

/**
 * NIGHT 밤 행동 제출을 처리합니다. 인증된 uuid와 gameId, targetId(참가자 uuid 또는 SKIP을
 * 뜻하는 null)만 입력으로 받습니다 — role/team 등 비밀 정보는 이 함수의 입력에도 출력에도
 * 없습니다. 반환값은 실패 시 { ok:false, code }, 성공 시 { ok:true, gameId: session.id }입니다.
 *
 * 반환하는 gameId는 client가 넘긴 원본 문자열이 아니라 registry에서 조회한 session.id
 * 그대로입니다 — 소켓 계층이 이 값을 callback 전달 실패 로그의 컨텍스트로만 쓰고, client에게
 * 보내는 ack에는 절대 포함하지 않습니다(client 원본은 검증을 통과했더라도 공백·개행을 포함한
 * 형태를 그대로 유지할 수 있어 로그에 쓰기에 안전하지 않습니다).
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 정규화(trim 후 빈 문자열 거부) → 2. uuid의 활성 세션 존재·gameId 일치
 *   → 3. registry 일관성(session 실존, uuid가 참가자) → 4. NIGHT phase
 *   → 5. 역할·dayIndex eligibility → 6. targetId가 있으면 참가자로 존재하는지
 *   → 7. actor가 JOKER이고 대상이 JOKER 진영(자기 자신 포함)이면 Map을 건드리지 않고 성공
 *      종료(no-op — 오라클 방지를 위해 거부하지 않고, 기존 유효 표를 파괴하지 않기 위해
 *      SKIP으로 덮어쓰지도 않는다)
 *   → 8. 그 외 역할이 자기 자신을 대상으로 했는데 허용되지 않으면 거부 → 9. Map에 저장.
 *
 * 모든 실패 경로와 7번(no-op)은 session.nightActions를 절대 건드리지 않습니다 — "성공 응답"과
 * "Map이 바뀜"은 동치가 아닙니다. game-core는 소켓 계층의 가드를 신뢰하지 않고 이 함수 안에서
 * 독립적으로 전부 재검증합니다(acknowledgeRoleReveal과 동일한 원칙).
 */
function submitNightAction(uuid, gameId, targetId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    // 판정 후에는 역할과 무관하게 전부 거부한다 — eligibility 검사보다 먼저 확인해야
    // CITIZEN 등 원래 NOT_ELIGIBLE이었을 참가자도 "판정 이후"라는 사실 자체는 알 수 있게
    // 응답이 구분된다(판정 여부는 비밀이 아니다).
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (!isEligibleForNightAction(actor.role, session.dayIndex)) {
        return { ok: false, code: 'NOT_ELIGIBLE' }
    }

    if (targetId !== null) {
        const targetPlayer = session.players.get(targetId)
        if (!targetPlayer) return { ok: false, code: 'INVALID_TARGET' }

        if (actor.role === 'JOKER' && ROLE_TEAMS[targetPlayer.role] === 'JOKER') {
            return { ok: true, gameId: session.id }
        }

        if (targetId === uuid && !SELF_TARGET_ALLOWED_ROLES.has(actor.role)) {
            return { ok: false, code: 'INVALID_TARGET' }
        }
    }

    session.nightActions.set(uuid, targetId)
    return { ok: true, gameId: session.id }
}

/**
 * NIGHT 행동 판정을 준비합니다(어떤 상태도 바꾸지 않는 순수 함수) — prepareJokerChatMessage와
 * 동일한 prepare 경계입니다. 인증된 uuid와 클라이언트가 알고 있는 gameId만 입력으로 받습니다.
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 정규화(trim 후 빈 문자열 거부) → 2. uuid의 활성 세션 존재·gameId 일치
 *   → 3. registry 일관성(session 실존, uuid가 참가자) → 4. NIGHT phase
 *   → 5. 아직 판정되지 않은 밤(session.nightResolution === null)
 *   → 6. 모든 eligible actor의 nightActions 제출 완료(ACTIONS_PENDING, 추가 정보 없음)
 *   → 7. 저장된 모든 non-null target이 여전히 canonical participant인지
 *      (TARGET_NOT_A_PARTICIPANT — internal-only, 소켓 계층이 INTERNAL_ERROR로 정규화).
 *
 * 성공 시 { ok:true, session, resolution } — resolution은 commitNightResolution에 그대로
 * 넘길 값입니다. privateResults는 GUARD/WITCH_HUNTER의 non-null 결과만 담는 Map이고
 * (SKIP/미제출은 entry 없음), JOKER/DOCTOR/CITIZEN은 애초에 이 Map에 등장하지 않습니다.
 */
function prepareNightResolution(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }

    for (const actorUuid of getEligibleNightActorUuids(session)) {
        if (!session.nightActions.has(actorUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
    }

    for (const target of session.nightActions.values()) {
        if (target !== null && !session.players.has(target)) {
            return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
        }
    }

    const assassinationTargetId = tallyJokerAssassinationTarget(session)
    const protectedTargetIds = computeDoctorProtectionSet(session)
    const pendingEliminationTargetId =
        assassinationTargetId !== null && !protectedTargetIds.has(assassinationTargetId)
            ? assassinationTargetId
            : null

    const privateResults = new Map()
    for (const player of session.players.values()) {
        if (player.role === 'GUARD') {
            const result = computeGuardInvestigationResult(session, player.uuid)
            if (result !== null) privateResults.set(player.uuid, { actionType: 'INVESTIGATE', ...result })
        } else if (player.role === 'WITCH_HUNTER' && isEligibleForNightAction('WITCH_HUNTER', session.dayIndex)) {
            const result = computeWitchHunterConfirmationResult(session, player.uuid)
            if (result !== null) privateResults.set(player.uuid, { actionType: 'CONFIRM', ...result })
        }
    }

    return {
        ok: true,
        session,
        resolution: {
            gameId: session.id,
            dayIndex: session.dayIndex,
            assassinationTargetId,
            protectedTargetIds,
            pendingEliminationTargetId,
            privateResults,
            resolved: true,
        },
    }
}

/** NIGHT 판정의 유일한 mutation — prepareNightResolution이 반환한 session/resolution으로 session.nightResolution을 확정합니다. */
function commitNightResolution(session, resolution) {
    session.nightResolution = resolution
}

/**
 * NIGHT 단계 JOKER 전용 채팅 메시지를 검증합니다(어떤 상태도 바꾸지 않는 순수 함수). 인증된
 * uuid와 클라이언트가 알고 있는 gameId, 원문 text만 입력으로 받습니다 — role/team/senderUuid
 * 등은 이 함수의 입력에 아예 없습니다(클라이언트가 그런 필드를 함께 보내도 무시됩니다).
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 정규화(trim 후 빈 문자열 거부) → 2. uuid의 활성 세션 존재·gameId 일치
 *   → 3. registry 일관성(session 실존, uuid가 참가자) → 4. NIGHT phase
 *   → 5. 발신자가 JOKER 진영인지(ROLE_TEAMS[actor.role] !== 'JOKER'면 NOT_ELIGIBLE —
 *   CITIZEN이 payload를 위조해도 여기서 막힙니다) → 6. sanitizeJokerChatText
 *   → 7. now()를 정확히 한 번 호출해 sentAt을 계산하고 유효성 검증(INVALID_CLOCK_VALUE)
 *   → 8. jokerChatRateLimit을 읽기만 해서 rate limit 판정(RATE_LIMITED).
 *
 * 이 함수는 session.jokerChatRateLimit을 포함해 어떤 Map도 쓰지 않습니다(읽기만 합니다) —
 * idFn도 호출하지 않습니다(호출자인 소켓 계층이 recipient 해석·발신자 포함 확인을 전부 통과한
 * 뒤에만 메시지 ID를 생성합니다).
 */
function prepareJokerChatMessage(uuid, gameId, text, { now = Date.now } = {}) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (ROLE_TEAMS[actor.role] !== 'JOKER') return { ok: false, code: 'NOT_ELIGIBLE' }

    const sanitized = sanitizeJokerChatText(text)
    if (!sanitized.ok) return sanitized

    const sentAt = now()
    if (!Number.isFinite(sentAt) || !Number.isInteger(sentAt) || sentAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }

    const lastSentAt = session.jokerChatRateLimit.get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < JOKER_CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'RATE_LIMITED' }
    }

    return { ok: true, session, actorUuid: uuid, sanitizedText: sanitized.text, sentAt }
}

/** JOKER 채팅의 유일한 mutation — prepareJokerChatMessage가 반환한 session/uuid/sentAt으로 rate limit을 갱신합니다. */
function commitJokerChatMessage(session, uuid, sentAt) {
    session.jokerChatRateLimit.set(uuid, sentAt)
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
    submitNightAction,
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareNightResolution,
    commitNightResolution,
    JOKER_CHAT_MAX_LENGTH,
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
        isEligibleForNightAction,
        sanitizeJokerChatText,
        getEligibleNightActorUuids,
        tallyJokerAssassinationTarget,
        computeDoctorProtectionSet,
        computeGuardInvestigationResult,
        computeWitchHunterConfirmationResult,
        __deleteGameSessionOnlyForTests,
    },
}
