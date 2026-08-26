const crypto = require('crypto')

// 역할 구성(AUTO/CUSTOM)의 canonical 정의·검증·해석은 전부 이 모듈이 소유한다.
// computeRoleComposition/getSpecialRoleBudget도 그곳으로 옮겨져 있다(아래 __testables에서
// 그대로 re-export하므로 기존 호출부·테스트의 import 경로는 바뀌지 않는다).
const {
    computeRoleComposition,
    getSpecialRoleBudget,
    resolveRoleComposition,
    validateResolvedComposition,
} = require('./roleComposition')

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

// 텍스트 규칙·rate limit 간격은 채널(공개 DAY·사망자 전용·JOKER 비밀)과 무관하게 하나의
// canonical 정의를 공유한다 — 채널마다 다른 길이/문자 규칙을 두면 한쪽만 고쳐졌을 때 조용히
// 어긋난다. JOKER_CHAT_MAX_LENGTH는 이 값의 기존 export 이름으로 그대로 유지된다.
const CHAT_MAX_LENGTH = 150
const CHAT_MIN_INTERVAL_MS = 500

// prepare~commit 사이에 정상적으로 흐를 수 있는 최대 시간. commit은 자신의 canonical 시계로
// 이 창 밖의 sentAt(미래 시각·너무 오래된 시각)을 거부한다 — 그래야 rate limit이 "호출자가
// 주장한 시각"이 아니라 실제 시간에 고정된다. 한 요청의 prepare~commit은 같은 tick 안에서
// 끝나므로(수 ms) 이 값은 시계 조정·GC 지연까지 흡수하고도 남는 여유값이다.
const CHAT_COMMIT_MAX_AGE_MS = 5000

// 금지 문자: LF(\n)만 제외한 C0 제어문자 전체(TAB 포함) · DEL · C1 제어문자(NEL 포함) ·
// Arabic Letter Mark · LRM/RLM · bidi embedding/override · bidi isolate. bidi/서식 문자는
// 채팅에서 텍스트 표시 순서를 조작하는 스푸핑 벡터라 명시적으로 차단한다. 이 문자열은 v3에서
// 스크립트로 생성·검증된 값을 그대로 재사용한다(손으로 다시 타이핑하지 않음).
const CHAT_FORBIDDEN_CHARS_PATTERN =
    /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

// 서버·프런트 동일 규칙(공유 모듈이 없는 저장소라 수동 동기화 —
// frontend/src/domains/game/ingame/utils/sanitizeJokerChatText.js). 순서: CRLF/CR 정규화 →
// 금지 문자 검사(정규화된 문자열 기준) → trim → 길이 검사(1~150). 세 채널이 이 함수 하나만 쓴다.
function sanitizeChatText(rawText) {
    // 문자열이 아닌 입력(채널·발신자를 위조해 끼워넣은 객체, null/undefined, 숫자 등)은 여기서
    // 곧바로 거부한다 — 소켓 계층이 payload.text의 타입을 이미 검사하지만, 이 함수를 쓰는
    // prepare 함수들은 game-core의 공개 API라 호출자를 신뢰하지 않고 스스로 fail-closed여야 한다.
    if (typeof rawText !== 'string') return { ok: false, code: 'INVALID_CHARACTERS' }
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (CHAT_FORBIDDEN_CHARS_PATTERN.test(normalized)) {
        return { ok: false, code: 'INVALID_CHARACTERS' }
    }
    const trimmed = normalized.trim()
    if (trimmed.length === 0) return { ok: false, code: 'EMPTY_MESSAGE' }
    if (trimmed.length > CHAT_MAX_LENGTH) return { ok: false, code: 'MESSAGE_TOO_LONG' }
    return { ok: true, text: trimmed }
}

/**
 * 서버가 canonical 상태(인증 uuid의 생존 여부 + session.phase)에서만 유도하는 채팅 채널이다.
 * 클라이언트는 이 값을 고르지도, 전달하지도 못한다 — 어떤 payload 필드도 채널 판정의 입력이
 * 아니다.
 */
const CHAT_CHANNELS = Object.freeze({ DAY: 'DAY', DEAD: 'DEAD', JOKER: 'JOKER' })

// 채널별 rate limit Map은 session 안에서 서로 다른 필드로 완전히 분리해 둔다 — 같은 uuid라도
// 한 채널의 전송이 다른 채널의 간격 판정에 영향을 주지 않는다(채널 격리). roleRevealAcks/
// nightActions와 동일한 이유로 session 객체 안에 두어 세션과 함께 사라지게 한다.
const CHAT_RATE_LIMIT_FIELD_BY_CHANNEL = Object.freeze({
    DAY: 'dayChatRateLimit',
    DEAD: 'deadChatRateLimit',
    JOKER: 'jokerChatRateLimit',
})

// 사망자 전용 채팅이 허용되는 phase. ROLE_REVEAL은 아직 아무도 죽을 수 없는 단계라 제외하고,
// ENDED는 이 집합에 닿기 전에 assertSessionNotEnded가 먼저 막는다.
const DEAD_CHAT_PHASES = new Set(['NIGHT', 'DAY', 'TRIBUNAL'])

/** 채널에 대응하는 session의 rate limit Map을 돌려준다(알 수 없는 채널이면 undefined). */
function getChatRateLimitMap(session, channel) {
    const field = CHAT_RATE_LIMIT_FIELD_BY_CHANNEL[channel]
    return field ? session[field] : undefined
}

/**
 * prepareGameChatMessage가 성공할 때 그 prepared 객체 하나에만 매다는 모듈 사설(private) 능력
 * 기록이다(prepared 객체 참조 → 발급 당시의 canonical 값 전부).
 *
 * canonical 재검증(세션 동일성·멤버십·phase/생존 라우팅·시각 범위)만으로는 "실제로 준비된 그
 * 요청인가"를 알 수 없다 — 검사를 모두 통과하도록 고른 값이라면 prepare를 아예 건너뛴 직접
 * commit이나 prepared 번들의 sentAt을 바꿔치기한 commit도 rate limit을 갱신할 수 있기 때문이다.
 * 이 WeakMap이 그 구멍을 막는다:
 *
 *   - 키는 prepare가 만든 그 객체 자체다. 손으로 만든 동일한 모양의 객체는 절대 키가 될 수
 *     없고(참조로만 조회된다), 이 모듈 밖에서는 기록을 만들 수도 읽을 수도 없다(export 없음).
 *   - commit이 rate limit을 갱신할 때 쓰는 값(sentAt·channel·uuid·session)은 호출자가 넘긴
 *     prepared의 노출 필드가 아니라 언제나 이 기록의 값이다. 노출 필드는 "주장"일 뿐이라
 *     기록과 대조해 하나라도 다르면 그 즉시 거부된다.
 *   - 성공한 commit은 기록을 지운다 — 같은 prepared로는 다시 커밋되지 않는다(단일 사용).
 *
 * WeakMap이라 prepared 객체가 버려지면 기록도 함께 사라진다(만료 정리 로직이 필요 없다).
 */
const preparedGameChatCapabilities = new WeakMap()

/** 메시지 ID는 prepare가 만든다 — commit이 대조할 능력 기록에 함께 묶여야 하기 때문이다. */
function createGameChatMessageId(idFn) {
    let rawMessageId
    try {
        rawMessageId = idFn()
    } catch (err) {
        return { ok: false, code: 'ID_GENERATION_ERROR' }
    }
    if (typeof rawMessageId !== 'string' || rawMessageId.trim().length === 0) {
        return { ok: false, code: 'INVALID_MESSAGE_ID' }
    }
    return { ok: true, messageId: rawMessageId.trim() }
}

/**
 * 호출자에게 노출된 prepared 번들이 발급 이후 한 글자도 바뀌지 않았는지 사설 기록과 대조한다.
 * commit의 mutation 자체는 기록 값만 쓰므로 이 검사가 없어도 위조된 값이 반영되지는 않지만,
 * 번들이 손대졌다는 것 자체가 신뢰 경계 침범 신호라 그 요청은 통째로 거부한다(fail-closed).
 */
function matchesPreparedGameChatCapability(prepared, capability) {
    if (
        prepared.ok !== true ||
        prepared.session !== capability.session ||
        prepared.channel !== capability.channel ||
        prepared.actorUuid !== capability.actorUuid ||
        prepared.nickname !== capability.nickname ||
        prepared.sanitizedText !== capability.text ||
        prepared.sentAt !== capability.sentAt ||
        prepared.dayIndex !== capability.dayIndex
    ) {
        return false
    }

    const message = prepared.message
    if (typeof message !== 'object' || message === null) return false
    const canonical = capability.message
    return (
        message.gameId === canonical.gameId &&
        message.messageId === canonical.messageId &&
        message.senderUuid === canonical.senderUuid &&
        message.nickname === canonical.nickname &&
        message.text === canonical.text &&
        message.sentAt === canonical.sentAt &&
        message.dayIndex === canonical.dayIndex
    )
}

/**
 * 인증된 참가자의 canonical 생존 상태와 session.phase만으로 "이 제출이 실제로 어느 채널인지"를
 * 결정한다(순수 함수 — 어떤 상태도 읽고 바꾸지 않는다).
 *   - 생존자: DAY에서만 공개 채팅. 그 외 phase는 INVALID_PHASE.
 *   - 사망자: NIGHT/DAY/TRIBUNAL에서만 사망자 전용 채팅. ROLE_REVEAL은 INVALID_PHASE이고
 *     ENDED는 호출 전에 이미 GAME_ALREADY_ENDED로 걸린다.
 * JOKER 비밀 채팅은 이 라우팅에 포함되지 않는다 — 전용 이벤트(prepareJokerChatMessage)가
 * NIGHT·JOKER 진영·생존을 각각 독립적으로 재검증한다.
 */
function resolveGameChatChannel(session, actor) {
    if (actor.alive === true) {
        if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
        return { ok: true, channel: CHAT_CHANNELS.DAY }
    }
    if (!DEAD_CHAT_PHASES.has(session.phase)) return { ok: false, code: 'INVALID_PHASE' }
    return { ok: true, channel: CHAT_CHANNELS.DEAD }
}

/**
 * 채널별 canonical 수신자 uuid 목록(순수 함수 — session.players를 읽기만 한다).
 *   - DAY: 생존자 전원(발신자 포함)
 *   - DEAD: 사망자 전원(발신자 포함)
 *   - JOKER: "생존한" JOKER 진영뿐(사망한 JOKER는 수신자에서 제외된다)
 * 알 수 없는 채널은 빈 배열이다 — 호출자(소켓 계층)의 "발신자가 수신자에 포함되는가" 검사가
 * 반드시 실패하므로 어떤 메시지도 전달되지 않는다(fail-closed).
 */
function getChatRecipientUuids(session, channel) {
    const uuids = []
    for (const player of session.players.values()) {
        if (channel === CHAT_CHANNELS.DAY) {
            if (player.alive === true) uuids.push(player.uuid)
        } else if (channel === CHAT_CHANNELS.DEAD) {
            if (player.alive !== true) uuids.push(player.uuid)
        } else if (channel === CHAT_CHANNELS.JOKER) {
            if (player.alive === true && ROLE_TEAMS[player.role] === 'JOKER') uuids.push(player.uuid)
        }
    }
    return uuids
}

/** gameId → { id, roomId, channelId, phase, dayIndex, jokerCount, players: Map<uuid,{uuid,nickname,role}> } */
const gameSessions = new Map()
/** uuid → gameId — 한 사용자가 속한 활성 GameSession 역매핑(중복 참여 방지에도 사용) */
const playerSession = new Map()
/** roomId → gameId — Room 하나당 활성 GameSession을 하나만 허용하기 위한 역매핑 */
const roomGameSession = new Map()

// 시민/JOKER 승리 조건을 판정한다(순수 함수 — session.players Map만 읽고 어떤 Map도 바꾸지
// 않는다). 시민 승리(생존 JOKER 0명)를 JOKER 승리(생존 JOKER ≥ 생존 비-JOKER)보다 먼저
// 평가한다. 승자가 없으면 null을 반환한다.
function evaluateWinCondition(session) {
    let aliveJokerCount = 0
    let aliveNonJokerCount = 0
    for (const player of session.players.values()) {
        if (!player.alive) continue
        if (player.role === 'JOKER') aliveJokerCount += 1
        else aliveNonJokerCount += 1
    }
    if (aliveJokerCount === 0) return { winner: 'CITIZEN' }
    if (aliveJokerCount >= aliveNonJokerCount) return { winner: 'JOKER' }
    return null
}

// 세션을 종료 상태로 확정하는 유일한 mutation이다. 신규 상태 객체를 만들지 않고 기존
// session.phase에 'ENDED'를 추가하는 방식을 그대로 따른다 — session.winResult는 이 호출
// 이후에만 존재하며, 그 존재 여부 자체가 "종료됨"을 뜻하는 신호다.
function finalizeGameSession(session, winResult) {
    session.phase = 'ENDED'
    session.winResult = winResult
}

// 8개 진입점(prepare 4 + commit 4)이 각자 최상단에서(기존 idempotency 단축 경로보다 먼저)
// 호출하는 공용 guard다. 이미 종료된 세션에 대한 모든 재요청은 예외 없이 이 코드로
// 실패한다 — 저장된 terminal을 포함한 성공 재ACK 경로는 없다.
function assertSessionNotEnded(session) {
    if (session.phase === 'ENDED') return { ok: false, code: 'GAME_ALREADY_ENDED' }
    return { ok: true }
}

/**
 * ENDED 세션의 전원 역할 공개 목록을 만든다(순수 함수 — session.players를 읽기만 하고 매
 * 호출마다 새 배열·새 원소를 만든다).
 *
 * 게임이 끝난 뒤의 payload에만 실리므로 비밀 누설이 아니다 — 종료 이후로는 어떤 mutation
 * 진입점도 열려 있지 않아(assertSessionNotEnded) 이 정보로 게임에 영향을 줄 수 없다. 순서는
 * session.players 삽입 순서 그대로이고, socket/repository/Map/Set 객체는 어떤 값에도 담지
 * 않는다.
 * @param {object} session - canonical GameSession(phase가 ENDED인 세션에서만 호출된다)
 * @flow session.players를 삽입 순서대로 순회하며 참가자마다 공개용 원소 하나를 만든다.
 */
function buildEndedRoleReveals(session) {
    return [...session.players.values()].map(({ uuid, nickname, role, alive }) => ({
        uuid,
        nickname,
        role,
        team: ROLE_TEAMS[role],
        alive,
    }))
}

/**
 * 종료 상태를 클라이언트에 알리기 위한 공개 화이트리스트만 골라낸다(순수 함수, throw 금지).
 * 원본 ballot/Map·Set/socket/repository 객체는 어디에도 포함하지 않는다. winResult는 세션에
 * 실제로 존재할 때만(확정된 승자가 있을 때만) 포함한다.
 *
 * role/team은 phase가 ENDED일 때의 winResult.reveals에서만 의도적으로 전원 공개된다 — 그
 * 밖의 어떤 위치에도 role은 없다(players는 여전히 {uuid,isAlive}만 담는다).
 * @param {object} session - canonical GameSession
 * @flow winResult가 있을 때만 얕은 복사본을 붙이고, 그 복사본에 한해 phase가 실제로 ENDED일
 *   때만 reveals/mvp를 얹는다 — winResult를 세팅하는 유일한 writer(finalizeGameSession)가
 *   phase도 함께 ENDED로 바꾸므로 정상 경로에서 둘은 항상 같이 성립하지만, 이 빌더는 호출자를
 *   신뢰하지 않는다는 이 파일의 원칙에 따라 phase를 독립적으로 재확인한다. 얕은 복사본에만
 *   붙으므로 canonical session.winResult는 계속 {winner} 단일 키로 남는다.
 */
function buildTerminalFields(session) {
    const fields = {
        phase: session.phase,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, isAlive: alive })),
    }
    if (session.winResult) {
        fields.winResult = { ...session.winResult }
        if (session.phase === 'ENDED') {
            fields.winResult.reveals = buildEndedRoleReveals(session)
            fields.winResult.mvp = null // MVP 기획 미확정 — 슬롯만 예약한다
        }
    }
    return fields
}

/**
 * 순수 조회 — 재접속 시 소켓 계층이 라우팅을 재동기화하는 데 필요한 정보(gameId·channelId)와
 * 그 세션의 현재 phase만 반환한다. phase는 소켓 계층이 "기존 channel에 재부착할지, 이미
 * ENDED인 세션의 잔존 참가자를 정리할지"를 고르는 데만 쓰는 값이다 — role/team/ballot 등
 * 비밀 정보는 여전히 아무것도 싣지 않고, 이 호출로 어떤 권한도 부여되지 않는다(순수
 * registry 조회일 뿐이다). 실제 mutation·disconnect 권한 판정은 소켓 계층의
 * isCurrentSocketForUuid만 담당한다. uuid가 활성 GameSession에 속해있지 않으면 null이다.
 * @param {string} uuid - 인증된 참가자 uuid
 * @flow playerSession에 uuid가 없거나 그 gameId의 세션이 registry에 없으면(불일치) null을
 *   반환하고, 그 외에는 라우팅 정보와 phase를 함께 반환한다 — 즉 non-null 반환은 세션 객체가
 *   실제로 존재함을 보장한다.
 */
function getActiveSessionRoutingInfo(uuid) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    return { gameId: session.id, channelId: session.channelId, phase: session.phase }
}

// 순수 계산 — 어떤 Map도 읽지 않는다. randomFn을 주입하면 완전히 결정적이다.
function fisherYatesShuffle(items, randomFn) {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

/**
 * 셔플된 순서에 canonical 구성을 그대로 배정합니다(중복 배정 없음 — 역할 배열의 길이가
 * 정확히 players.length라 index가 일대일로 대응한다).
 *
 * 두 번째 인자는 숫자(jokerCount) 또는 이미 해석된 구성 객체 둘 다 받는다. 숫자를 주면
 * 기존 AUTO 동작 그대로 computeRoleComposition으로 구성을 만든다 — CUSTOM 모드가 생기면서
 * "구성을 미리 해석해 두고 그대로 배정"하는 경로가 필요해졌지만, 기존 AUTO 호출부(및 그
 * 호출 계약에 기대는 테스트)를 그대로 두기 위해 두 형태를 모두 지원한다.
 */
function assignRoles(players, jokerCountOrComposition, randomFn = Math.random) {
    const shuffled = fisherYatesShuffle(players, randomFn)
    const composition =
        typeof jokerCountOrComposition === 'number'
            ? computeRoleComposition(players.length, jokerCountOrComposition)
            : jokerCountOrComposition
    const roles = [
        ...Array(composition.JOKER).fill(GAME_ROLES.JOKER),
        ...Array(composition.DOCTOR).fill(GAME_ROLES.DOCTOR),
        ...Array(composition.GUARD).fill(GAME_ROLES.GUARD),
        ...Array(composition.WITCH_HUNTER).fill(GAME_ROLES.WITCH_HUNTER),
        ...Array(composition.CITIZEN).fill(GAME_ROLES.CITIZEN),
    ]
    return shuffled.map((player, index) => ({ ...player, role: roles[index], alive: true }))
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

    // 방 생성 시점 검증은 maxPlayers 기준이므로, 시작 시점의 "실제 참가자 수"로 구성을 다시
    // 해석·검증한다. CUSTOM에서 고정 역할 합이 실제 인원을 넘거나 JOKER가 실제 인원 이상이면
    // 여기서 거부되고, 아무 registry도 건드리지 않은 상태 그대로 반환된다.
    const resolved = resolveRoleComposition(room.settings, players.length)
    if (!resolved.ok) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: `INVALID_ROLE_COMPOSITION:${resolved.reason}` }
    }

    const assigned = assignRoles(players, resolved.composition, randomFn)
    const session = {
        id: gameIdFn(),
        roomId: room.id,
        channelId: room.id, // 기존 Socket.IO room(roomId)을 그대로 승계
        phase: INITIAL_GAME_PHASE,
        dayIndex: INITIAL_DAY_INDEX,
        // commit 경계(assertValidSessionForCommit)에서 실제 역할 분포와 대조하기 위해
        // jokerCount를 session에 함께 보관한다. resolvedComposition.JOKER를 원천으로 삼아
        // 두 값이 갈릴 여지를 없앤다(AUTO에서는 room.settings.jokerCount와 같은 값이다).
        jokerCount: resolved.composition.JOKER,
        // 이 세션에 실제로 배정된 canonical 5역할 구성(내부 전용 방어적 복사본). CUSTOM은
        // computeRoleComposition으로 재계산할 수 없으므로 commit 경계가 대조할 기준을
        // 세션이 직접 들고 있어야 한다. 어떤 공개 payload에도 포함하지 않는다.
        roleComposition: { ...resolved.composition },
        // validateSessionInput이 uuid 중복을 이미 걸러냈으므로 이 Map 생성이 조용히
        // 참가자를 덮어쓸 수 없다.
        players: new Map(assigned.map((p) => [p.uuid, p])),
        // ROLE_REVEAL 확인을 추적한다. 세션 객체 안에 두어 endGameSessionForPlayer로
        // 세션이 삭제될 때 별도 정리 없이 함께 사라지게 한다.
        roleRevealAcks: new Set(),
        // NIGHT pending action을 추적한다. uuid → targetId(참가자 uuid) | null(SKIP).
        // roleRevealAcks와 동일한 이유로 세션 객체 안에 둔다.
        nightActions: new Map(),
        // 채널별 채팅 스팸 방지용 "마지막 전송 시각"(uuid → epoch ms). 채팅 자체는 영구
        // 저장하지 않으므로 이 세 Map은 rate limit 판정에만 쓰인다. 채널마다 별도 Map이라
        // 한 채널의 전송이 다른 채널을 막지 않는다(CHAT_RATE_LIMIT_FIELD_BY_CHANNEL 참고).
        // roleRevealAcks/nightActions와 동일한 이유로 세션 객체 안에 둔다.
        jokerChatRateLimit: new Map(),
        dayChatRateLimit: new Map(),
        deadChatRateLimit: new Map(),
        // 이번 밤의 판정 결과(prepareNightResolution → commitNightResolution이 채운다). 커밋
        // 시점엔 항상 null이어야 하고(assertValidSessionForCommit), 판정 이후에는 다시 null로
        // 돌아가지 않는 immutable 값이 된다(재판정 금지 계약).
        nightResolution: null,
        // DAY 투표/기권 제출을 추적한다. uuid → targetId(참가자 uuid) | null(기권). 커밋
        // 시점엔 항상 빈 Map이어야 하고(assertValidSessionForCommit), NIGHT→DAY 전이마다
        // commitNightResolution이 새 빈 Map으로 교체한다(이전 DAY의 투표를 이어받지 않음).
        // roleRevealAcks/nightActions와 동일한 이유로 세션 객체 안에 둔다.
        dayVotes: new Map(),
        // 이 dayIndex의 DAY 투표 판정 완료 표식이자 결과. null이면 아직 판정 전이다. 값이
        // 있으면 { dayIndex, outcome, tribunalTargetUuid, publicVoteCount, publicAbstainCount }
        // 형태이고, 그 dayIndex에 대한 재판정·재제출을 막는 유일한 근거가 된다(commitNightResolution이
        // dayVotes를 새 빈 Map으로 교체할 때도 이 필드는 그대로 둔다 — 이전 낮의 판정 기록이므로).
        dayVoteResolution: null,
        // TRIBUNAL 단계의 피고 정보. commitDayVoteResolution이 outcome:'TRIBUNAL'일 때만 채운다.
        tribunal: null,
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
    // 채널별 rate limit Map 3개도 roleRevealAcks/nightActions와 동일한 이유로 커밋 시점엔
    // 항상 빈 Map이어야 한다. 필드명을 손으로 나열하지 않고 채널→필드 매핑을 그대로 순회해
    // 새 채널이 추가돼도 이 경계 검사가 자동으로 함께 따라오게 한다.
    for (const field of Object.values(CHAT_RATE_LIMIT_FIELD_BY_CHANNEL)) {
        if (!(session[field] instanceof Map)) {
            throw new Error(`commitGameSession: session.${field}이 Map이 아님`)
        }
        if (session[field].size !== 0) {
            throw new Error(`commitGameSession: session.${field}이 비어있지 않음(size=${session[field].size})`)
        }
    }
    // nightResolution도 roleRevealAcks/nightActions/jokerChatRateLimit과 동일한 이유로
    // 커밋 시점엔 항상 null이어야 한다(아직 판정된 적 없는 새 세션).
    if (session.nightResolution !== null) {
        throw new Error('commitGameSession: session.nightResolution이 null이 아님')
    }
    // dayVotes도 roleRevealAcks/nightActions/jokerChatRateLimit과 동일한 이유로 커밋
    // 시점엔 항상 빈 Map이어야 한다.
    if (!(session.dayVotes instanceof Map)) {
        throw new Error('commitGameSession: session.dayVotes가 Map이 아님')
    }
    if (session.dayVotes.size !== 0) {
        throw new Error(`commitGameSession: session.dayVotes가 비어있지 않음(size=${session.dayVotes.size})`)
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
        if (player.alive !== true) {
            throw new Error('commitGameSession: 잘못된 player.alive(신규 세션은 전원 생존 상태여야 함)')
        }
        actualCounts[player.role] += 1
    }
    // 5개 역할 전체 분포를 기대 구성과 대조한다.
    // - CUSTOM 세션은 computeRoleComposition으로 재계산할 수 없으므로(방장이 직접 지정한
    //   구성이라 인원수만으로 유도되지 않는다) session.roleComposition을 기준으로 삼되,
    //   그 값 자체도 "저장된 값을 신뢰하지 않는다"는 원칙대로 인원수·jokerCount와 다시
    //   대조한 뒤에만 사용한다(합계 = 인원수, JOKER = session.jokerCount).
    // - roleComposition이 없는 세션(구버전·수동 조립)은 기존 AUTO 계약 그대로
    //   computeRoleComposition으로 재계산해 대조한다.
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
    // 어긋난 역할을 하나만 보고하면 "DOCTOR를 CITIZEN으로 바꿔치기" 같은 교체형 조작에서
    // GAME_ROLES 키 순서상 앞선 역할(CITIZEN)만 이름이 나오고, 정작 조작된 역할(DOCTOR)은
    // 메시지에서 사라진다. 어긋난 역할을 전부 적어 키 순서와 무관하게 같은 사실을 가리키게 한다.
    const mismatchedRoles = Object.keys(GAME_ROLES).filter((role) => actualCounts[role] !== expected[role])
    if (mismatchedRoles.length > 0) {
        const detail = mismatchedRoles
            .map((role) => `실제 ${role} 수(${actualCounts[role]})가 기대값(${expected[role]})과 불일치`)
            .join(', ')
        throw new Error(`commitGameSession: ${detail}`)
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

// 특정 참가자 시점의 role/team/ally 식별 정보(순수 함수). buildGameStartedPayload의 self와
// buildSessionSnapshot의 self가 공유하는 유일한 원천이다 — viewer가 없으면(참가자가 아니면)
// null을 반환한다. allies는 viewer가 JOKER일 때만 own-property로 존재한다 — 다른 JOKER의
// uuid만 담고 role 등 다른 정보는 포함하지 않는다(JOKER끼리만 서로 동료임을 아는 정책의
// 서버 측 계약).
function buildViewerRoleFields(session, viewer) {
    if (!viewer) return null
    return {
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
}

/**
 * DAY 단계 진입의 유일한 canonical mutation이다 — phase·dayIndex·그 DAY의 투표 상태를 한
 * 곳에서 함께 초기화한다. DAY로 들어오는 두 진입점(최초 ROLE_REVEAL→DAY 전이와 매
 * NIGHT→DAY 전이)이 이 함수 하나만 호출하므로, 어느 한쪽만 부분 초기화된 DAY가 구조적으로
 * 생길 수 없다(호출부에서 phase/dayIndex/dayVotes를 손으로 다시 나열하지 않는다).
 *
 * dayIndex는 언제나 정확히 1 증가한다 — 신규 세션의 INITIAL_DAY_INDEX(0)에서 첫 DAY는 1이
 * 되고, 이후 밤을 넘길 때마다 하나씩 늘어난다.
 *
 * dayVotes는 매번 새 빈 Map으로 교체한다 — 이전 DAY의 투표/기권을 이어받지 않는다.
 * dayVoteResolution/tribunal은 여기서 건드리지 않는다: 둘 다 "그 dayIndex의 기록"이고,
 * 이 함수가 dayIndex를 전진시키는 순간 dayIndex 일치 검사(prepareDayVoteResolution의
 * alreadyResolved 판정, buildSessionSnapshot의 노출 게이트)에서 자동으로 무효가 된다.
 * 최초 전이 시점에는 애초에 둘 다 null이다(buildSessionCandidate).
 *
 * 호출자는 이 함수를 부르기 전에 승리 조건 판정을 끝내야 한다 — 승자가 확정된 밤은 DAY로
 * 넘어가지 않고 그대로 ENDED가 된다(commitNightResolution 참고).
 */
function enterDayPhase(session) {
    session.phase = 'DAY'
    session.dayIndex += 1
    session.dayVotes = new Map()
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
            self: buildViewerRoleFields(session, viewer),
        },
    }
}

/**
 * ROLE_REVEAL 단계의 역할 확인을 처리합니다. 인증된 uuid와 클라이언트가 알고 있는 gameId만
 * 입력으로 받습니다(role 등 비밀 정보는 이 함수의 입력에도 출력에도 없습니다).
 *
 * 참가자 전원이 확인을 마치기 전까지 세션은 ROLE_REVEAL에 그대로 머무릅니다. 마지막으로 남은
 * 필수 확인 하나가 도착하면 enterDayPhase로 첫 DAY(dayIndex 1)에 진입합니다 — 밤이 아니라
 * 낮이 게임의 첫 진행 단계입니다. 이 전이는 세션당 정확히 한 번만 일어나며(그 뒤의 모든
 * 확인은 phase 가드에 걸려 INVALID_PHASE), DAY 상태 초기화는 NIGHT→DAY 전이와 똑같이
 * enterDayPhase 한 곳에서만 이뤄집니다.
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
    // 마지막으로 남아있던 참가자의 유효한 확인 하나만이 전이를 일으킨다. 이 시점 이후로는
    // phase가 더 이상 ROLE_REVEAL이 아니므로 위쪽 phase 가드가 모든 후속 확인(중복·재요청·
    // 늦게 도착한 동시 요청)을 INVALID_PHASE로 되돌린다 — transitioned:true는 세션당 정확히
    // 한 번만 나올 수 있고, DAY 상태가 다시 초기화되거나 dayIndex가 또 오르는 경로는 없다.
    if (session.roleRevealAcks.size === session.players.size) {
        enterDayPhase(session)
        return { ok: true, transitioned: true, session }
    }
    return { ok: true, transitioned: false, session }
}

/** ROLE_REVEAL→DAY 전이를 참가자 전체에게 알리는 공용 payload. 참가자 식별·비밀 정보를 전혀 포함하지 않는다. */
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

// 순차 NIGHT 역할 진행의 canonical 순서. CITIZEN은 밤 행동이 없어 이 순서에 포함되지 않는다.
const NIGHT_TURN_ROLE_ORDER = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

// 특정 역할이 "이번 밤 실제로 제출해야 하는" 생존 참가자 uuid 목록(순수 계산). 그 밤에 행동
// 자체가 불가능한 역할(day0 WITCH_HUNTER 등)은 항상 빈 배열이다 — computeCurrentNightTurnRole이
// zero-actor와 동일하게 건너뛴다.
function getLivingNightTurnActorUuids(session, role) {
    if (!isEligibleForNightAction(role, session.dayIndex)) return []
    const uuids = []
    for (const player of session.players.values()) {
        if (player.role === role && player.alive) uuids.push(player.uuid)
    }
    return uuids
}

/**
 * 지금 canonical하게 어느 역할의 NIGHT 턴인지를 session.nightActions·session.players에서만 매번
 * 다시 계산한다(순수 함수 — 저장된 커서·별도 필드가 전혀 없다. 그래서 이 값이 실제 제출 상태와
 * 어긋난 채로 남을 수 없다). JOKER → DOCTOR → GUARD → WITCH_HUNTER 순서로 살피며, 생존 eligible
 * 배우가 하나도 없는 역할은 건너뛰고(zero-actor auto-skip), 생존 eligible 배우 전원이 이미
 * 제출(SKIP 포함)한 역할도 건너뛴다. 넘길 역할이 하나도 남지 않으면(전부 건너뛰었거나 완료됨)
 * null — "이 밤의 판정 준비가 끝났다"는 뜻이다.
 */
function computeCurrentNightTurnRole(session) {
    for (const role of NIGHT_TURN_ROLE_ORDER) {
        const actorUuids = getLivingNightTurnActorUuids(session, role)
        if (actorUuids.length === 0) continue
        if (actorUuids.every((actorUuid) => session.nightActions.has(actorUuid))) continue
        return role
    }
    return null
}

/**
 * NIGHT 순차 진행의 production 전용 게이트입니다(어떤 상태도 바꾸지 않는 순수 함수). 소켓
 * 계층이 submitNightAction을 호출하기 전에 통과해야 하는 사전 검사이며, submitNightAction
 * 자신이 이미 독립적으로 재검증하는 phase·판정 완료·eligibility·target은 여기서 다시 검사하지
 * 않습니다(단일 출처 유지 — 그 조건이 맞지 않는 요청은 이 게이트를 그대로 통과시키고
 * submitNightAction이 그 조건에 맞는 기존 코드로 거부하게 둡니다).
 *
 * 이 게이트만 추가로 막는 두 조건(생존·현재 턴)은 이번 순차 NIGHT 진행 계약에서만 의미가
 * 있습니다 — submitNightAction을 직접 호출하는 기존 호출부·테스트는 이 게이트를 거치지 않으므로
 * 전혀 영향을 받지 않습니다.
 *
 * 성공 시 { ok:true, session, actorRole }을 반환합니다 — actorRole은 호출 시점의 actor.role이며,
 * 호출자가 제출 이후 computeCurrentNightTurnRole(session)과 비교해 턴이 실제로 넘어갔는지
 * 판별하는 유일한 근거입니다.
 */
function checkNightTurnGate(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (
        session.phase === 'NIGHT' &&
        session.nightResolution === null &&
        isEligibleForNightAction(actor.role, session.dayIndex)
    ) {
        if (actor.alive !== true) return { ok: false, code: 'ACTOR_NOT_ALIVE' }
        if (actor.role !== computeCurrentNightTurnRole(session)) return { ok: false, code: 'NIGHT_TURN_ROLE_MISMATCH' }
    }

    return { ok: true, session, actorRole: actor.role }
}

/**
 * NIGHT 순차 진행 공개 턴 payload. 비밀(참가자 uuid 목록·target map·역할 목록·개인 결과)은
 * 전혀 포함하지 않습니다 — 지금 어느 역할 턴인지(nightTurnRole, null이면 이 밤의 판정 준비
 * 완료)만 담습니다.
 */
function buildNightTurnChangedPayload(session) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        nightTurnRole: computeCurrentNightTurnRole(session),
    }
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

    const endedCheck1 = assertSessionNotEnded(session)
    if (!endedCheck1.ok) return endedCheck1

    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }

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

// 밤 사망을 "누가 죽였는지"가 아니라 "어떤 공개 사건이었는지"로만 표현하는 공개 열거값이다.
// 이 세 값 외에는 어떤 출처도 존재하지 않고, killer uuid·nickname·역할 보유자 식별 정보는
// 어떤 값에도 담기지 않는다(UNKNOWN_NIGHT는 "밤사이 사망"이라는 사실만 뜻한다).
const PUBLIC_NIGHT_DEATH_SOURCES = Object.freeze({
    JOKER: 'JOKER',
    WITCH_HUNTER: 'WITCH_HUNTER',
    UNKNOWN_NIGHT: 'UNKNOWN_NIGHT',
})

/**
 * 한 희생자의 공개 사망 출처를 판정한다(순수 계산). resolution이 그 희생자를 정확히 하나의
 * 효과에만 귀속시킬 때에만 그 효과 이름을 돌려주고, 귀속이 없거나 둘 이상이면(모호) 항상
 * UNKNOWN_NIGHT다 — "모르는 것을 지어내지 않는다"가 이 함수의 유일한 규칙이다.
 *
 * witchHunterExecutionTargetId는 현재 production resolver(prepareNightResolution)가 만들지
 * 않는 선택적 귀속 필드다. 오늘의 WITCH_HUNTER는 확인(CONFIRM)만 할 뿐 사망을 만들지 않으므로
 * 이 분기는 실제 게임에서 도달하지 않는다 — 어떤 판정이 처형을 명시적·비모호적으로 귀속시킬
 * 때에만 WITCH_HUNTER가 공개된다는 계약을 코드로 고정해 둔 것이다.
 */
function resolveNightDeathSource(resolution, victimUuid) {
    const attributions = []
    if (resolution?.assassinationTargetId === victimUuid) attributions.push(PUBLIC_NIGHT_DEATH_SOURCES.JOKER)
    if (resolution?.witchHunterExecutionTargetId === victimUuid) {
        attributions.push(PUBLIC_NIGHT_DEATH_SOURCES.WITCH_HUNTER)
    }
    return attributions.length === 1 ? attributions[0] : PUBLIC_NIGHT_DEATH_SOURCES.UNKNOWN_NIGHT
}

/**
 * 이번 밤에 실제로 죽은 참가자 목록(victimUuids, canonical 적용 순서)을 공개 안전한 reveal
 * 목록으로 바꾼다(순수 계산). 원소는 정확히 { victimUuid, source } 두 키뿐이고, 같은 victim은
 * 처음 등장한 위치 하나로 합쳐진다(중복 제거). 호출자는 "alive → dead로 실제 바뀐" 참가자만
 * 넘겨야 한다 — 이 함수는 생존 여부를 다시 판단하지 않는다(commitNightResolution이 이미
 * victim 존재·생존을 mutation 전에 검증한 뒤에만 호출한다).
 *
 * 매 호출마다 새 배열·새 원소 객체를 만들어 돌려주므로 반환값을 변형해도 resolution이나 다음
 * 호출 결과에 영향이 없다.
 */
function buildNightDeathReveals(resolution, victimUuids) {
    const reveals = []
    const seen = new Set()
    for (const victimUuid of victimUuids) {
        if (typeof victimUuid !== 'string' || victimUuid.length === 0) continue
        if (seen.has(victimUuid)) continue
        seen.add(victimUuid)
        reveals.push({ victimUuid, source: resolveNightDeathSource(resolution, victimUuid) })
    }
    return reveals
}

/**
 * NIGHT 판정 커밋과 사망/phase/day 전이를 모두 담당하는 유일한 mutation입니다.
 * prepareNightResolution이 반환한 resolution.pendingEliminationTargetId만 소비하고, 클라이언트
 * 입력이나 raw nightActions를 다시 읽지 않습니다.
 *
 * 검증(victim 존재·alive)은 mutation 이전에 전부 끝내고, 통과한 뒤로는 이 함수가 절대
 * throw하지 않습니다 — "커밋은 됐는데 사망/phase/day 적용은 안 된" 부분 커밋 상태가
 * 구조적으로 존재할 수 없습니다. 검증 실패 시 session은 nightResolution을 포함해 어떤
 * 필드도 바뀌지 않습니다.
 *
 * 반환값 { victimUuid }는 buildNightResultAppliedPayload에 그대로 넘길 값입니다.
 */
function commitNightResolution(session, resolution) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const victimUuid = resolution.pendingEliminationTargetId
    let victim = null
    if (victimUuid !== null) {
        victim = session.players.get(victimUuid)
        // 방어적 불변조건: prepareNightResolution이 이미 nightActions의 모든 non-null target을
        // TARGET_NOT_A_PARTICIPANT로 검증했고, 이번 슬라이스 범위(첫 밤, 재판정 없음)에선 모든
        // 참가자가 아직 alive:true이므로 이 두 throw는 정상 경로에서 도달 불가능하다 —
        // assertValidSessionForCommit과 동일하게 수동 조립/오염 상태까지 방어한다. 이 시점까지는
        // session에 어떤 mutation도 일어나지 않았으므로, 여기서 throw하면 nightResolution을
        // 포함해 아무 상태도 바뀌지 않는다.
        if (!victim) throw new Error(`commitNightResolution: victim(${victimUuid})이 참가자가 아님`)
        if (victim.alive !== true) throw new Error(`commitNightResolution: victim(${victimUuid})이 이미 사망 상태`)
    }
    // 이 지점 이후로는 절대 throw하지 않는다.
    // 공개 사망 reveal은 반드시 이 지점에서 만든다 — 위 두 검증을 통과했다는 것은 victim이
    // 참가자로 실재하고 아직 alive:true였다는 뜻이므로, 여기서 만들어진 reveal은 정의상
    // "이번 판정이 실제로 alive→dead로 바꾼 참가자"만 담는다. victim이 없는 밤(무득표·보호
    // 성공·SKIP)은 빈 배열이고, 재판정 시도는 애초에 이 함수에 도달하지 못한다
    // (prepareNightResolution의 NIGHT_ALREADY_RESOLVED / assertSessionNotEnded).
    resolution.publicDeathReveals = buildNightDeathReveals(resolution, victimUuid === null ? [] : [victimUuid])
    session.nightResolution = resolution
    if (victim) victim.alive = false

    const winResult = evaluateWinCondition(session)
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, victimUuid, terminal: { winner: winResult.winner } }
    }

    // DAY 진입은 최초 ROLE_REVEAL→DAY 전이와 같은 canonical 헬퍼 하나로만 한다 —
    // phase/dayIndex/dayVotes를 여기서 손으로 다시 나열하면 두 경로가 조용히 어긋날 수 있다.
    enterDayPhase(session)
    return { ok: true, victimUuid, terminal: null }
}

/**
 * NIGHT 결과 적용(사망 + DAY 전이) 공개 payload. commitNightResolution 호출 이후(phase/
 * dayIndex가 이미 갱신된) session을 받습니다. role/team/nickname/targetUuid/private result는
 * 어디에도 포함하지 않습니다.
 *
 * deathReveals는 commitNightResolution이 채운 resolution.publicDeathReveals를 그대로 넘기는
 * 추가 필드입니다(기존 필드는 하나도 바뀌지 않는 순수 추가). 원소는 정확히
 * { victimUuid, source } 두 키뿐이고, 매 호출마다 새 배열·새 원소로 복사해 담으므로 수신자가
 * 반환값을 변형해도 canonical resolution은 오염되지 않습니다.
 */
function buildNightResultAppliedPayload(session, victimUuid, deathReveals = []) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
        deathReveals: (Array.isArray(deathReveals) ? deathReveals : []).map(({ victimUuid: v, source }) => ({
            victimUuid: v,
            source,
        })),
    }
}

/**
 * DAY 투표/기권 제출을 처리합니다. 인증된 uuid와 클라이언트가 알고 있는 gameId,
 * targetId(참가자 uuid 또는 명시적 기권을 뜻하는 null)만 입력으로 받습니다. 반환값은
 * 실패 시 { ok:false, code }, 성공 시 { ok:true }입니다.
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 형태 → 2. targetId 형태 → 3. uuid의 활성 세션 존재·gameId 일치
 *   → 4. registry 일관성(session 실존, uuid가 참가자) → 5. DAY phase → 6. actor 생존
 *   → 7. targetId가 문자열이면 참가자로 존재하는지 → 8. 대상 생존 → 9. 자기 자신 대상 거부
 *   → 10. session.dayVotes에 저장.
 *
 * 모든 실패 경로는 session.dayVotes를 절대 건드리지 않습니다 — submitNightAction과 동일한
 * 원칙(game-core는 소켓 계층의 가드를 신뢰하지 않고 이 함수 안에서 독립적으로 전부
 * 재검증합니다). 재제출은 기존 값을 최신 값으로 덮어씁니다.
 */
function submitDayVote(uuid, gameId, targetId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return { ok: false, code: 'INVALID_GAME_ID' }
    if (targetId !== null && (typeof targetId !== 'string' || targetId.length === 0)) {
        return { ok: false, code: 'INVALID_TARGET' }
    }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== gameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    // 이 dayIndex가 이미 판정됐으면 outcome과 무관하게 거부한다 — mutation(dayVotes.set) 전에
    // 확인해 재제출이 이미 판정된 집계를 조용히 어긋나게 만들지 못하게 한다. phase 검사보다
    // 먼저 확인해야 한다: 판정이 성공하면 phase가 DAY를 벗어나므로 INVALID_PHASE로도 결과적으로
    // 막히지만, "이미 판정됨"이라는 사실 자체를 별도 코드로 구분해 응답한다.
    if (session.dayVoteResolution !== null && session.dayVoteResolution.dayIndex === session.dayIndex) {
        return { ok: false, code: 'DAY_VOTE_ALREADY_RESOLVED' }
    }
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    if (targetId !== null) {
        const target = session.players.get(targetId)
        if (!target) return { ok: false, code: 'INVALID_TARGET' }
        if (!target.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        if (targetId === uuid) return { ok: false, code: 'SELF_TARGET_NOT_ALLOWED' }
    }

    session.dayVotes.set(uuid, targetId)
    return { ok: true }
}

// registry(session.players)를 읽기만 하는 순수 계산 — 이 낮에 투표 가능한(생존) 모든 참가자
// uuid를 반환한다. submitDayVote가 이미 사망자의 투표를 막으므로, 생존자 전원이 곧 "투표해야
// 할" 대상이다.
function getEligibleDayVoterUuids(session) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive) uuids.push(player.uuid)
    }
    return uuids
}

// session.dayVotes를 집계해 TRIBUNAL/TIE/ABSTAINED 중 하나를 판정한다(순수 계산 — 어떤 상태도
// 바꾸지 않는다). tallyJokerAssassinationTarget과 동일한 tie-break 원칙(득표수만으로 비교하고,
// Map 순회 순서에 의존하지 않는다)을 따른다. 기권(null)은 별도로 세되 집계 대상에서 제외한다.
// 유효 표가 하나도 없으면(전원 기권) ABSTAINED, 최다 득표가 둘 이상이면 TIE, 그 외엔 단독
// 최다 득표자를 TRIBUNAL 대상으로 반환한다.
//
// 집계는 session.dayVotes 전체가 아니라 getEligibleDayVoterUuids(session)로 확정한 eligible
// alive voter 목록만 순회한다 — 사망 후 남은 entry나 non-eligible entry가 결과를 바꾸지 못하게
// 하기 위함이다. publicVoteCount는 이 eligible voter 총수이고(제출 완료 인원 전체 — 기권 포함),
// publicAbstainCount는 그중 null 제출 수다.
function tallyDayVoteOutcome(session) {
    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    const voteCounts = new Map()
    let abstainCount = 0
    for (const voterUuid of eligibleVoterUuids) {
        const targetId = session.dayVotes.get(voterUuid)
        if (targetId === null || targetId === undefined) {
            abstainCount += 1
            continue
        }
        voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1)
    }
    const publicVoteCount = eligibleVoterUuids.length
    const publicAbstainCount = abstainCount

    if (voteCounts.size === 0) {
        return { outcome: 'ABSTAINED', tribunalTargetUuid: null, publicVoteCount, publicAbstainCount }
    }

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

    if (tie) {
        return { outcome: 'TIE', tribunalTargetUuid: null, publicVoteCount, publicAbstainCount }
    }
    return { outcome: 'TRIBUNAL', tribunalTargetUuid: winner, publicVoteCount, publicAbstainCount }
}

/**
 * DAY 투표 판정을 준비합니다(어떤 상태도 바꾸지 않는 순수 함수) — prepareNightResolution과
 * 동일한 prepare 경계입니다. 인증된 uuid와 클라이언트가 알고 있는 gameId·dayIndex만 입력으로
 * 받습니다.
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId/dayIndex 형태 → 2. uuid의 활성 세션 존재·gameId 일치 → 3. registry 일관성
 *   (session 실존, uuid가 참가자) → 4. dayIndex가 session.dayIndex와 정확히 일치
 *   → 5. 이 dayIndex가 이미 판정됐는지(완료 표식 — phase와 무관하게 이미 있으면 그 결과를
 *   그대로 담아 alreadyResolved:true로 성공 반환합니다. 판정 성공 시 phase가 DAY를 벗어나므로,
 *   phase 검사보다 먼저 확인해야 재요청이 INVALID_PHASE가 아니라 멱등한 성공으로 처리됩니다)
 *   → 6. DAY phase → 7. 생존자 전원의 dayVotes 제출 완료(ACTIONS_PENDING, 추가 정보 없음)
 *   → 8. 저장된 모든 non-null target이 여전히 canonical participant인지(TARGET_NOT_A_PARTICIPANT
 *   — internal-only, 소켓 계층이 INTERNAL_ERROR로 정규화).
 *
 * 성공 시(신규 판정) { ok:true, session, resolution } — resolution은 commitDayVoteResolution에
 * 그대로 넘길 값입니다. 이미 판정된 경우 { ok:true, alreadyResolved:true, session, resolution }을
 * 반환하고, 호출자는 다시 commit하거나 재방송하지 않아야 합니다.
 */
function prepareDayVoteResolution(uuid, gameId, dayIndex) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }

    if (session.dayVoteResolution !== null && session.dayVoteResolution.dayIndex === dayIndex) {
        return { ok: true, alreadyResolved: true, session, resolution: session.dayVoteResolution }
    }

    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }

    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    for (const voterUuid of eligibleVoterUuids) {
        if (!session.dayVotes.has(voterUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
    }

    // 검증은 eligible alive voter의 표만 본다(session.dayVotes 전체가 아님) — 대상도 참가자로
    // 존재할 뿐 아니라 여전히 alive여야 한다(사망한 참가자를 겨눈 표는 TARGET_NOT_A_PARTICIPANT와
    // 동일하게 internal-only로 취급한다).
    for (const voterUuid of eligibleVoterUuids) {
        const target = session.dayVotes.get(voterUuid)
        if (target !== null) {
            const targetPlayer = session.players.get(target)
            if (!targetPlayer || !targetPlayer.alive) {
                return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
            }
        }
    }

    const tally = tallyDayVoteOutcome(session)
    return {
        ok: true,
        session,
        resolution: {
            gameId: session.id,
            dayIndex: session.dayIndex,
            outcome: tally.outcome,
            tribunalTargetUuid: tally.tribunalTargetUuid,
            publicVoteCount: tally.publicVoteCount,
            publicAbstainCount: tally.publicAbstainCount,
        },
    }
}

/**
 * DAY 투표 판정 커밋의 유일한 mutation입니다. prepareDayVoteResolution이 반환한 resolution만
 * 소비하고, 클라이언트 입력이나 raw dayVotes를 다시 읽지 않습니다. TRIBUNAL 판정이면 phase를
 * TRIBUNAL로 전이하고 tribunal.candidateId를 채웁니다. TIE/ABSTAINED면 TRIBUNAL 없이 곧장 그날
 * 밤(NIGHT)으로 전이합니다 — commitTribunalVoteResolution의 무죄/비종결 TRIBUNAL→NIGHT 전이와
 * 동일한 원칙으로, dayIndex는 바꾸지 않습니다(dayIndex 증가는 오직 commitNightResolution의
 * NIGHT→DAY 전이에서만 일어납니다). nightActions/nightResolution도 그 전이와 동일한 이유로 반드시
 * 새 Map/null로 되돌려야 한다 — 그러지 않으면 지난 밤의 잔여 nightActions 엔트리가 이번 밤의
 * ACTIONS_PENDING 판정·집계를 오염시키고, nightResolution이 non-null로 남아있어
 * prepareNightResolution이 즉시 NIGHT_ALREADY_RESOLVED로 거부해버린다. session.dayVoteResolution은
 * 어느 outcome이든 채워진 채로 남으므로(TIE/ABSTAINED도 null로 되돌리지 않음), 이후 phase가
 * NIGHT로 바뀌어도 prepareDayVoteResolution의 alreadyResolved 체크가 이 dayIndex의 재제출·재판정을
 * 계속 잠근다.
 */
function commitDayVoteResolution(session, resolution) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    session.dayVoteResolution = resolution
    if (resolution.outcome === 'TRIBUNAL') {
        session.phase = 'TRIBUNAL'
        session.tribunal = {
            candidateId: resolution.tribunalTargetUuid,
            dayIndex: session.dayIndex,
            defendantUuid: resolution.tribunalTargetUuid,
            votes: new Map(),
        }
    } else {
        session.tribunal = null
        session.phase = 'NIGHT'
        session.nightActions = new Map()
        session.nightResolution = null
    }
    return { ok: true }
}

/**
 * DAY 투표 판정 공개 payload. voterUuid→targetUuid 매핑, role, team, socketId, 내부 Map/Set은
 * 어디에도 포함하지 않습니다 — 공개 집계 수치와 결과 판정만 담습니다.
 */
function buildDayVoteResolvedPayload(session, resolution) {
    return {
        gameId: session.id,
        dayIndex: resolution.dayIndex,
        phase: session.phase,
        outcome: resolution.outcome,
        tribunalTargetUuid: resolution.tribunalTargetUuid,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
    }
}

/**
 * TRIBUNAL 유죄/무죄 투표 제출을 처리합니다. 인증된 uuid와 클라이언트가 알고 있는 gameId,
 * dayIndex, vote('GUILTY'|'NOT_GUILTY')만 입력으로 받습니다. 동기 함수이며(내부에 await 없음),
 * 검증 실패 시 session.* 어떤 필드도 건드리지 않습니다 — 유일한 mutation은 마지막 단계의
 * session.tribunal.votes.set(uuid, vote) 한 줄입니다.
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 형태 → 2. uuid의 활성 세션 존재(NOT_IN_SESSION)·gameId 일치(STALE_SESSION_MISMATCH)
 *   → 3. registry 일관성(session 실존, uuid가 참가자) → 4. dayIndex 형태·session.dayIndex와 일치
 *   → 5. TRIBUNAL phase → 6. session.tribunal 존재·dayIndex 일치 → 7. 이미 판정
 *   완료(TRIBUNAL_ALREADY_RESOLVED — resolveTribunalVote 성공 이후 잠금) → 8. canonical
 *   dayVoteResolution이 TRIBUNAL 판정이고 dayIndex·대상이 session.tribunal과 전부 일관되는지
 *   → 9. 피고인 참조 유효성·생존 → 10. 요청자 생존 → 11. 요청자≠피고인 → 12. vote 값 검증
 *   → 13. 중복 제출 거부.
 *
 * 8~9번(내부 상태 불일치)은 소켓 계층에서 INTERNAL_ERROR로 정규화되는 internal-only 코드다 —
 * 클라이언트 입력만으로는 도달할 수 없고 서버 내부 상태가 손상됐을 때만 발생한다.
 */
function submitTribunalVote(uuid, gameId, dayIndex, vote) {
    if (typeof gameId !== 'string' || gameId.length === 0) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== gameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }
    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }

    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }

    const tribunal = session.tribunal
    if (!tribunal) return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    if (tribunal.dayIndex !== session.dayIndex) return { ok: false, code: 'TRIBUNAL_CONTEXT_MISMATCH' }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    const resolution = session.dayVoteResolution
    if (!resolution) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (resolution.outcome !== 'TRIBUNAL') return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (resolution.dayIndex !== session.dayIndex || resolution.dayIndex !== tribunal.dayIndex) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }
    if (resolution.tribunalTargetUuid !== tribunal.defendantUuid) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    const defendantUuid = tribunal.defendantUuid
    if (typeof defendantUuid !== 'string' || defendantUuid.length === 0) {
        return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    }
    const defendant = session.players.get(defendantUuid)
    if (!defendant || !defendant.alive) return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }

    if (!actor.alive) return { ok: false, code: 'PLAYER_NOT_ALIVE' }
    if (uuid === defendantUuid) return { ok: false, code: 'DEFENDANT_CANNOT_VOTE' }

    if (vote !== 'GUILTY' && vote !== 'NOT_GUILTY') return { ok: false, code: 'INVALID_TRIBUNAL_VOTE' }

    if (tribunal.votes.has(uuid)) return { ok: false, code: 'TRIBUNAL_VOTE_ALREADY_SUBMITTED' }

    tribunal.votes.set(uuid, vote)
    return { ok: true, gameId: session.id, dayIndex: session.dayIndex, vote: tribunal.votes.get(uuid) }
}

// TRIBUNAL 판정 prepare/commit 사이 신뢰 경계를 지키기 위한 pending 레코드 저장소. session
// (객체 참조) → { resolution, ballotSnapshot }. 모듈 비공개이며 export하지 않는다 — commit이
// 재검증할 유일한 canonical 근거를 caller가 넘긴 값이 아니라 여기 저장된 값으로 삼기 위함이다
// (재-prepare가 이전 레코드를 덮어써 우회를 막고, session이 GC되면 자연히 함께 사라진다).
const TRIBUNAL_PENDING = new WeakMap()

// session.players를 읽기만 하는 순수 계산 — TRIBUNAL 유효 투표자(생존 && 피고인이 아닌
// 참가자) uuid를 반환한다.
function getEligibleTribunalVoterUuids(session, defendantUuid) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive && player.uuid !== defendantUuid) uuids.push(player.uuid)
    }
    return uuids
}

// session.tribunal.votes를 읽기만 해서 eligible voter 각각의 표를 voterUuid 코드유닛
// 오름차순으로 정렬한 구조적 복사본으로 만든다(순수 계산). prepare가 freeze해 pending
// 레코드로 보관하고, commit이 재호출해 현재 canonical votes와 deep-equal 비교한다.
function buildTribunalBallotSnapshot(session, tribunal) {
    const eligibleVoterUuids = getEligibleTribunalVoterUuids(session, tribunal.defendantUuid)
    const snapshot = eligibleVoterUuids.map((voterUuid) => ({ voterUuid, choice: tribunal.votes.get(voterUuid) }))
    snapshot.sort((a, b) => {
        if (a.voterUuid < b.voterUuid) return -1
        if (a.voterUuid > b.voterUuid) return 1
        return 0
    })
    return snapshot
}

// ballotSnapshot을 집계해 판정을 계산한다(순수 계산). guilty > notGuilty일 때만 GUILTY이고,
// 동률을 포함한 나머지는 전부 NOT_GUILTY다 — executedUuid는 GUILTY일 때만 defendantUuid다.
function tallyTribunalBallots(ballotSnapshot, defendantUuid) {
    let guilty = 0
    let notGuilty = 0
    for (const { choice } of ballotSnapshot) {
        if (choice === 'GUILTY') guilty += 1
        else if (choice === 'NOT_GUILTY') notGuilty += 1
    }
    const outcome = guilty > notGuilty ? 'GUILTY' : 'NOT_GUILTY'
    return { counts: { guilty, notGuilty }, outcome, executedUuid: outcome === 'GUILTY' ? defendantUuid : null }
}

// 두 ballotSnapshot이 원소 단위로(voterUuid·choice 전부) 완전히 동일한지 비교한다(순수 계산).
// commit이 prepare 시점 이후 표가 바뀌었는지(교환 포함) 판별하는 유일한 근거다.
function tribunalBallotSnapshotsEqual(a, b) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (a[i].voterUuid !== b[i].voterUuid || a[i].choice !== b[i].choice) return false
    }
    return true
}

/**
 * TRIBUNAL 판정을 준비합니다(canonical 상태는 바꾸지 않는 순수 함수 — 단, 성공 시 모듈 비공개
 * TRIBUNAL_PENDING에 pending 레코드를 기록합니다).
 *
 * 검증 순서: 1. gameId/dayIndex 형태 → 2. uuid의 활성 세션 존재·gameId 일치 → 3. registry
 * 일관성(session 실존, uuid가 참가자) → 4. dayIndex가 session.dayIndex와 일치 → 5. TRIBUNAL
 * phase → 6. session.tribunal에 candidateId·defendantUuid가 유효한 문자열로 존재
 * (TRIBUNAL_STATE_NOT_FOUND, internal-only) → 7. 아직 미resolved(TRIBUNAL_ALREADY_RESOLVED)
 * → 8. 유효 투표자 전원이 정확히 1표씩 제출 완료(TRIBUNAL_VOTES_INCOMPLETE).
 *
 * 성공 시 { ok:true, session, resolution }을 반환합니다. resolution은
 * { gameId, dayIndex, defendantUuid, outcome, counts, executedUuid, ballotSnapshot }이고
 * root·counts·ballotSnapshot·원소가 전부 freeze되어 있습니다 — commitTribunalVoteResolution에
 * 그대로(참조 동일성 유지) 넘겨야 합니다.
 */
function prepareTribunalVoteResolution(uuid, gameId, dayIndex) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }
    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }

    const tribunal = session.tribunal
    if (
        !tribunal ||
        typeof tribunal.candidateId !== 'string' ||
        tribunal.candidateId.length === 0 ||
        typeof tribunal.defendantUuid !== 'string' ||
        tribunal.defendantUuid.length === 0
    ) {
        return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    const eligibleVoterUuids = getEligibleTribunalVoterUuids(session, tribunal.defendantUuid)
    for (const voterUuid of eligibleVoterUuids) {
        if (!tribunal.votes.has(voterUuid)) return { ok: false, code: 'TRIBUNAL_VOTES_INCOMPLETE' }
    }

    const ballotSnapshot = buildTribunalBallotSnapshot(session, tribunal)
    for (const entry of ballotSnapshot) Object.freeze(entry)
    Object.freeze(ballotSnapshot)

    const tally = tallyTribunalBallots(ballotSnapshot, tribunal.defendantUuid)
    const resolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        defendantUuid: tribunal.defendantUuid,
        outcome: tally.outcome,
        counts: Object.freeze({ guilty: tally.counts.guilty, notGuilty: tally.counts.notGuilty }),
        executedUuid: tally.executedUuid,
        ballotSnapshot,
    }
    Object.freeze(resolution)

    TRIBUNAL_PENDING.set(session, { resolution, ballotSnapshot })

    return { ok: true, session, resolution }
}

/**
 * TRIBUNAL 판정 커밋의 유일한 mutation입니다. prepareTribunalVoteResolution이 만든 pending
 * 레코드를 신뢰 경계로 삼아 caller가 넘긴 resolution을 재검증합니다: (a) phase/dayIndex/
 * registry 조회 세션===인자 session + 피고인 존재·alive → (a′) record.resolution===resolution
 * 참조 동일성 → (b) 현재 canonical votes 정규화 배열 vs record.ballotSnapshot deep-equal →
 * (c) 재집계 counts/outcome/executedUuid 비교. 어느 하나라도 어긋나면 canonical을 전혀
 * 건드리지 않고 { ok:false, code:'TRIBUNAL_RESOLUTION_MISMATCH' }를 반환하며 pending 레코드도
 * 그대로 남겨둡니다(성공했을 때만 지웁니다). 이미 판정된 세션에 대한 재commit은 이 재검증보다
 * 먼저 { ok:false, code:'TRIBUNAL_ALREADY_RESOLVED' }로 거부합니다.
 *
 * 성공 시 GUILTY라면 피고인 alive를 정확히 한 번 false로 바꾸고, session.tribunal에
 * outcome/counts/executedUuid/resolved를 기록합니다. phase는 이 슬라이스에서 바꾸지
 * 않습니다(TRIBUNAL 이후 전이는 이후 슬라이스의 몫입니다).
 */
function commitTribunalVoteResolution(session, resolution) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const canonicalSession = gameSessions.get(session.id)
    if (canonicalSession !== session) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (session.dayIndex !== resolution.dayIndex) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    const tribunal = session.tribunal
    if (!tribunal || tribunal.defendantUuid !== resolution.defendantUuid || tribunal.dayIndex !== resolution.dayIndex) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    const defendant = session.players.get(resolution.defendantUuid)
    if (!defendant || !defendant.alive) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    const record = TRIBUNAL_PENDING.get(session)
    if (!record || record.resolution !== resolution) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    const currentBallotSnapshot = buildTribunalBallotSnapshot(session, tribunal)
    if (!tribunalBallotSnapshotsEqual(currentBallotSnapshot, record.ballotSnapshot)) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    const tally = tallyTribunalBallots(currentBallotSnapshot, tribunal.defendantUuid)
    if (
        tally.outcome !== resolution.outcome ||
        tally.counts.guilty !== resolution.counts.guilty ||
        tally.counts.notGuilty !== resolution.counts.notGuilty ||
        tally.executedUuid !== resolution.executedUuid
    ) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    if (resolution.outcome === 'GUILTY') defendant.alive = false
    tribunal.outcome = resolution.outcome
    tribunal.counts = { guilty: resolution.counts.guilty, notGuilty: resolution.counts.notGuilty }
    tribunal.executedUuid = resolution.executedUuid
    tribunal.resolved = true

    TRIBUNAL_PENDING.delete(session)

    const winResult = evaluateWinCondition(session)
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, terminal: { winner: winResult.winner } }
    }

    // 승리 조건 미충족 — TRIBUNAL은 여기서 끝나고 그날 밤(NIGHT)으로 전이한다. dayIndex는
    // 그대로 유지한다(같은 날의 낮→재판 연장선이 끝나고 그 밤으로 넘어가는 것뿐이므로 —
    // dayIndex 증가는 오직 commitNightResolution의 NIGHT→DAY 전이에서만 일어난다).
    // nightActions/nightResolution은 반드시 새 Map/null로 되돌려야 한다 — 그러지 않으면 지난
    // 밤의 잔여 nightActions 엔트리가 이번 밤의 ACTIONS_PENDING 판정·집계를 오염시키고,
    // nightResolution이 non-null로 남아있어 prepareNightResolution이 즉시
    // NIGHT_ALREADY_RESOLVED로 거부해버린다.
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    return { ok: true, terminal: null }
}

/**
 * TRIBUNAL 판정 공개 payload. top-level 키는 정확히
 * [counts, dayIndex, defendantUuid, executedUuid, gameId, outcome, phase]뿐입니다 —
 * voterUuid별 개별 표(ballotSnapshot)나 role/team/privateRole 등은 어디에도 없습니다.
 */
function buildTribunalVoteResolvedPayload(session) {
    const tribunal = session.tribunal
    return {
        gameId: session.id,
        dayIndex: tribunal.dayIndex,
        phase: session.phase,
        defendantUuid: tribunal.defendantUuid,
        outcome: tribunal.outcome,
        counts: { guilty: tribunal.counts.guilty, notGuilty: tribunal.counts.notGuilty },
        executedUuid: tribunal.executedUuid,
    }
}

// uuid 본인이 현재 phase에서 이미 제출을 마쳤는지(순수 계산 — 어떤 상태도 바꾸지 않는다).
// 항상 .has()로만 판정한다(.get() !== undefined가 아님) — session.nightActions/dayVotes는
// SKIP/기권을 null 값으로 저장하므로, .get()은 "미제출"과 "SKIP 제출"을 구분하지 못한다.
function computeHasActedThisPhase(session, uuid) {
    switch (session.phase) {
        case 'ROLE_REVEAL':
            return session.roleRevealAcks.has(uuid)
        case 'NIGHT':
            return session.nightActions.has(uuid)
        case 'DAY':
            return session.dayVotes.has(uuid)
        case 'TRIBUNAL':
            return session.tribunal ? session.tribunal.votes.has(uuid) : false
        default:
            return false // ENDED
    }
}

// snapshot에 dayVoteResolution/tribunal을 포함해도 되는지 판정한다(순수 계산). dayIndex
// 일치만으로는 불충분하다 — commitTribunalVoteResolution의 TRIBUNAL→NIGHT(무죄/비종결) 전이는
// phase만 NIGHT로 바꾸고 session.dayVoteResolution/session.tribunal은 그대로 남겨두므로(둘 다
// 여전히 현재 session.dayIndex와 같은 dayIndex를 가짐), dayIndex 일치 검사만으로는 그 NIGHT
// 단계에서 두 필드가 계속 노출된다. 그 밤이 그대로 게임을 끝내는 경우(킬로 인한 ENDED)에도
// session.dayIndex는 바뀌지 않으므로 동일한 문제가 ENDED까지 이어진다. 판정 근거는 phase이고,
// ENDED에서만 예외적으로 "이 종결이 이번 밤의 킬에서 나온 것인지"(nightResolution.dayIndex와
// session.dayIndex 비교)를 추가로 본다 — 다르면 DAY/TRIBUNAL 사이클이 종결시킨 것이므로 그
// 사이클의 dayVoteResolution/tribunal은 여전히 유효하다.
function canIncludeDayTribunalFields(session) {
    if (session.phase === 'DAY' || session.phase === 'TRIBUNAL') return true
    if (session.phase === 'ENDED') {
        return session.nightResolution !== null && session.nightResolution.dayIndex !== session.dayIndex
    }
    return false // ROLE_REVEAL, NIGHT
}

/**
 * get_session_snapshot 응답 본문을 만든다(순수 함수, 매 호출마다 새 defensive-copy 구조를
 * 반환한다 — 반환값을 변형해도 session이나 다음 호출 결과에 영향이 없다). uuid는 이미
 * getSessionSnapshotForPlayer가 참가자로 검증한 뒤에만 넘어온다.
 *
 * top-level은 항상 { gameId, phase, dayIndex, players, self }이고, 상황에 따라 nightResult/
 * dayVoteResolution/tribunal/winResult가 추가된다. 다른 참가자의 role/team/allies/투표·행동
 * 대상/raw ballot/개별 제출 여부는 어디에도 포함하지 않는다 — self만 본인의 role 관련 필드를
 * 담는다. 단 phase가 ENDED일 때의 winResult.reveals만 예외다: 게임이 끝났으므로 전원의
 * role/team을 의도적으로 공개한다(buildTerminalFields의 종료 payload와 같은 내용이라
 * 재접속 클라이언트가 방송을 놓쳐도 같은 결과 화면을 만들 수 있다).
 * @param {object} session - canonical GameSession
 * @param {string} uuid - 이미 참가자로 검증된 요청자 uuid
 * @flow nightResolution이 있으면 nightResult를, DAY/TRIBUNAL 노출 게이트를 통과하면 그
 *   dayIndex의 dayVoteResolution/tribunal을, winResult가 있으면 그 얕은 복사본을 덧붙이고,
 *   phase가 ENDED일 때만 그 복사본에 reveals/mvp를 얹는다.
 */
function buildSessionSnapshot(session, uuid) {
    const viewer = session.players.get(uuid)
    const fields = {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        players: [...session.players.values()].map(({ uuid: pUuid, nickname, alive }) => ({
            uuid: pUuid,
            nickname,
            isAlive: alive,
        })),
        self: {
            ...buildViewerRoleFields(session, viewer),
            hasActedThisPhase: computeHasActedThisPhase(session, uuid),
        },
    }

    if (session.nightResolution) {
        // session.nightResolution은 매 NIGHT phase 진입 시점(최초 생성, commitTribunalVoteResolution의
        // 무죄/비종결 TRIBUNAL→NIGHT 리셋)마다 null로 되돌아가므로, 여기 존재한다는 사실 자체가
        // 항상 "가장 최근에 판정된 밤"을 뜻한다(phase가 NIGHT인 채로 남은 stale 기록일 수 없다).
        // dayIndex/victimUuid는 반드시 buildNightResultAppliedPayload가 반환한 값을 그대로 써야
        // 한다 — session.nightResolution.dayIndex를 직접 읽으면 비종결 경로에서 dayIndex 증가
        // 전의(원래 night_result_applied 방송보다 하나 작은) 값을 돌려주게 된다.
        // deathReveals도 같은 이유로 canonical 빌더를 통해 얻는다 — 재접속 클라이언트가 받는
        // 목록은 그 밤의 방송이 실어 나른 목록과 정확히 같아야 하고(가장 최근 판정 하나뿐),
        // 빌더가 매번 새 배열/새 원소로 복사하므로 응답을 변형해도 session은 오염되지 않는다.
        const { dayIndex, victimUuid, deathReveals } = buildNightResultAppliedPayload(
            session,
            session.nightResolution.pendingEliminationTargetId,
            session.nightResolution.publicDeathReveals,
        )
        fields.nightResult = { dayIndex, victimUuid, deathReveals }
    }

    if (canIncludeDayTribunalFields(session)) {
        if (session.dayVoteResolution && session.dayVoteResolution.dayIndex === session.dayIndex) {
            const { outcome, tribunalTargetUuid, publicVoteCount, publicAbstainCount } = buildDayVoteResolvedPayload(
                session,
                session.dayVoteResolution,
            )
            fields.dayVoteResolution = { outcome, tribunalTargetUuid, publicVoteCount, publicAbstainCount }
        }

        if (session.tribunal && session.tribunal.dayIndex === session.dayIndex) {
            if (session.tribunal.resolved) {
                const { defendantUuid, outcome, counts, executedUuid } = buildTribunalVoteResolvedPayload(session)
                fields.tribunal = { defendantUuid, resolved: true, outcome, counts: { ...counts }, executedUuid }
            } else {
                fields.tribunal = { defendantUuid: session.tribunal.defendantUuid, resolved: false }
            }
        }
    }

    // 종료 payload(buildTerminalFields)와 동일한 규칙으로 조립한다 — 방송을 놓친 재접속
    // 클라이언트가 결과 화면을 만들 때 방송본과 다른 winResult를 받지 않도록.
    if (session.winResult) {
        fields.winResult = { ...session.winResult }
        if (session.phase === 'ENDED') {
            fields.winResult.reveals = buildEndedRoleReveals(session)
            fields.winResult.mvp = null // MVP 기획 미확정 — 슬롯만 예약한다
        }
    }

    return fields
}

/**
 * get_session_snapshot 요청-ACK 전용 읽기 primitive다(guard 미적용 — ENDED 이후에도 조회
 * 가능해야 한다). getActiveSessionRoutingInfo와 동일하게 인증된 uuid를 유일한 권한 원천으로
 * 삼는다 — 클라이언트가 보낸 gameId는 playerSession 조회의 근거로 쓰지 않고, 넘어온 경우
 * (undefined가 아닌 경우) canonical session.id와 일치하는지 검증하는 부가 확인으로만 쓴다.
 *
 * 검증 순서: 1. uuid의 활성 세션 존재(NOT_A_PARTICIPANT) → 2. registry 일관성(session 실존
 * — SESSION_NOT_FOUND, uuid가 참가자 — NOT_A_PARTICIPANT) → 3. expectedGameId가 주어졌으면
 * (undefined가 아니면, 빈 문자열·공백만 있는 문자열 포함) trim 후 session.id와 정확히 일치
 * (GAME_ID_MISMATCH).
 *
 * SESSION_NOT_FOUND/NOT_A_PARTICIPANT는 registry 불일치 상황에서만 나오는 internal-only
 * 코드다 — 소켓 계층이 INTERNAL_ERROR로 정규화해야 한다. GAME_ID_MISMATCH는 클라이언트가
 * 잘못된(오래된) gameId를 들고 재접속했을 때 정상적으로 도달 가능한 안정된 공개 코드다.
 */
function getSessionSnapshotForPlayer(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const session = gameSessions.get(gameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (expectedGameId !== undefined) {
        const normalizedExpected = typeof expectedGameId === 'string' ? expectedGameId.trim() : ''
        if (!normalizedExpected || normalizedExpected !== session.id) {
            return { ok: false, code: 'GAME_ID_MISMATCH' }
        }
    }

    return { ok: true, snapshot: buildSessionSnapshot(session, uuid) }
}

/**
 * NIGHT 단계 JOKER 전용 채팅 메시지를 검증합니다(어떤 상태도 바꾸지 않는 순수 함수). 인증된
 * uuid와 클라이언트가 알고 있는 gameId, 원문 text만 입력으로 받습니다 — role/team/senderUuid
 * 등은 이 함수의 입력에 아예 없습니다(클라이언트가 그런 필드를 함께 보내도 무시됩니다).
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 정규화(trim 후 빈 문자열 거부) → 2. uuid의 활성 세션 존재·gameId 일치
 *   → 3. registry 일관성(session 실존, uuid가 참가자) → 4. NIGHT phase
 *   → 5. 발신자가 JOKER 진영이고 아직 생존해 있는지(ROLE_TEAMS[actor.role] !== 'JOKER'이거나
 *   actor.alive !== true면 NOT_ELIGIBLE — CITIZEN이 payload를 위조해도, 사망한 JOKER가
 *   요청해도 여기서 막힙니다) → 6. sanitizeChatText
 *   → 7. now()를 정확히 한 번 호출해 sentAt을 계산하고 유효성 검증(INVALID_CLOCK_VALUE)
 *   → 8. jokerChatRateLimit을 읽기만 해서 rate limit 판정(RATE_LIMITED).
 *
 * 사망한 JOKER는 이 경로로 보낼 수 없고(NOT_ELIGIBLE), getChatRecipientUuids의 JOKER 채널
 * 수신자에서도 제외됩니다 — 대신 사망자 전용 채팅(prepareGameChatMessage)만 쓸 수 있습니다.
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

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (ROLE_TEAMS[actor.role] !== 'JOKER') return { ok: false, code: 'NOT_ELIGIBLE' }
    if (actor.alive !== true) return { ok: false, code: 'NOT_ELIGIBLE' }

    const sanitized = sanitizeChatText(text)
    if (!sanitized.ok) return sanitized

    const sentAt = now()
    if (!Number.isFinite(sentAt) || !Number.isInteger(sentAt) || sentAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }

    const lastSentAt = getChatRateLimitMap(session, CHAT_CHANNELS.JOKER).get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'RATE_LIMITED' }
    }

    return { ok: true, session, actorUuid: uuid, sanitizedText: sanitized.text, sentAt }
}

/** JOKER 채팅의 유일한 mutation — prepareJokerChatMessage가 반환한 session/uuid/sentAt으로 rate limit을 갱신합니다. */
function commitJokerChatMessage(session, uuid, sentAt) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    getChatRateLimitMap(session, CHAT_CHANNELS.JOKER).set(uuid, sentAt)
    return { ok: true }
}

/**
 * 공개 DAY 채팅과 사망자 전용 채팅의 단일 검증 진입점입니다(어떤 상태도 바꾸지 않는 순수
 * 함수). prepareJokerChatMessage와 마찬가지로 인증된 uuid·클라이언트가 알고 있는 gameId·원문
 * text만 입력으로 받습니다 — 채널·발신자·닉네임·수신자·dayIndex는 전부 canonical 상태에서
 * 유도되며, 클라이언트가 그런 필드를 함께 보내도 이 함수의 입력에 아예 없습니다.
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 정규화(trim 후 빈 문자열 거부) → 2. uuid의 활성 세션 존재·gameId 일치
 *   → 3. registry 일관성(session 실존, uuid가 참가자) → 4. 종료 여부(GAME_ALREADY_ENDED)
 *   → 5. resolveGameChatChannel로 채널 유도(생존↔DAY / 사망↔NIGHT·DAY·TRIBUNAL, 그 외
 *   INVALID_PHASE) → 6. sanitizeChatText → 7. now()를 정확히 한 번 호출해 sentAt 계산·검증
 *   (INVALID_CLOCK_VALUE) → 8. 그 채널의 rate limit Map만 읽어 판정(RATE_LIMITED)
 *   → 9. 메시지 ID 생성·검증(ID_GENERATION_ERROR / INVALID_MESSAGE_ID).
 *
 * 어떤 rate limit Map도 쓰지 않습니다(읽기만 합니다) — 실패한 요청은 rate limit을 소비하지
 * 않고, 세션·registry 상태도 전혀 바뀌지 않습니다. 성공한 요청만 마지막에 메시지 ID를 만들고
 * (idFn — 기본값 crypto.randomUUID), 그 요청 하나에만 묶인 단일 사용 능력(capability)을
 * preparedGameChatCapabilities에 기록합니다 — commit이 "이 요청이 실제로 준비된 그 요청인가"를
 * 대조할 유일한 근거이고, 이 함수가 남기는 유일한 흔적입니다. 능력 기록은 모듈 밖으로
 * 나가지 않으므로 위조할 수 없습니다.
 *
 * 메시지 ID까지 여기서 만드는 이유는, commit이 대조하는 능력에 "밖으로 나갈 공개 메시지"
 * 전체(messageId 포함)가 통째로 묶여야 하기 때문입니다 — 소켓 계층이 ID를 따로 만들면 그
 * 값만은 어떤 canonical 기록과도 대조되지 않는 구멍으로 남습니다. idFn이 던지거나 빈
 * 문자열을 돌려주면 ID_GENERATION_ERROR·INVALID_MESSAGE_ID로 거부되며, 그때도 어떤 Map도
 * 바뀌지 않습니다(원자성).
 *
 * 성공 반환값의 nickname/dayIndex는 session.players/session이 들고 있는 canonical 값이고,
 * actorUuid는 인증 uuid 그 자체입니다. message는 소켓 계층이 그대로 내보낼 공개 화이트리스트
 * 7개 키뿐입니다(role/team/alive/allies는 어디에도 없습니다).
 */
function prepareGameChatMessage(uuid, gameId, text, { now = Date.now, idFn = () => crypto.randomUUID() } = {}) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const routed = resolveGameChatChannel(session, actor)
    if (!routed.ok) return routed

    const sanitized = sanitizeChatText(text)
    if (!sanitized.ok) return sanitized

    const sentAt = now()
    if (!Number.isFinite(sentAt) || !Number.isInteger(sentAt) || sentAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }

    const rateLimitMap = getChatRateLimitMap(session, routed.channel)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }
    const lastSentAt = rateLimitMap.get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'RATE_LIMITED' }
    }

    const created = createGameChatMessageId(idFn)
    if (!created.ok) return created

    // 밖으로 나갈 공개 메시지의 canonical 원본. 소켓 계층은 이 값을 만들지도 고치지도 않고,
    // commit이 능력 기록에서 돌려주는 사본만 그대로 내보낸다.
    const message = {
        gameId: session.id,
        messageId: created.messageId,
        senderUuid: uuid,
        nickname: actor.nickname,
        text: sanitized.text,
        sentAt,
        dayIndex: session.dayIndex,
    }

    const prepared = {
        ok: true,
        session,
        channel: routed.channel,
        actorUuid: uuid,
        nickname: actor.nickname,
        sanitizedText: sanitized.text,
        sentAt,
        dayIndex: session.dayIndex,
        message: { ...message },
    }

    preparedGameChatCapabilities.set(
        prepared,
        Object.freeze({
            session,
            gameId: session.id,
            channel: routed.channel,
            actorUuid: uuid,
            nickname: actor.nickname,
            text: sanitized.text,
            sentAt,
            dayIndex: session.dayIndex,
            messageId: created.messageId,
            message: Object.freeze({ ...message }),
        }),
    )

    return prepared
}

/**
 * DAY/사망자 채팅의 유일한 mutation입니다. 인자는 prepareGameChatMessage가 돌려준 prepared 객체
 * 하나뿐이고, 그 객체는 "값을 담은 가방"이 아니라 "그 요청 하나를 커밋할 수 있는 단일 사용
 * 능력(capability)"으로만 취급됩니다.
 *
 * 두 가지 독립적인 이유로 prepared의 노출 필드는 어떤 판정의 근거도 되지 못합니다:
 *   - prepare~commit 사이에 다른 이벤트(밤 판정으로 인한 사망, phase 전이, 세션 종료·이탈,
 *     재접속)가 끼어들 수 있다 → canonical 상태에서 권한을 처음부터 다시 유도한다.
 *   - prepared 번들 자체가 호출자에 의해 변조됐을 수 있다 → 실제로 쓰는 값(sentAt·channel·
 *     uuid·session·공개 메시지)은 전부 모듈 사설 능력 기록에서만 읽는다.
 *
 * 검증 순서(앞 단계를 통과해야 뒤가 평가되고, 어디서 실패하든 그 즉시 반환합니다):
 *   1. 능력 조회 — prepared가 객체이고, production prepare가 발급한 그 객체여야 한다. 손으로
 *      만든 동일한 모양의 객체·이미 소모된 prepared·prepare를 건너뛴 임의의 값은 전부
 *      STALE_CHAT_REQUEST다(WeakMap 참조 조회라 위조할 방법이 없다).
 *   2. 번들 무결성 — 노출된 prepared의 모든 필드(message의 7개 키 포함)가 능력 기록과 한
 *      글자도 다르지 않아야 한다. sentAt만 바꾸든, message.sentAt과 prepared.sentAt을 함께
 *      바꾸든, 어느 쪽도 통과하지 못한다(STALE_CHAT_REQUEST).
 *   3. canonical 세션 동일성 — 인증 uuid(능력 기록의 값)의 현재 활성 gameId로 registry에서
 *      찾은 session이 정확히 그 session 객체(참조 동일성)여야 하고, session.id와 능력 기록의
 *      gameId도 그 gameId와 같아야 한다. 세션 밖 발신자·이미 이탈한 발신자는 여기서 걸린다.
 *   4. 참가자 멤버십 — session.players에 그 uuid가 실제로 있고, 항목의 uuid가 인증 uuid와
 *      같아야 한다(인증 발신자 uuid 재확인). 닉네임도 발급 당시와 같아야 한다.
 *   5. 종료 여부(GAME_ALREADY_ENDED)
 *   6. "지금 실제로 유효한 채널"을 resolveGameChatChannel로 다시 유도해 능력 기록의 채널과
 *      대조 — 현재 phase/생존 권한을 여기서 다시 통과해야 하고, 그 사이 DAY→NIGHT 전이나
 *      생존→사망 전이가 있었다면 STALE_CHAT_CHANNEL로 거부된다(라우팅이 바뀐 채널로는 절대
 *      커밋되지 않는다). dayIndex도 발급 당시와 같아야 한다.
 *   7. 타임스탬프 — 능력 기록의 sentAt과 그 안의 공개 메시지 sentAt이 정확히 같은 값이어야
 *      하고, 유한한 비음수 정수여야 한다(INVALID_CLOCK_VALUE). 그 다음 commit이 스스로 호출한
 *      canonical 시계(now)와 대조해 셋을 모두 만족해야 한다(어기면 STALE_CHAT_TIMESTAMP):
 *        (a) sentAt <= now()             — 미래 시각을 심어 이후 전송을 잠그지 못한다
 *        (b) now() - sentAt <= CHAT_COMMIT_MAX_AGE_MS — 오래된 prepared의 재생(replay)을 막는다
 *        (c) 마지막 전송 시각이 있으면 sentAt - lastSentAt >= CHAT_MIN_INTERVAL_MS
 *      (c)는 prepare가 이미 한 간격 검사를 commit 시점의 최신 기록으로 다시 하는 것입니다 —
 *      동시에 준비된 두 요청 중 하나가 먼저 커밋되면, 남은 쪽은 더 이상 간격을 만족하지
 *      못하므로 거부됩니다(오래된 prepared가 기준 시각을 과거로 되돌리지 못한다).
 *   8. 다시 유도한 채널에 대응하는 rate limit Map(INVALID_CHAT_CHANNEL)
 *
 * 성공하면 능력 기록을 즉시 지우고(같은 prepared의 재생 불가) 그 채널의 Map에 능력 기록의
 * sentAt을 씁니다 — 다른 채널의 Map은 절대 건드리지 않습니다. 실패한 commit은 DAY/DEAD 어느
 * rate limit Map도 변형하지 않고 능력도 소모하지 않습니다(원자성 — 남의 실패가 정상 요청의
 * 능력을 태우지 못한다).
 *
 * 반환하는 message는 능력 기록의 사본입니다 — 소켓 계층이 내보내는 값의 출처가 언제나 서버
 * canonical 상태 하나뿐이 되도록, 호출자가 들고 있는 prepared.message는 쓰지 않습니다.
 */
function commitGameChatMessage(prepared, { now = Date.now } = {}) {
    if (typeof prepared !== 'object' || prepared === null) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    const capability = preparedGameChatCapabilities.get(prepared)
    if (!capability) return { ok: false, code: 'STALE_CHAT_REQUEST' }
    if (!matchesPreparedGameChatCapability(prepared, capability)) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    const { session, actorUuid: uuid, sentAt } = capability

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    const currentSession = gameSessions.get(currentGameId)
    if (!currentSession) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (currentSession !== session) return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    if (session.id !== currentGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    if (capability.gameId !== currentGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (actor.uuid !== uuid) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (actor.nickname !== capability.nickname) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const routed = resolveGameChatChannel(session, actor)
    if (!routed.ok) return routed
    if (routed.channel !== capability.channel) return { ok: false, code: 'STALE_CHAT_CHANNEL' }
    if (session.dayIndex !== capability.dayIndex) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    if (!Number.isFinite(sentAt) || !Number.isInteger(sentAt) || sentAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }
    // 능력 기록 안에서도 "준비된 시각"과 "밖으로 나갈 메시지의 시각"은 반드시 같은 값이어야 한다.
    if (capability.message.sentAt !== sentAt) return { ok: false, code: 'INVALID_CLOCK_VALUE' }

    const committedAt = now()
    if (!Number.isFinite(committedAt) || !Number.isInteger(committedAt) || committedAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }
    if (sentAt > committedAt) return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }
    if (committedAt - sentAt > CHAT_COMMIT_MAX_AGE_MS) return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }

    const rateLimitMap = getChatRateLimitMap(session, routed.channel)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }

    const lastSentAt = rateLimitMap.get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }
    }

    preparedGameChatCapabilities.delete(prepared)
    rateLimitMap.set(uuid, sentAt)
    return { ok: true, gameId: session.id, channel: routed.channel, message: { ...capability.message } }
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

    if (session.phase === 'ENDED') {
        // ENDED 세션은 첫 이탈에 registry 전체를 지우지 않는다 — 참가자마다 개별적으로
        // "이탈"만 반영하고, 마지막 참가자가 이탈할 때만 세션 자체를 registry에서 지운다.
        if (!session.detachedUuids) session.detachedUuids = new Set()
        session.detachedUuids.add(uuid)
        playerSession.delete(uuid)

        const sessionDeleted = session.detachedUuids.size >= session.players.size
        if (sessionDeleted) {
            gameSessions.delete(gameId)
            roomGameSession.delete(session.roomId)
        }
        return { ok: true, session, reason, sessionDeleted }
    }

    gameSessions.delete(gameId)
    roomGameSession.delete(session.roomId)
    session.players.forEach((_, playerUuid) => playerSession.delete(playerUuid))

    return { ok: true, session, reason, sessionDeleted: true }
}

/** 테스트 전용: 모듈 내부 상태를 초기화합니다. 런타임 코드에서는 호출하지 마세요. */
function __resetStateForTests() {
    gameSessions.clear()
    playerSession.clear()
    roomGameSession.clear()
    // 채팅 능력 기록은 WeakMap이라 지울 대상이 없다 — prepared 객체가 버려지면 함께 사라진다.
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
    checkNightTurnGate,
    computeCurrentNightTurnRole,
    buildNightTurnChangedPayload,
    submitDayVote,
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareGameChatMessage,
    commitGameChatMessage,
    getChatRecipientUuids,
    CHAT_CHANNELS,
    prepareNightResolution,
    commitNightResolution,
    buildNightResultAppliedPayload,
    PUBLIC_NIGHT_DEATH_SOURCES,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    buildDayVoteResolvedPayload,
    submitTribunalVote,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    buildTribunalVoteResolvedPayload,
    // 기존 이름을 그대로 유지한다(값은 채널 공용 CHAT_MAX_LENGTH와 동일한 단일 상수다).
    JOKER_CHAT_MAX_LENGTH: CHAT_MAX_LENGTH,
    CHAT_MAX_LENGTH,
    // 간격·commit 유효 창은 prepare와 commit이 함께 쓰는 canonical 규칙이라, 이 규칙을
    // 검증하는 테스트가 매직 넘버를 다시 적지 않도록 값 자체를 노출한다.
    CHAT_MIN_INTERVAL_MS,
    CHAT_COMMIT_MAX_AGE_MS,
    buildTerminalFields,
    getSessionSnapshotForPlayer,
    buildSessionSnapshot,
    getActiveSessionRoutingInfo,
    __resetStateForTests,
    __getStateSnapshotForTests,
    // 테스트에서 개별 함수를 직접 호출하거나 registry를 의도적으로 파괴하기 위한 통로입니다.
    // 런타임 코드에서는 참조하지 않습니다.
    __testables: {
        evaluateWinCondition,
        finalizeGameSession,
        assertSessionNotEnded,
        assignRoles,
        enterDayPhase,
        validateSessionInput,
        buildSessionCandidate,
        checkGameSessionPreconditions,
        assertValidSessionForCommit,
        getSpecialRoleBudget,
        computeRoleComposition,
        isEligibleForNightAction,
        sanitizeChatText,
        // 기존 테스트/호출부가 쓰던 이름을 그대로 남긴다(동일 함수 참조 — 채널 공용 규칙이다).
        sanitizeJokerChatText: sanitizeChatText,
        resolveGameChatChannel,
        getChatRateLimitMap,
        getEligibleNightActorUuids,
        NIGHT_TURN_ROLE_ORDER,
        getLivingNightTurnActorUuids,
        tallyJokerAssassinationTarget,
        computeDoctorProtectionSet,
        computeGuardInvestigationResult,
        computeWitchHunterConfirmationResult,
        resolveNightDeathSource,
        buildNightDeathReveals,
        getEligibleDayVoterUuids,
        tallyDayVoteOutcome,
        __deleteGameSessionOnlyForTests,
    },
}
