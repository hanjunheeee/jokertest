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
// F-24(AC-04/RESTORE-24): "다음 방 설정 복원"의 원본은 **시작에 실제로 쓰인 서버 확정 설정**의
// 허용 목록 사본이어야 한다. 그 허용 목록의 소유자는 F-20의 설정 모듈 하나뿐이다 — 여기서
// 직접 키를 다시 나열하면 한쪽만 바뀌었을 때 관전자 키 같은 허용 목록 밖 값이 복원 경로로
// 새어 든다(RESTORE-24). 이 모듈은 game-core/roleComposition만 참조하므로 순환이 없다.
const { buildRoomSettingsView } = require('../utils/updateRoomSettingsValidation')

// 5개 역할의 단일 canonical 정의. GAME_ROLES/ROLE_TEAMS는 모두 이 정의에서 파생된다
// (역할명을 여러 상수에 손으로 나열하면 하나만 바뀌었을 때 조용히 어긋날 수 있음).
// nightActionMinDayIndex는 "이 역할이 능력을 쓸 수 있는 가장 이른 dayIndex"다 — null이면
// 애초에 밤 행동이 없는 역할(CITIZEN). isEligibleForNightAction이 이 값을 소비한다.
//
// WITCH_HUNTER가 2인 이유(첫 밤 비활성 정책): production에서 첫 밤의 dayIndex는 1이다 —
// ROLE_REVEAL(dayIndex 0) → 전원 ack → enterDayPhase가 첫 DAY(dayIndex 1)를 열고 →
// commitDayVoteResolution이 dayIndex를 유지한 채 그 밤(NIGHT, dayIndex 1)으로 넘긴다. 두 번째
// 밤은 dayIndex 2다. dayIndex의 의미·증가 지점(enterDayPhase)은 그대로 두고 이 값만 2로 두어
// "첫 밤 불가, 둘째 밤부터 가능"을 표현한다.
//
// targetMustBeAlive는 "이 역할의 밤 행동 대상이 생존자여야 하는가"다. WITCH_HUNTER만 false다 —
// 마녀사냥꾼은 사망자를 확인하는 역할이라 생존자 지목이 오히려 거부 사유다. requiresAliveTarget이
// 이 값을 소비하며, 기본값은 true(알 수 없는 역할까지 fail-closed)다.
//
// 바깥 객체만 Object.freeze하면 각 역할의 내부 필드는 여전히 재할당 가능하므로, canonical
// metadata를 외부에서 변형 불가능하게 하려면 역할별 정의 각각도 개별적으로 동결해야 한다.
const ROLE_DEFINITIONS = Object.freeze({
    JOKER: Object.freeze({ team: 'JOKER', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    CITIZEN: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: null, targetMustBeAlive: true }),
    DOCTOR: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    GUARD: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    WITCH_HUNTER: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 2, targetMustBeAlive: false }),
})

const GAME_ROLES = Object.freeze(
    Object.fromEntries(Object.keys(ROLE_DEFINITIONS).map((role) => [role, role])),
)
const ROLE_TEAMS = Object.freeze(
    Object.fromEntries(Object.entries(ROLE_DEFINITIONS).map(([role, def]) => [role, def.team])),
)

// F-14(AC-04): 서버 역할 ↔ frontend skinCardWearCatalog.js의 직업별 장착 스킨 탭(noble/
// clown/guard/doctor/witchHunter) 대응표. frontend/src/domains/library/store/
// roleStatistics.store.js의 JOB_KEY_TO_ROLE_CODE와 정확히 반대 방향의 같은 매핑이다(그
// 파일과 이 파일은 서로 다른 런타임이라 공유 모듈을 쓸 수 없어 각자 独립적으로 든다 —
// ROLE_TEAMS 복제와 같은 관례). buildViewerRoleFields가 이 표로 뷰어 자신의 실제 역할에
// 대응하는 직업 스킨 하나만 accountSkinsByJob에서 골라낸다.
const ROLE_TO_SKIN_JOB_ID = Object.freeze({
    CITIZEN: 'noble',
    JOKER: 'clown',
    DOCTOR: 'doctor',
    GUARD: 'guard',
    WITCH_HUNTER: 'witchHunter',
})

const MIN_SUPPORTED_PLAYERS = 2
const MAX_SUPPORTED_PLAYERS = 10

// 프런트 constants/ingamePlayerTheme.js의 INGAME_PLAYER_THEME_PALETTE 길이와 값이 일치해야
// 한다 — 이 저장소에는 백엔드/프런트가 공유하는 상수 모듈이 없어 수동으로 동기화한다
// (ROLE_TEAMS 복제와 동일한 관례). MAX_SUPPORTED_PLAYERS와 같은 값이므로 한 세션 안에서는
// 색이 항상 서로 다르다(순환 재사용이 일어나지 않는다).
const PLAYER_THEME_PALETTE_SIZE = 10

const INITIAL_GAME_PHASE = 'ROLE_REVEAL' // 아직 밤이 시작되지 않은 역할 확인 단계(사용자 확정)
const INITIAL_DAY_INDEX = 0

// DAY 안에서만 의미를 갖는 하위 구간이다(session.dayPhase). 토론(DAY_DISCUSSION) 중에는
// 투표 제출·집계를 받지 않고, 생존자 전원이 준비를 마치면 투표(DAY_VOTE)가 열린다.
//
// session.phase 자체를 두 값으로 쪼개지 않는 이유: 'DAY'라는 phase 문자열은 이미 채팅 채널
// 라우팅(resolveGameChatChannel의 공개 DAY 채팅)·canIncludeDayTribunalFields·
// computeHasActedThisPhase 등 낮 하위 구간과 무관한 여러 계약의 입력이다. phase는 그대로 두고
// 하위 구간만 별도 필드로 두면 "dayPhase는 phase === 'DAY'일 때만 읽는다"는 한 줄 불변식으로
// 계약이 닫히고, 토론·투표 양쪽에서 공개 채팅이 그대로 열려 있다는 요구도 자동으로 만족된다.
const DAY_PHASES = Object.freeze({ DISCUSSION: 'DAY_DISCUSSION', VOTE: 'DAY_VOTE' })

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
 *
 * DEAD는 퇴역한 채널이다(사망자 전용 채팅). 사망자는 이제 공개 DAY 채널의 관전자일 뿐이라
 * 어떤 경로로도 이 채널로 라우팅되지 않고 수신자도 언제나 0명이다 — resolveGameChatChannel ·
 * getChatRecipientUuids 참고. 상수와 rate limit 필드는 세션 조립·정리 계약(아래
 * CHAT_RATE_LIMIT_FIELD_BY_CHANNEL을 그대로 순회하는 코드들)을 건드리지 않기 위해 남겨 둔다.
 */
const CHAT_CHANNELS = Object.freeze({
    DAY: 'DAY',
    DEAD: 'DEAD',
    ...Object.fromEntries(Object.values(GAME_ROLES).map((role) => [role, role])),
})

// 채널별 rate limit Map은 session 안에서 서로 다른 필드로 완전히 분리해 둔다 — 같은 uuid라도
// 한 채널의 전송이 다른 채널의 간격 판정에 영향을 주지 않는다(채널 격리). roleRevealAcks/
// nightActions와 동일한 이유로 session 객체 안에 두어 세션과 함께 사라지게 한다.
const CHAT_RATE_LIMIT_FIELD_BY_CHANNEL = Object.freeze({
    DAY: 'dayChatRateLimit',
    DEAD: 'deadChatRateLimit',
    ...Object.fromEntries(Object.values(GAME_ROLES).map((role) => [role, 'jokerChatRateLimit'])),
})

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
 * 결정한다(순수 함수 — 어떤 상태도 읽고 바꾸지 않는다). 발행 권한만 판정한다 — 수신 권한은
 * getChatRecipientUuids가 따로 판정하고, 둘의 분업이 "사망자는 읽을 수는 있어도 쓸 수는
 * 없다"를 만든다.
 *   - 생존자: DAY에서만 공개 채팅. 그 외 phase는 INVALID_PHASE.
 *   - 사망자: 어떤 phase에서도 발행할 수 없다(NOT_ELIGIBLE). 사망자는 공개 채널의 관전자이지
 *     발신자가 아니다 — 밤에 사망자끼리 대화가 열리면 밤 동안 정보가 새고(그 밤의 판정 전에
 *     사망 사실·역할이 오간다), 낮에 사망자가 발언하면 산 사람의 토론에 개입하게 된다.
 *     ENDED는 호출 전에 이미 GAME_ALREADY_ENDED로 걸린다.
 * JOKER 비밀 채팅은 이 라우팅에 포함되지 않는다 — 전용 이벤트(prepareJokerChatMessage)가
 * NIGHT·JOKER 진영을 각각 독립적으로 재검증한다(사망한 광대도 그 채널에는 남는다).
 */
function resolveGameChatChannel(session, actor) {
    if (actor.alive !== true) return { ok: false, code: 'NOT_ELIGIBLE' }
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    return { ok: true, channel: CHAT_CHANNELS.DAY }
}

/**
 * 채널별 canonical 수신자 uuid 목록(순수 함수 — session.players를 읽기만 한다).
 *   - DAY: 참가자 전원 — 생존자와 "관전 중인 사망자" 모두. 사망자에게 열리는 것은 수신뿐이고
 *     발행은 resolveGameChatChannel이 따로 거부한다. DAY 채널 자체가 DAY phase에서만
 *     유도되므로, 이 전원 팬아웃이 밤에 사망자에게 이벤트를 흘리는 경로는 없다.
 *   - JOKER: JOKER 진영 전원 — 사망한 광대도 팀 채널의 수신자로 남는다.
 * 그 밖의 채널(퇴역한 DEAD 포함)은 빈 배열이다 — 호출자(소켓 계층)의 "발신자가 수신자에
 * 포함되는가" 검사가 반드시 실패하므로 어떤 메시지도 전달되지 않는다(fail-closed).
 */
function getChatRecipientUuids(session, channel) {
    const uuids = []
    const roleChannel = Object.values(GAME_ROLES).includes(channel)
    for (const player of session.players.values()) {
        if (channel === CHAT_CHANNELS.DAY) {
            uuids.push(player.uuid)
        } else if (roleChannel && player.role === channel) {
            if (player.alive === true || channel === CHAT_CHANNELS.JOKER) uuids.push(player.uuid)
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

/**
 * F-25b: **사망 확정·승패 평가·종료 확정이 실제로 일어난 지점**을 세는 테스트 관찰 통로.
 *
 * "그 시점에는 아직 승패 판정이 시작되지 않았다"(AC-01)와 "정확히 1회만 실행된다"(AC-03)는
 * 호출 횟수에 대한 단언이라, export를 갈아끼우는 방식으로는 셀 수 없다 — 이 모듈 안의
 * lexical 호출(evaluateWinCondition/finalizeGameSession)은 export를 보지 않기 때문이다.
 * 그래서 실제 호출 지점에 관찰자를 두되, production 기본값은 항상 null이라 동작이 없다.
 *
 * 관찰자는 (1) 무엇도 되돌릴 수 없고(throw를 삼킨다), (2) 원자적 커밋 구간을 재진입할 수
 * 없다 — 관찰 중에는 아래 두 커밋이 NIGHT_COMMIT_REENTERED로 즉시 거부된다.
 */
let nightCommitObserver = null
let nightCommitObserverBusy = false

function observeNightCommit(event, detail) {
    if (typeof nightCommitObserver !== 'function') return
    nightCommitObserverBusy = true
    try {
        nightCommitObserver(event, detail)
    } catch (err) {
        // 관찰 실패가 이미 확정된 상태를 되돌리거나 남은 단계를 건너뛰게 하지 않는다.
    } finally {
        nightCommitObserverBusy = false
    }
}

// 세션을 종료 상태로 확정하는 유일한 mutation이다. 신규 상태 객체를 만들지 않고 기존
// session.phase에 'ENDED'를 추가하는 방식을 그대로 따른다 — session.winResult는 이 호출
// 이후에만 존재하며, 그 존재 여부 자체가 "종료됨"을 뜻하는 신호다.
//
// endedAt은 "승패가 확정된 순간"이다. 세 종결 경로(밤 판정·재판 판정·끊김 사망)가 모두 이
// 함수 하나를 거치므로, 저장 레코드의 ended_at이 경로마다 다른 시각으로 갈릴 수 없다.
// 저장이 그보다 늦게(비동기로) 일어나도 기록되는 값은 이 시각 그대로다.
function finalizeGameSession(session, winResult) {
    session.phase = 'ENDED'
    session.winResult = winResult
    session.endedAt = Date.now()
    observeNightCommit('GAME_FINALIZED', { gameId: session.id, winner: winResult?.winner ?? null })
}

// 8개 진입점(prepare 4 + commit 4)이 각자 최상단에서(기존 idempotency 단축 경로보다 먼저)
// 호출하는 공용 guard다. 이미 종료된 세션에 대한 모든 재요청은 예외 없이 이 코드로
// 실패한다 — 저장된 terminal을 포함한 성공 재ACK 경로는 없다.
function assertSessionNotEnded(session) {
    if (session.phase === 'ENDED') return { ok: false, code: 'GAME_ALREADY_ENDED' }
    return { ok: true }
}

// 종료 상태를 클라이언트에 알리기 위한 공개 화이트리스트만 골라낸다(순수 함수, throw 금지).
// role/원본 ballot/Map·Set/socket/repository 객체는 어디에도 포함하지 않는다. winResult는
// 세션에 실제로 존재할 때만(확정된 승자가 있을 때만) 포함한다.
function buildTerminalFields(session) {
    const fields = {
        phase: session.phase,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, isAlive: alive })),
    }
    if (session.winResult) fields.winResult = { ...session.winResult }
    return fields
}

// 완주하지 못한 판의 game_results.winner에 넣는 값. 컬럼이 NOT NULL이라 "승자 없음"도
// 문자열로 표현해야 하고, 팀 이름(CITIZEN/JOKER)과 절대 겹치지 않는 값이어야 한다.
const ABORTED_WINNER = 'NONE'
const ABORTED_WIN_REASON = 'ABORTED'

// evaluateWinCondition의 두 분기와 1:1로 대응하는 사유 문자열이다. winResult 자체에 reason을
// 넣지 않는 이유는 그 객체가 그대로 공개 payload(buildTerminalFields → winResult)로 나가기
// 때문이다 — 저장 전용 필드를 방송 계약에 섞지 않는다.
const WIN_REASON_BY_WINNER = Object.freeze({
    CITIZEN: 'ALL_JOKERS_ELIMINATED',
    JOKER: 'JOKER_PARITY_REACHED',
})

// game_result_players.death_reason에 저장하는 값의 전체 집합. 생존자는 null이다.
const DEATH_REASONS = Object.freeze({
    ASSASSINATION: 'ASSASSINATION',
    EXECUTION: 'EXECUTION',
    DISCONNECT: 'DISCONNECT',
})

// F-10 A-07: 이 판이 운영 직업 통계·랭킹·보상 집계 대상인지는 room.settings나 소켓 payload
// 같은 클라이언트 입력이 아니라 서버 프로세스의 실행 환경으로만 판정한다. buildSessionCandidate가
// 세션 생성 시점에 한 번 호출해 session.gameSource에 고정하므로, 이후 서버가 재시작해
// NODE_ENV가 바뀌어도 이미 만들어진 세션·저장된 결과의 출처는 흔들리지 않는다.
function resolveGameSource() {
    return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

/**
 * 종료된(또는 중단된) 세션을 DB 컬럼 셰이프의 저장용 레코드로 바꾼다. 순수 함수다 —
 * session을 읽기만 하고 registry도 DB도 건드리지 않으며, 반환값은 전부 새 객체라 이후
 * 세션 정리가 레코드를 비워버릴 수 없다(저장이 비동기여도 안전한 이유).
 *
 * completed 판정은 phase만으로 하지 않는다 — 끊김 사망으로 승자가 확정된 판도 ENDED가
 * 되기 때문이다. "ENDED이면서 winResult가 있다"가 완주의 유일한 정의이고, 그 밖은 전부
 * 중단(completed=false)이다.
 *
 * 중단된 판에서는 승패가 없으므로 잔류자의 won은 null(미확정)이다. 반면 스스로 판을 깬
 * 이탈자는 패배로 확정한다(won=false) — 이탈로 통계를 회피할 수 없어야 하기 때문이다.
 * stats는 won이 확정된 참가자에게만 만들어지므로, 잔류자의 전적은 이 판으로 변하지 않는다.
 *
 * @param {object} session - 종료 시점의 GameSession(읽기만 한다)
 * @param {object} [options]
 * @param {boolean} [options.completed] - 정상 승패 확정 여부.
 * @param {string} [options.disconnectedUuid] - 중단시킨 이탈자 uuid.
 * @param {number} [options.endedAt] - 종료 시각(ms). 완주 판은 session.endedAt이 우선한다.
 */
function buildGameResultRecord(session, {
    completed = session.phase === 'ENDED' && !!session.winResult,
    disconnectedUuid,
    endedAt = Date.now(),
} = {}) {
    // F-25b(AC-01): **경기 기록(전적·통계) 조립이 시작된 지점**이다. "킬 직후·치료 판정 전에는
    // 기록 저장이 시작되지 않는다"는 저장소 호출 0회나 DB 0행이 아니라 이 호출의 0회로 판정한다 —
    // 저장소보다 한 단계 앞선 경계라서, 레코드만 조립하고 저장에 실패하는 경우까지 잡아낸다.
    // 관찰자는 production에서 항상 null이므로 이 줄은 동작을 바꾸지 않는다.
    observeNightCommit('RESULT_RECORD_BUILD_STARTED', { gameId: session?.id ?? null, completed })

    const winner = completed ? session.winResult.winner : ABORTED_WINNER
    const resolvedEndedAt = new Date(completed ? session.endedAt ?? endedAt : endedAt)

    const players = []
    const stats = []
    for (const player of session.players.values()) {
        const interruptedLeaver = !completed && player.uuid === disconnectedUuid
        const isAlive = interruptedLeaver ? false : player.alive === true
        const deathReason = isAlive
            ? null
            : interruptedLeaver
                ? DEATH_REASONS.DISCONNECT
                : player.deathReason ?? null
        const team = player.team ?? ROLE_TEAMS[player.role] ?? null
        const won = completed ? team === winner : interruptedLeaver ? false : null

        players.push({
            game_id: session.id,
            user_id: player.uuid,
            nickname_snapshot: player.nickname,
            role: player.role,
            team,
            won,
            is_alive: isAlive,
            death_reason: deathReason,
        })

        // 승패가 확정되지 않은 참가자의 전적은 건드리지 않는다(중단 경기의 잔류자).
        if (won === null) continue
        stats.push({
            user_id: player.uuid,
            total_games: 1,
            survival_count: isAlive ? 1 : 0,
            execution_count: deathReason === DEATH_REASONS.EXECUTION ? 1 : 0,
        })
    }

    return {
        result: {
            id: session.id,
            room_id: session.roomId ?? null,
            started_at: new Date(session.startedAt ?? resolvedEndedAt.getTime()),
            ended_at: resolvedEndedAt,
            winner,
            win_reason: completed ? (WIN_REASON_BY_WINNER[winner] ?? null) : ABORTED_WIN_REASON,
            day_index: session.dayIndex,
            player_count: session.players.size,
            // 타이머 설정과 역할 구성은 "이 판이 어떤 규칙으로 돌았는가"의 전부다. Map/Set이
            // 섞이지 않은 평범한 값만 담아 JSON 컬럼에 그대로 직렬화될 수 있게 한다.
            settings: {
                jokerCount: session.jokerCount ?? null,
                roleComposition: { ...(session.roleComposition ?? {}) },
                timerSettings: {
                    ...(session.timerSettings ?? {}),
                    roleNightActionTimes: { ...(session.timerSettings?.roleNightActionTimes ?? {}) },
                },
                // F-10 A-07: session.gameSource는 세션 생성 시점에 서버 환경으로 고정된 값이다
                // (클라이언트가 채울 수 없다). 버전을 함께 저장해 두면 이후 판정 규칙이 바뀌어도
                // 이미 저장된 과거 레코드의 값을 다시 해석할 수 있다. session.gameSource가 없는
                // 세션(수동으로 조립한 테스트 픽스처 등)은 지금 이 프로세스의 환경으로 대신한다.
                gameSource: { v: 1, value: session.gameSource ?? resolveGameSource() },
            },
            completed,
        },
        players,
        stats,
    }
}

// 순수 조회 — 재접속 시 소켓 계층이 socket.data.activeGameId를 재바인딩하고 기존 channel에
// 재가입하는 데만 쓰는 routing 정보(gameId·channelId)만 반환한다. role/team/ballot 등 비밀
// 정보는 물론, 이 호출로 어떤 권한도 부여되지 않는다(순수 registry 조회일 뿐이다) — 실제
// mutation·disconnect 권한 판정은 소켓 계층의 isCurrentSocketForUuid만 담당한다. uuid가 활성
// GameSession에 속해있지 않으면 null이다.
function getActiveSessionRoutingInfo(uuid) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    return { gameId: session.id, channelId: session.channelId }
}

/**
 * F-24(AC-02): 방 코드가 가리키는 **세션**의 상태만 돌려준다(순수 조회 — 어떤 상태도 바꾸지
 * 않고 절대 throw하지 않는다).
 *
 * 왜 필요한가: 대기방은 시작과 함께 registry에서 사라진다. 그 뒤 그 코드로 들어오려는 요청은
 * 지금까지 **시작 표식**(startedRoomMarks, TTL 30분)만 근거로 사유를 갈랐다 — 표식이 만료되면
 * 아직 진행 중인 판의 코드가 "코드 불일치"가 되고, 같은 코드가 새 방에 재발급될 수도 있었다.
 * 세션 registry는 표식보다 정확하고 TTL도 없다(A-09).
 *
 * 돌려주는 것은 식별자와 단계뿐이다. 참가자·역할·가변 세션 참조는 어디에도 싣지 않는다 —
 * 이 함수는 **입장 판정과 코드 예약**의 입력이지 상태 조회 권한이 아니다.
 *
 * roomId를 함께 주면 코드와 roomId가 **같은 세션**을 가리켜야 한다. 그래야 모든 예약이
 * 소멸한 뒤 같은 코드가 새 방에 재발급됐을 때, 옛 roomId를 들고 온 요청이 새 방으로 흘러
 * 들어가지 않는다.
 *
 * @param {{roomCode?:string, roomId?:string}} [query]
 * @returns {{gameId:string, roomId:string|null, phase:string}|null}
 */
function getRoomCodeSessionState({ roomCode, roomId } = {}) {
    const normalizedCode = typeof roomCode === 'string' ? roomCode.trim() : ''
    if (!normalizedCode) return null
    const expectedRoomId = typeof roomId === 'string' && roomId ? roomId : null

    for (const session of gameSessions.values()) {
        if (session?.roomCode !== normalizedCode) continue
        if (expectedRoomId !== null && session.roomId !== expectedRoomId) continue
        return { gameId: session.id, roomId: session.roomId ?? null, phase: session.phase }
    }
    return null
}

/**
 * 재접속 유예가 만료돼 그 세션에서 배제된 uuid인지 판정한다(순수 조회 — 어떤 상태도 바꾸지
 * 않고 절대 throw하지 않는다). 배제 사실은 session.forfeitedUuids(commitDisconnectElimination이
 * 채우는 Set)에만 존재한다 — playerSession 매핑을 지우는 것만으로는 "한 번도 없던 사람"과
 * "끊겨서 배제된 사람"을 구분할 수 없어 참여 불가 안내를 만들 수 없기 때문이다.
 *
 * 배제된 uuid는 여전히 session.players에 사망자로 남는다(승리 판정·roster·정족수가 그 사실을
 * 읽어야 한다). 달라지는 것은 오직 "그 세션에 다시 들어올 수 있는가"뿐이다.
 */
function isForfeitedFromSession(gameId, uuid) {
    const session = gameSessions.get(gameId)
    if (!session) return false
    return session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)
}

/**
 * F-21(AC-04): 이 uuid가 **그 세션에 아직 참여 중인가**(순수 조회 — 절대 throw하지 않는다).
 *
 * isForfeitedFromSession과 짝이지만 묻는 것이 다르다. 그쪽은 "다시 들어올 수 있는가"이고
 * 이쪽은 "지금 이 판의 구성원인가"다. 추방 대상 판정은 후자여야 한다 — 사망했지만 참여 중인
 * 참가자는 추방할 수 있고(A-06), 이미 빠진 참가자에 대한 신규 추방은 거부해야 한다.
 *
 * isParticipating 키가 없는 구버전 세션 객체는 "참여 중"으로 본다(fail-open) — 그 세션에는
 * 아직 이탈 개념이 없었으므로 roster에 있다는 사실이 곧 참여다.
 */
function isParticipatingInSession(session, uuid) {
    const player = session?.players?.get(uuid)
    if (!player) return false
    if (player.isParticipating === false) return false
    if (session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)) return false
    return true
}

/**
 * 이 disconnect가 "세션 종료"가 아니라 "재접속 유예"로 처리돼야 하는지 판정하고, 그렇다면
 * 대상 세션을 돌려준다(순수 조회). 소켓 계층이 gameSessions에 직접 손대지 않고도 유예 타이머를
 * 걸 수 있게 하는 유일한 통로다.
 *
 * 유예 대상은 ROLE_REVEAL을 포함해 실제 세션이 진행 중인 모든 phase다. 자기 NIGHT 턴이 아닌
 * 구간의 유예는 소켓 계층에서 "현재 top-level phase가 끝날 때" 만료되므로, ROLE_REVEAL 중
 * 끊긴 참가자도 DAY 진입 전까지 돌아올 수 있다. ENDED는 이미 결과가 확정돼 유예할 것이 없다.
 *
 * expectedGameId는 endGameSessionForPlayer와 같은 ABA 가드다(불일치면 null). 이미 죽었거나
 * 이미 배제된 참가자에게는 유예를 걸지 않는다 — 유예 만료의 유일한 결과가 "사망 확정"이므로,
 * 그 결과가 이미 난 사람에게 거는 타이머는 정의상 중복이다.
 */
function getDisconnectGraceTarget(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    if (expectedGameId !== undefined && gameId !== expectedGameId) return null

    const session = gameSessions.get(gameId)
    if (!session) return null
    if (!['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL'].includes(session.phase)) return null

    const player = session.players.get(uuid)
    if (!player || player.alive !== true) return null
    if (isForfeitedFromSession(gameId, uuid)) return null

    return { session }
}

/**
 * F-21(AC-03/AC-05): 이 uuid의 **현재 세션**을 이탈/추방 처리 대상으로 돌려준다(순수 조회 —
 * 어떤 상태도 바꾸지 않고 절대 throw하지 않는다).
 *
 * endGameSessionForPlayer와 같은 ABA 가드를 쓴다: 요청이 가리키는 gameId가 이 계정의 현재
 * 활성 세션과 다르면 null이다 — 그래야 옛 게임을 향한 요청이 새로 시작된 다른 판을 건드리지
 * 않는다. 이미 참여가 끝난 참가자도 null이다(신규 이탈/추방의 대상이 아니다).
 */
function getActiveSessionForDeparture(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    if (expectedGameId !== undefined && gameId !== expectedGameId) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    if (!isParticipatingInSession(session, uuid)) return null
    return session
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
// @param {object} room - 참가자·설정을 담은 Room(읽기만 한다)
// @param {object} [options] - randomFn(역할 셔플)·gameIdFn(세션 id 생성) 주입점
// @flow 입력 검증 → 역할 구성 해석 → 역할 배정 순으로 진행하고, 실패하면 그 자리에서 반환한다.
/**
 * 방 설정에서 "타이머 계층이 읽는 제한시간 값"만 골라 담은 방어적 복사본(초 단위)을 만든다.
 * 세션에 room.settings 전체를 싣지 않는 이유는, 타이머와 무관한 설정이 세션 상태로 새어 들어와
 * 스냅샷·payload 조립에서 실수로 노출될 여지를 아예 없애기 위함이다.
 *
 * 값을 보정하지 않고, 양의 정수가 아니면 null(직업별 값은 키 자체를 생략)로 둔다 — 소비하는
 * 소켓 계층이 그때 canonical 기본 상수로 폴백한다. "잘못된 값을 거부"하는 책임은 이 함수가
 * 아니라 방 생성 검증(utils/createRoomValidation)에 있고, 여기까지 온 값은 이미 그 관문을
 * 통과했거나(정상 경로) 손으로 조립된 값(테스트 픽스처)이다.
 *
 * @param {object|undefined} settings - room.settings(읽기만 한다)
 */
function buildTimerSettings(settings) {
    const positiveInt = (value) => (Number.isInteger(value) && value > 0 ? value : null)

    const rawRoleTimes = settings?.roleNightActionTimes
    const roleNightActionTimes = {}
    if (rawRoleTimes && typeof rawRoleTimes === 'object' && !Array.isArray(rawRoleTimes)) {
        // 밤 턴이 도는 역할만 받는다 — 알 수 없는 키는 조용히 버린다(턴이 없는 역할의 값은
        // 어떤 턴 길이도 바꾸지 못하므로 세션에 남길 이유가 없다).
        for (const role of NIGHT_TURN_ORDER) {
            const seconds = positiveInt(rawRoleTimes[role])
            if (seconds !== null) roleNightActionTimes[role] = seconds
        }
    }

    return {
        dayDiscussionTime: positiveInt(settings?.dayDiscussionTime),
        dayVoteTime: positiveInt(settings?.dayVoteTime),
        nightActionTime: positiveInt(settings?.nightActionTime),
        roleNightActionTimes,
    }
}

/**
 * F-24(AC-04/RESTORE-24): 시작에 실제로 쓰인 서버 확정 설정의 **복원 원본**을 만든다.
 *
 * 세 값만 담는다 — accessType(공개/코드), settingsVersion(그 설정의 확정 버전), settings(허용
 * 목록 사본). 이 셋이 "다음 방을 같은 설정으로 다시 만든다"에 필요한 전부다. 방 식별자·코드·
 * 명단·준비 상태·배정 역할·결과는 담지 않는다(A-02) — 다음 방은 설정만 물려받고 그 밖의
 * 과거 사실은 하나도 물려받지 않는다.
 *
 * 실제 배정 역할이나 실효 타이머를 역산하지 않는다(A-01). 원본은 언제나 **시작 시점의 방
 * 설정**이지, 그 설정을 해석한 결과가 아니다 — 해석 결과를 저장하면 AUTO로 만든 방이 다음
 * 번에는 CUSTOM 고정 구성으로 되살아난다.
 *
 * settings는 buildRoomSettingsView가 허용 목록으로 새로 만든 객체다. room.settings를 그대로
 * 참조하면 그 뒤의 설정 교체가 이미 시작한 판의 원본을 바꾸고, 예전 데이터에 섞인 관전자
 * 키가 그대로 실려 나간다(RESTORE-24).
 *
 * @param {object|undefined} room - 시작에 사용한 대기방(읽기만 한다)
 * @returns {{accessType:string|null, settingsVersion:number|null, settings:object}}
 */
function buildRoomSettingsSource(room) {
    const accessType = room?.accessType === 'open' || room?.accessType === 'code' ? room.accessType : null
    const settingsVersion = Number.isInteger(room?.settingsVersion) ? room.settingsVersion : null
    return { accessType, settingsVersion, settings: buildRoomSettingsView(room?.settings) }
}

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
    // F-21(AC-03): 시작 시점에는 전원이 참여 중이다. assignRoles가 이미 새 객체를 만들었으므로
    // 제자리에서 표시해도 room.players의 참가자 객체는 오염되지 않는다(키를 여기서 붙이는
    // 이유는 assignRoles의 반환 셰이프가 역할 배정 시험의 계약이기 때문이다).
    for (const player of assigned) player.isParticipating = true
    const session = {
        id: gameIdFn(),
        // 전적 저장(game_results.started_at)의 유일한 원천이다. 세션 객체가 만들어지는 이
        // 시점 말고는 "이 판이 언제 시작됐는가"를 나중에 복원할 방법이 없으므로 여기서 찍는다.
        startedAt: Date.now(),
        roomId: room.id,
        // F-24(AC-01/AC-02): 방 코드는 시작과 함께 사라지지 않는다 — 진행 중·종료 직후 화면이
        // "현재 방의 코드"를 보여주는 유일한 원천이고, 코드 재발급 예약(AC-02)의 근거이기도
        // 하다. 대기방이 registry에서 지워진 뒤에는 이 값 말고 그 코드를 아는 곳이 없다.
        roomCode: typeof room.code === 'string' && room.code ? room.code : null,
        // F-24(AC-04): 시작에 실제로 쓰인 서버 확정 설정의 복원 원본(허용 목록 사본).
        roomSettingsSource: buildRoomSettingsSource(room),
        channelId: room.id, // 기존 Socket.IO room(roomId)을 그대로 승계
        // F-21(AC-01): 방장 권한은 시작과 함께 사라지지 않는다 — 진행 중 추방의 유일한 권한
        // 원천이므로 대기방의 현재 방장을 그대로 승계한다. 클라이언트가 임시로 들고 있던 값을
        // 쓰지 않는다. 승계가 없으면 프론트가 store 복사본에 의존해, 새로고침 한 번에 방관리
        // 권한이 사라지거나(복사본 유실) 옛 방장에게 남는다.
        hostUuid: room.hostUuid ?? null,
        // 방 인스턴스와 프로세스 기동도 함께 승계한다. 추방 명령이 "내가 보고 있던 그 판"을
        // 가리키는지 서버가 확인하는 근거이며, 재시작 이후의 옛 명령을 거부하는 값이다.
        roomInstanceId: room.instanceId ?? room.id,
        // 프로세스 기동 식별자. 이 값을 core가 만들지 않고 방에서 승계하는 이유는, 그 값의
        // 소유자가 소켓 계층(kickReceiptStore)이기 때문이다 — core가 따로 만들면 같은 서버
        // 기동인데도 대기방과 게임이 서로 다른 boot을 말하게 된다.
        bootEpoch: room.bootEpoch ?? null,
        // F-21(AC-03/AC-06): "아직 이 판에 참여 중인가"는 생존과 **다른 사실**이다. 사망자도
        // 결과·roster·관전 자격을 위해 참여 중일 수 있고, 추방·이탈한 참가자는 살아 있었더라도
        // 참여가 끝난다. 두 사실을 한 필드로 합치면 사망자 추방이 구조적으로 불가능해진다.
        // 값이 바뀔 때마다 1씩 오르며, 옛 snapshot·ACK가 최신 상태를 되돌리지 못하게 한다.
        participationRevision: 0,
        // F-21(AC-03): **본인 제출 상태 전용** 순서값. participationRevision과 나눈 이유는 그
        // 둘이 다른 사실을 말하기 때문이다 — 이탈은 참여 세대를 올리지만, 그 뒤의 평범한 제출은
        // 참여를 바꾸지 않으므로 세대가 그대로다. 세대만으로 순서를 정하면 그 제출이 이탈 당시의
        // "미제출"을 이길 수 없어 화면이 영영 미제출로 남는다. 개인 전송·스냅샷에 함께 실려
        // 옛 개인 사건·옛 스냅샷이 더 새로운 제출 상태를 되돌리지 못하게 한다.
        selfProgressSeq: 0,
        phase: INITIAL_GAME_PHASE,
        dayIndex: INITIAL_DAY_INDEX,
        // commit 경계(assertValidSessionForCommit)에서 실제 역할 분포와 대조하기 위해
        // jokerCount를 session에 함께 보관한다. resolvedComposition.JOKER를 원천으로 삼아
        // 두 값이 갈릴 여지를 없앤다(AUTO에서는 room.settings.jokerCount와 같은 값이다).
        jokerCount: resolved.composition.JOKER,
        // F-10 A-07: 운영 랭킹·보상 집계 자격의 유일한 판정 시점이다. room.settings는 클라이언트가
        // 채운 값이라 여기서 참조하지 않는다 — resolveGameSource()는 서버 프로세스의 NODE_ENV만
        // 본다. buildGameResultRecord가 이 값을 그대로 결과 레코드에 옮겨 담는다.
        gameSource: resolveGameSource(),
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
        // F-25b: 이번 밤의 **진행 중** 기록(역할별 완료·킬/치료 사건·회복 상태). 확정
        // 결과(nightResolution)와 분리된 서버 내부 전용 자료이며 공개 payload·snapshot 어느
        // 쪽에도 직렬화되지 않는다. 매 NIGHT 진입에서 null로 되돌린다.
        nightProgress: null,
        // DAY 투표/기권 제출을 추적한다. uuid → targetId(참가자 uuid) | null(기권). 커밋
        // 시점엔 항상 빈 Map이어야 하고(assertValidSessionForCommit), NIGHT→DAY 전이마다
        // commitNightResolution이 새 빈 Map으로 교체한다(이전 DAY의 투표를 이어받지 않음).
        // roleRevealAcks/nightActions와 동일한 이유로 세션 객체 안에 둔다.
        dayVotes: new Map(),
        // DAY 하위 구간(DAY_PHASES). ROLE_REVEAL에는 아직 낮이 없다는 뜻으로 null이고,
        // enterDayPhase가 DAY로 들어올 때마다 DAY_DISCUSSION으로 세팅한다. phase가 DAY가
        // 아닌 동안의 값은 어떤 게이트의 입력도 아니다(getDayPhase 주석 참고).
        dayPhase: null,
        // 이 낮의 "투표 시작 준비"를 마친 uuid 집합. 생존자 전원이 모이면 enterDayVotePhase가
        // DAY_VOTE를 연다. roleRevealAcks/nightActions와 동일한 이유로 세션 객체 안에 두고,
        // enterDayPhase가 매 낮마다 새 Set으로 교체한다(지난 낮의 준비를 이어받지 않음).
        dayVoteReadyUuids: new Set(),
        // 이 dayIndex의 투표 라운드. 1이 최초 투표, 2가 동점 재투표다(동점 재투표는 phase를
        // DAY에 그대로 둔 채 이 값만 올린다 — 밤 턴 구조·타이머를 건드리지 않기 위함).
        dayVoteRound: 1,
        // 이번 라운드에서 후보 자격이 없는 uuid 집합. 최초 투표에서는 항상 비어 있고, 동점
        // 재투표에서만 직전 라운드의 동점자들로 채워진다(그 동점자에게는 투표할 수 없다).
        dayVoteExcludedUuids: new Set(),
        // 이 dayIndex의 DAY 투표 판정 완료 표식이자 결과. null이면 아직 판정 전이다. 값이
        // 있으면 { dayIndex, round, outcome, tribunalTargetUuid, publicVoteCount,
        // publicAbstainCount, excludedUuids, revoteExcludedUuids } 형태이고, 그 dayIndex·라운드에
        // 대한 재판정·재제출을 막는 유일한 근거가 된다(commitNightResolution이 dayVotes를 새 빈
        // Map으로 교체할 때도 이 필드는 그대로 둔다 — 이전 낮의 판정 기록이므로).
        dayVoteResolution: null,
        // TRIBUNAL 단계의 피고 정보. commitDayVoteResolution이 outcome:'TRIBUNAL'일 때만 채운다.
        tribunal: null,
        // F-16(AC-01/AC-04): 낮 투표 "제출" 효과음 사건의 actor별 메타데이터.
        // uuid → { dayIndex, round, targetId, revision, eventId(불변) }.
        // dayVotes와 같은 이유로 세션 객체 안에 둔다 — 세션이 registry에서 지워지면 함께
        // 사라지고, 다른 세션의 사건 번호와 절대 섞이지 않는다.
        dayVoteSfx: new Map(),
        // 이 방의 제한시간 설정(초). 밤 턴 타이머와 낮 페이즈 타이머가 길이를 정할 때 읽는
        // 유일한 출처이며, 값이 없으면 소비하는 쪽이 canonical 기본 상수로 폴백한다.
        timerSettings: buildTimerSettings(room.settings),
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
// @param {object} session - 커밋 직전의 GameSession 후보(읽기만 한다)
// @flow 필드별 검사를 순서대로 수행하고, 어긋나는 즉시 Error를 던진다(반환값 없음).
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
    // 투표 라운드/제외 집합도 dayVotes와 동일한 이유로 커밋 시점엔 항상 "최초 투표" 상태여야
    // 한다 — 재투표 중간 상태로 시작하는 세션은 존재할 수 없다.
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
    // F-14(AC-04): accountSkinsByJob은 matchmaking.js captureRoomStartProfiles가 계정의
    // 직업별 스킨 선택 전체를 세션 내부용으로 실어 둔 비공개 필드다(own-property 존재
    // 여부로만 판정 — 아직 이 필드를 보장하지 않는 참가자도 있을 수 있다,
    // buildPlayerAccountProfileFields의 관례와 동일). 여기서 뷰어 자신의 실제 role에
    // 대응하는 값 하나만 꺼내 self에 싣는다 — 다른 4개 직업의 선택은(자신의 것이라도)
    // 절대 내려보내지 않는다. 그 값 자체가 own-property로 없으면(아직 그 직업을 한 번도
    // 장착한 적 없는 계정) accountSkinId 키 자체를 만들지 않는다 — undefined를 명시적으로
    // 내려보내 "빈 문자열도 아니고 null도 아닌 이상한 값"을 클라이언트가 다뤄야 하는 일이
    // 없게 한다.
    const skinJobId = ROLE_TO_SKIN_JOB_ID[viewer.role]
    const accountSkinsByJob = Object.hasOwn(viewer, 'accountSkinsByJob') ? viewer.accountSkinsByJob : null
    const hasAccountSkin = Boolean(skinJobId) && Object.hasOwn(accountSkinsByJob ?? {}, skinJobId)
    return {
        uuid: viewer.uuid,
        nickname: viewer.nickname,
        role: viewer.role,
        team: ROLE_TEAMS[viewer.role],
        ...(hasAccountSkin ? { accountSkinId: accountSkinsByJob[skinJobId] } : {}),
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
 * dayVotes는 매번 새 빈 Map으로 교체한다 — 이전 DAY의 투표/기권을 이어받지 않는다. 투표
 * 라운드 상태(dayVoteRound/dayVoteExcludedUuids)도 같은 이유로 "최초 투표"로 되돌린다 —
 * 지난 낮의 재투표 제외 목록이 새 낮의 후보를 막으면 안 된다.
 *
 * 하위 구간도 같은 원칙으로 함께 초기화한다: 새 낮은 언제나 토론(DAY_DISCUSSION)부터 시작하고
 * dayVoteReadyUuids는 새 빈 Set으로 교체된다 — 지난 낮의 준비 기록이 이월돼 토론 없이 곧바로
 * 투표가 열리는 일이 구조적으로 생기지 않는다(DAY 진입점이 이 함수 하나뿐이기 때문이다).
 * dayVoteResolution/tribunal은 여기서 건드리지 않는다: 둘 다 "그 dayIndex의 기록"이고,
 * 이 함수가 dayIndex를 전진시키는 순간 dayIndex 일치 검사(prepareDayVoteResolution의
 * alreadyResolved 판정, buildSessionSnapshot의 노출 게이트)에서 자동으로 무효가 된다.
 * 최초 전이 시점에는 애초에 둘 다 null이다(buildSessionCandidate).
 *
 * 호출자는 이 함수를 부르기 전에 승리 조건 판정을 끝내야 한다 — 승자가 확정된 밤은 DAY로
 * 넘어가지 않고 그대로 ENDED가 된다(commitNightResolution 참고).
 *
 * @param {object} session - canonical GameSession(이 함수가 직접 변형한다)
 */
function enterDayPhase(session) {
    session.phase = 'DAY'
    session.dayIndex += 1
    session.dayPhase = DAY_PHASES.DISCUSSION
    session.dayVoteReadyUuids = new Set()
    session.dayVotes = new Map()
    session.dayVoteRound = 1
    session.dayVoteExcludedUuids = new Set()
    // F-16: 지난 낮의 투표 제출 사건 메타데이터는 새 낮으로 이어지지 않는다. 남겨 두어도
    // advanceDayVoteSfx가 dayIndex 불일치로 무시하지만, 세션 수명 동안 쌓이지 않게 함께 비운다.
    session.dayVoteSfx = new Map()
}

/**
 * 이 세션의 현재 DAY 하위 구간(알려진 두 값이 아니면 토론으로 본다).
 *
 * 기본값이 DAY_DISCUSSION인 것은 fail-closed다 — 손으로 조립됐거나 오염돼 하위 구간을 알 수
 * 없는 session에서는 투표를 열지 않는 쪽이 안전하다("모르면 투표를 받지 않는다"). getDayVoteRound/
 * getDayVoteExcludedUuids와 같은 위치·같은 관례다. 이 값은 phase === 'DAY'일 때만 의미가 있다 —
 * 낮을 벗어난 phase에서는 어떤 게이트도 이 값을 읽지 않는다.
 * @param {object} session - canonical GameSession(읽기만 한다)
 */
function getDayPhase(session) {
    return session.dayPhase === DAY_PHASES.VOTE || session.dayPhase === DAY_PHASES.DISCUSSION
        ? session.dayPhase
        : DAY_PHASES.DISCUSSION
}

/**
 * DAY_DISCUSSION→DAY_VOTE 전이의 유일한 canonical mutation이다.
 *
 * dayVotes/dayVoteRound/dayVoteExcludedUuids는 건드리지 않는다 — enterDayPhase가 이미 이 낮의
 * 투표 상태를 세팅해 두었고, 이 함수는 "그 투표를 언제부터 받을지"만 연다. 준비 집합은 전이
 * 이후 의미가 없으므로 비운다(다음 낮의 준비는 enterDayPhase가 다시 새 Set으로 시작한다).
 * @param {object} session - canonical GameSession(이 함수가 직접 변형한다)
 */
function enterDayVotePhase(session) {
    session.dayPhase = DAY_PHASES.VOTE
    session.dayVoteReadyUuids = new Set()
}

/**
 * 이 세션의 현재 DAY 투표 라운드(정수가 아니면 최초 투표인 1로 본다).
 * 손으로 조립된(신규 필드가 없는) session도 이 접근자를 통해 항상 유효한 라운드를 갖는다.
 * @param {object} session - canonical GameSession(읽기만 한다)
 */
function getDayVoteRound(session) {
    return Number.isInteger(session.dayVoteRound) && session.dayVoteRound >= 1 ? session.dayVoteRound : 1
}

/**
 * 이번 라운드에서 후보 자격이 없는 uuid 집합(Set이 아니면 빈 Set — fail-open이 아니라
 * "제외가 없다"는 최초 투표의 기본 상태다).
 * @param {object} session - canonical GameSession(읽기만 한다)
 */
function getDayVoteExcludedUuids(session) {
    return session.dayVoteExcludedUuids instanceof Set ? session.dayVoteExcludedUuids : new Set()
}

/**
 * resolution이 몇 번째 라운드의 판정인지(round가 정수가 아니면 최초 투표인 1로 본다).
 * @param {object} resolution - prepareDayVoteResolution이 만든(또는 그 형태의) 판정 객체
 */
function getResolutionRound(resolution) {
    return Number.isInteger(resolution?.round) && resolution.round >= 1 ? resolution.round : 1
}

/**
 * session.id에서 결정적으로 유도한 팔레트 인덱스 순열(길이 PLAYER_THEME_PALETTE_SIZE).
 *
 * Math.random을 쓰지 않는 이유: 이 함수를 소비하는 buildGameStartedPayload는 참가자 1명당
 * 한 번씩 호출되므로(socket/matchmaking.js), 호출마다 값이 달라지면 뷰어별로 같은 참가자가
 * 다른 색을 받는다. session.id는 crypto.randomUUID()라 게임마다 사실상 무작위이면서 한 게임
 * 안에서는 모든 뷰어에게 동일하다 — FNV-1a로 접은 seed + mulberry32 PRNG로 Fisher-Yates
 * 셔플하면 "게임마다 무작위, 뷰어끼리 동일"을 함께 만족한다.
 * @param {object} session - id를 가진 GameSession
 * @flow id를 32bit seed로 접고 → 그 seed의 PRNG로 팔레트 인덱스 배열을 뒤에서부터 교환한다.
 */
function buildPlayerThemeIndices(session) {
    const id = typeof session?.id === 'string' ? session.id : ''
    let seed = 0x811c9dc5
    for (let i = 0; i < id.length; i += 1) {
        seed ^= id.charCodeAt(i)
        seed = Math.imul(seed, 0x01000193) >>> 0
    }

    const nextRandom = () => {
        seed = (seed + 0x6d2b79f5) >>> 0
        let t = seed
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const indices = Array.from({ length: PLAYER_THEME_PALETTE_SIZE }, (_, index) => index)
    for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(nextRandom() * (i + 1))
        const swap = indices[i]
        indices[i] = indices[j]
        indices[j] = swap
    }
    return indices
}

// F-13(AC-05): 계정 프로필 이미지(사진·테두리)는 role과 달리 비밀이 아니라 모든 참가자에게
// 동일하게 공개되는 정보다 — themeIndex와 같은 이유로 game_started·재접속 스냅샷 양쪽의
// 공용 players[]에 실어 보낸다. 다만 이 두 필드는 아직 모든 세션 참가자에게 보장되지
// 않는다(A-04: 방 참가자 객체에 계정 로드아웃을 실어 보내는 업스트림 배선은 이 슬라이스
// 범위 밖) — 그런 참가자까지 억지로 기본값을 만들어 채우면 "서버가 실제로 아는 값"과
// "그냥 채워 넣은 기본값"을 클라이언트가 구분할 수 없게 되므로, F1305
// mergeSourcePlayerWithPreview.js의 조건부 복사 관례와 동일하게 실제로 값을 가진 필드만
// 옮긴다(own-property 존재 여부로 판정 — undefined를 명시적으로 대입한 경우까지 포함해
// 그대로 옮긴다는 뜻이다).
function buildPlayerAccountProfileFields(player) {
    return {
        ...(Object.hasOwn(player, 'accountProfilePhotoId') ? { accountProfilePhotoId: player.accountProfilePhotoId } : {}),
        ...(Object.hasOwn(player, 'accountProfileBorderId') ? { accountProfileBorderId: player.accountProfileBorderId } : {}),
        // F-14(AC-01/AC-04): 장착한 플레이어 카드 프레임은 직업 스킨과 달리 비밀이 아니다 —
        // 어떤 역할이든 같은 카드 프레임을 선택할 수 있으므로 이 값만으로는 역할을 추론할 수
        // 없다(프로필 사진·테두리와 같은 공개 계약). accountSkinsByJob(직업별 전체 맵)은
        // 절대 이 함수에 실지 않는다 — 그러면 본인이 아닌 참가자의 직업별 스킨 선택이
        // 전원에게 노출되어, 인게임에 실제로 렌더되는 스킨과 대조해 역할을 역산할 수 있다.
        ...(Object.hasOwn(player, 'accountCardFrameId') ? { accountCardFrameId: player.accountCardFrameId } : {}),
    }
}

/**
 * 특정 참가자 시점의 game_started payload. 다른 참가자의 role은 절대 포함하지 않는다.
 * players[].themeIndex는 프런트 표시 색상 배정으로, 색을 클라이언트가 각자 추첨하면 같은
 * 참가자가 화면마다 다른 색으로 보이므로 서버가 배정해 내려준다(role과 달리 비밀이 아니다).
 * players[].accountProfilePhotoId/accountProfileBorderId도 같은 이유로 공개 필드다(F-13 AC-05).
 * @param {object} session - commit된(또는 candidate) GameSession
 * @param {string} viewerUuid - 이 payload를 받을 참가자 uuid
 */
/**
 * F-24(AC-04/RESTORE-24): 세션이 들고 있는 복원 원본을 **매 호출마다 새 구조**로 꺼낸다.
 *
 * game_started와 get_session_snapshot이 같은 함수를 쓰므로, 최초 진입과 재접속이 서로 다른
 * 모양의 원본을 받는 일이 없다. 중첩 객체(roleCounts·roleNightActionTimes)까지 허용 목록으로
 * 다시 만들기 때문에, 응답을 변형해도 세션이 오염되지 않고 오염된 세션 값이 나가지도 않는다.
 *
 * 원본이 없는(구버전) 세션은 키 자체를 만들지 않는다 — undefined를 명시적으로 내려보내
 * "없다"와 "빈 설정"을 클라이언트가 구별해야 하는 상황을 만들지 않는다. 없는 원본은 복원
 * 불가이고, 지난 게임의 원본으로 보충하지 않는다.
 */
function buildRoomSettingsSourceFields(session) {
    const source = session?.roomSettingsSource
    if (source === null || typeof source !== 'object' || Array.isArray(source)) return {}
    return {
        roomSettingsSource: {
            accessType: source.accessType ?? null,
            settingsVersion: Number.isInteger(source.settingsVersion) ? source.settingsVersion : null,
            settings: buildRoomSettingsView(source.settings),
        },
    }
}

function buildGameStartedPayload(session, viewerUuid) {
    const viewer = session.players.get(viewerUuid)
    const themeIndices = buildPlayerThemeIndices(session)
    return {
        gameId: session.id,
        state: {
            id: session.id,
            phase: session.phase,
            dayIndex: session.dayIndex,
            // F-21(AC-01): 방장과 참여 세대는 공개 값이다 — snapshot과 **같은 필드**를 실어,
            // 시작 직후 화면과 새로고침 후 화면이 같은 근거로 방관리 권한을 판정하게 한다.
            //
            // roomId·roomInstanceId·bootEpoch는 진행 중 추방 요청이 "내가 보고 있던 그 판"을
            // 가리킨다는 것을 서버가 확인하는 입력이다(kick_game_player의 필수 필드). 방 코드나
            // 참가자 명단이 아니라 식별자뿐이라 새로 드러나는 비밀이 없다.
            hostUuid: session.hostUuid ?? null,
            roomId: session.roomId ?? null,
            roomInstanceId: session.roomInstanceId ?? null,
            bootEpoch: session.bootEpoch ?? null,
            // F-24(AC-01): 진행 중 "방 코드 보기"의 유일한 원천. 대기방 payload와 달리 이 값은
            // 참가자 본인에게만 가는 개인 payload에 실린다 — 그 판의 참가자는 이미 코드를 알고
            // 들어왔거나 방장이므로 새로 드러나는 비밀이 없다.
            roomCode: session.roomCode ?? null,
            // F-24(AC-04/RESTORE-24): 다음 방 설정 복원의 원본. 다른 참가자의 비밀 역할은
            // 여기에도 self에도 추가하지 않는다 — 설정값만 담긴 허용 목록 사본이다.
            ...buildRoomSettingsSourceFields(session),
            participationRevision: session.participationRevision ?? 0,
            // session.players는 Map이라 순회 순서가 모든 뷰어에게 동일하다 — 같은 index는
            // 곧 같은 참가자이므로 뷰어끼리 배정이 갈리지 않는다.
            players: [...session.players.values()].map((player, index) => ({
                uuid: player.uuid,
                nickname: player.nickname,
                themeIndex: themeIndices[index % PLAYER_THEME_PALETTE_SIZE],
                // 생존과 참여를 처음부터 함께 내려보낸다. 예전에는 프론트가 "시작 시점에는
                // 전원 생존"이라고 스스로 단정했고, 그 단정이 재접속·이탈과 어긋났다.
                isAlive: player.alive === true,
                isParticipating: player.isParticipating !== false,
                membershipId: player.membershipId ?? null,
                ...buildPlayerAccountProfileFields(player),
            })), // role 없음
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
    // F-21(AC-03): 분모는 roster 전체가 아니라 **아직 참여 중인** 참가자다. 추방·이탈한
    // 참가자는 session.players에 남지만 확인을 보낼 수 없으므로, roster 크기와 비교하면 그
    // 세션은 영영 ROLE_REVEAL에 갇힌다(사람 수만 세던 예전 비교의 유일한 실패 모드다).
    if (isRoleRevealComplete(session)) {
        enterDayPhase(session)
        return { ok: true, transitioned: true, session }
    }
    return { ok: true, transitioned: false, session }
}

/** 아직 참여 중인 참가자 전원이 역할 확인을 마쳤는가(순수 계산). 참여자가 없으면 false다. */
function isRoleRevealComplete(session) {
    const pending = [...session.players.values()].filter((player) => isParticipatingInSession(session, player.uuid))
    if (pending.length === 0) return false
    return pending.every((player) => session.roleRevealAcks.has(player.uuid))
}

/**
 * F-21(AC-03): 이탈로 분모가 줄어 **이미 충족된** 단계 완료를 정확히 한 번 진행시킨다.
 *
 * 이탈 자체는 페이즈 전이가 아니다 — 그래서 여기서는 "남은 사람만으로 이미 조건이 찼는가"만
 * 묻고, 차 있으면 기존 전이 헬퍼(enterDayPhase·enterDayVotePhase)를 그대로 부른다. 새 전이
 * 규칙을 만들지 않으므로 이탈이 없는 라운드의 기존 계약(전원 투표해도 deadline까지 대기 등)은
 * 그대로다. DAY_VOTE 집계와 밤 턴 완료는 이미 소켓 계층의 prepare/commit·방송 기계가
 * 소유하므로 여기서 건드리지 않는다.
 *
 * @returns {{transitioned: null|'DAY'|'DAY_VOTE'}}
 */
function advanceStalledPhaseAfterDeparture(session) {
    if (session.phase === 'ROLE_REVEAL') {
        if (!isRoleRevealComplete(session)) return { transitioned: null }
        enterDayPhase(session)
        return { transitioned: 'DAY' }
    }
    if (session.phase === 'DAY' && getDayPhase(session) === DAY_PHASES.DISCUSSION) {
        const eligibleUuids = getEligibleDayVoterUuids(session)
        if (eligibleUuids.length === 0) return { transitioned: null }
        const readyUuids = session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
        if (!eligibleUuids.every((uuid) => readyUuids.has(uuid))) return { transitioned: null }
        enterDayVotePhase(session)
        return { transitioned: 'DAY_VOTE' }
    }
    return { transitioned: null }
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

/**
 * 이 역할의 밤 행동 대상이 "생존자"여야 하는지 판정한다(순수 계산 — ROLE_DEFINITIONS만 읽는다).
 * targetMustBeAlive가 명시적으로 false인 역할(WITCH_HUNTER)만 사망자를 지목할 수 있고, 그 외
 * 전부(정의가 없는 알 수 없는 role 포함)는 생존 대상을 요구한다 — 기본값을 true로 두어
 * fail-closed로 만든다.
 * @param {string} role - 판정할 역할 키
 */
function requiresAliveTarget(role) {
    return ROLE_DEFINITIONS[role]?.targetMustBeAlive !== false
}

// registry(session.players)를 읽기만 하는 순수 계산 — 이 밤에 행동 가능한 "생존한" 참가자
// uuid를 반환한다. 제출 완료 여부와는 무관하다(session.nightActions는 참조하지 않는다).
//
// 생존 검사가 이 함수의 계약에 포함되는 이유: prepareNightResolution의 제출 완료 판정이 이
// 목록 하나만 보므로, 사망자가 남아 있으면 그가 제출하지 않는 한 밤이 영원히
// ACTIONS_PENDING으로 막힌다(교착). getEligibleDayVoterUuids가 생존자만 돌려주는 것과 같은
// 원칙이며, submitNightAction의 ACTOR_NOT_ALIVE 거부와 짝을 이룬다.
function getEligibleNightActorUuids(session) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive !== true) continue
        if (isEligibleForNightAction(player.role, session.dayIndex)) uuids.push(player.uuid)
    }
    return uuids
}

// 한 밤 안에서 역할 턴이 도는 canonical 순서다 — 광대(JOKER)가 먼저 표적을 고르고, 의사·경비원이
// 뒤따르며, 마지막이 WITCH_HUNTER다. 밤 진행 순서를 표현하는 값은 이것 하나뿐이므로 소켓 계층의
// 턴 오케스트레이터도 테스트도 여기만 읽는다.
//
// 이 순서는 "그 밤에 실제로 행동할 수 있는 역할"이 아니라 "턴이 도는 역할" 전부를 담는다 —
// dayIndex 때문에 아직 능력이 없는 WITCH_HUNTER(nightActionMinDayIndex: 2)나 전원 사망한 역할도
// 턴 자체는 똑같이 돈다. 턴이 도는지 여부가 생존·역할 정보를 흘리지 않게 하려는 것이며,
// isEligibleForNightAction은 그 턴 안에서 누가 제출할 수 있는지만 가른다.
const NIGHT_TURN_ORDER = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

// 턴 하나의 제한시간. night_turn_started.deadline과, 생존 actor가 없는 턴의 무작위 지연 범위가
// 모두 이 값 하나에서 유도된다(두 곳이 다른 기준을 쓰면 지연 길이만으로 전멸 여부가 새어나간다).
const NIGHT_TURN_DURATION_MS = 30_000

// 낮 하위 구간의 기본 제한시간. 방 설정(timerSettings.dayDiscussionTime/dayVoteTime)이 없거나
// 형태가 어긋난 세션에서만 쓰이는 폴백이며, 값은 설정 UI의 기본값(각 60초)과 같다 — 두 값이
// 갈리면 "설정을 건드리지 않은 방"과 "손으로 조립된 세션"의 낮 길이가 서로 달라진다.
const DAY_DISCUSSION_DURATION_MS = 60_000
const DAY_VOTE_DURATION_MS = 60_000

/**
 * night_turn_started 공용 payload. 이 밤에 그 역할의 생존 actor가 있든 없든 정확히 같은 필드와
 * 같은 값 형태를 만든다 — 생존 정보를 인자로 받지도 않고 session에서 유도하지도 않으므로,
 * 죽은 직업의 턴과 산 직업의 턴이 payload만으로는 구별되지 않는다. deadline은 호출자가 계산한
 * 절대시각(ms)이며, 실제 종료가 그보다 이를 수 있다는 사실 자체는 payload에 담기지 않는다.
 */
function buildNightTurnStartedPayload(session, role, deadline) {
    return { gameId: session.id, dayIndex: session.dayIndex, role, deadline }
}

/**
 * night_turn_ended 공용 payload. started와 같은 이유로 생존 정보를 받지 않으며, 종료 사유(전원
 * 제출 / 무인 지연)도 담지 않는다 — 사유를 실으면 그 값 자체가 곧 전멸 신호가 된다.
 */
function buildNightTurnEndedPayload(session, role) {
    return { gameId: session.id, dayIndex: session.dayIndex, role }
}

// 이 밤에 그 역할로 행동해야 할 "생존" actor uuid만 좁혀서 반환한다. 분모를
// getEligibleNightActorUuids 위에 얹어 계산하므로, 턴 종료 판정이 보는 목록과
// prepareNightResolution의 제출 완료 판정이 보는 목록이 갈릴 수 없다.
function getAliveActorUuidsForRole(session, role) {
    return getEligibleNightActorUuids(session).filter((uuid) => session.players.get(uuid)?.role === role)
}

/**
 * 그 역할의 생존 actor 전원이 이번 밤 제출을 마쳤는지 판정한다.
 *
 * 세는 기준은 session.nightActions.has(uuid) 하나다(값이 아니라 키의 존재) — SKIP(targetId
 * null)도 submitNightAction이 정식으로 기록하므로 여기서 자동으로 제출로 계산된다. 반대로
 * JOKER가 동료를 지목한 경우는 submitNightAction이 기록 없이 ok만 돌려주는 no-op이라 제출로
 * 세지 않는다 — prepareNightResolution의 ACTIONS_PENDING 검사도 같은 has() 기준이므로, 여기서
 * 세는 방식과 밤 판정이 요구하는 조건이 정확히 일치한다.
 *
 * 생존 actor가 하나도 없으면 공집합이라 참이 된다. 호출자는 그 경우를 "전원 제출"로 다루면
 * 안 된다(무인 턴은 별도의 지연 경로로 끝나야 한다) — getAliveActorUuidsForRole로 먼저 갈라야 한다.
 */
function isRoleTurnComplete(session, role) {
    for (const actorUuid of getAliveActorUuidsForRole(session, role)) {
        if (!session.nightActions.has(actorUuid)) return false
    }
    return true
}

/**
 * 지금 진행 중인 밤 턴의 역할을 반환한다. 턴 시퀀서가 돌고 있지 않으면(세션에 턴 상태가 아예
 * 없으면) null이다 — submitNightAction의 턴 검사는 이 null을 "턴 제약 없음"으로 해석하므로,
 * 시퀀서 없이 밤을 직접 조립하는 경로(테스트 픽스처·기존 흐름)의 제출은 그대로 통과한다.
 */
function getCurrentNightTurnRole(session) {
    return session.nightTurnRole ?? null
}

/**
 * 역할 → 그 역할의 제출이 서로 어긋났을 때의 판정 정책. 밤 행동 판정에서 역할을 가르는 값은
 * 이 표 하나뿐이며, 리졸버 본문에는 역할 이름이 등장하지 않는다(정책을 코드가 아니라 데이터로
 * 두어야 새 역할이 생겨도 분기가 늘지 않는다).
 *
 * - PLURALITY: 최다 득표 대상 하나. 동률(2명 이상이 공동 최다)이면 null이다. JOKER의 기존
 *   다수결 계약이 그대로 이 정책 하나로 옮겨온 것이라, 광대의 판정 결과는 비트 단위로 같다.
 * - UNANIMOUS: 유효한 제출이 전부 같은 대상일 때만 그 대상. 하나라도 다르면 null이다 —
 *   같은 역할을 여러 명이 가졌을 때 "누구의 제출이 이겼는지"를 만들지 않기 위한 정책이다.
 *
 * 표에 없는 역할(CITIZEN·알 수 없는 값)은 UNANIMOUS로 처리된다 — 애초에
 * getEligibleNightActorUuids가 행위자를 하나도 돌려주지 않아 결과는 항상 null이지만,
 * 기본값은 fail-closed 쪽으로 둔다(requiresAliveTarget과 같은 원칙).
 */
const NIGHT_ACTION_RESOLUTION_POLICY = Object.freeze({
    JOKER: 'PLURALITY',
    DOCTOR: 'UNANIMOUS',
    GUARD: 'UNANIMOUS',
    WITCH_HUNTER: 'UNANIMOUS',
})

/**
 * 이번 밤 그 역할의 "행동할 수 있는 생존 행위자"와 각자의 제출을 모아 반환한다
 * ([{ actorUuid, target }] — target은 대상 uuid 또는 SKIP/미제출을 뜻하는 null).
 *
 * 행위자 목록은 getAliveActorUuidsForRole 하나에서만 나온다 — 즉 생존 필터도, dayIndex
 * eligibility(WITCH_HUNTER)도 여기서 다시 구현하지 않는다. 제출 완료 판정(prepareNightResolution)·
 * 턴 완료 판정(isRoleTurnComplete)과 같은 목록 위에 서므로 세 소비자의 경계가 갈릴 수 없다.
 *
 * 미제출(entry 없음)은 SKIP(null)과 같은 null로 접힌다 — 판정에 도달한 밤은 eligible actor
 * 전원의 제출이 이미 확인된 상태라(ACTIONS_PENDING) 둘을 가를 실익이 없고, 기존 집계 함수들도
 * 모두 두 값을 같게 다뤄왔다.
 *
 * excludedActorUuids(F-25a)는 기본값이 빈 Set이라 기존 2-인자 호출은 전혀 영향받지 않는다 —
 * prepareNightResolution의 순차 처리만 이 인자로 "이번 밤 공격받고 아직 치료받지 못한" 행위자를
 * 그 단계의 집계에서 뺀다(회복 여부는 canonical player.alive가 아니라 그 판정 호출 안의
 * recoveryStates가 가른다). 대상(target) 선택 규칙에는 영향이 없고 행위자 쪽만 좁힌다.
 */
function collectRoleNightSubmissions(session, role, excludedActorUuids = new Set()) {
    return getAliveActorUuidsForRole(session, role)
        .filter((actorUuid) => !excludedActorUuids.has(actorUuid))
        .map((actorUuid) => ({
            actorUuid,
            target: session.nightActions.get(actorUuid) ?? null,
        }))
}

/**
 * 그 역할의 이번 밤 canonical 행동 대상 하나를 판정한다(순수 계산 — registry를 읽기만 한다).
 * 암살·보호·조사·확인이 모두 이 한 함수를 거치므로, "같은 역할을 여러 명이 가졌을 때"의 규칙이
 * 역할마다 갈릴 수 없다.
 *
 * SKIP/미제출은 집계에서 제외하고, 유효한 제출이 하나도 없으면 null이다. 남은 제출이 서로
 * 어긋날 때의 처리만 NIGHT_ACTION_RESOLUTION_POLICY가 가른다. 반환값이 null이면 "이번 밤 그
 * 역할의 행동은 없었다"는 뜻이고, 호출자는 결과를 만들지 않는다.
 *
 * 대상의 존재·생존은 여기서 검사하지 않는다 — prepareNightResolution이 requiresAliveTarget
 * 기준으로 이미 걸러낸 뒤에만 호출되기 때문이다(TARGET_NOT_A_PARTICIPANT).
 *
 * @param {object} session - canonical GameSession(players/nightActions/dayIndex를 읽기만 한다)
 * @param {string} role - 판정할 역할 키
 * @param {Set<string>} [excludedActorUuids] - 이번 집계에서 뺄 행위자(F-25a 회복 대기 배제).
 *   기본값은 빈 Set이라 이 인자를 생략하는 기존 호출의 결과는 전혀 달라지지 않는다.
 * @returns {string|null} canonical 대상 uuid 또는 null
 */
function resolveRoleNightAction(session, role, excludedActorUuids = new Set()) {
    const targets = collectRoleNightSubmissions(session, role, excludedActorUuids)
        .map((submission) => submission.target)
        .filter((target) => target !== null)
    if (targets.length === 0) return null

    if (NIGHT_ACTION_RESOLUTION_POLICY[role] !== 'PLURALITY') {
        // UNANIMOUS — 하나라도 다르면 그 역할의 이번 밤 행동은 없던 것이 된다.
        return targets.every((target) => target === targets[0]) ? targets[0] : null
    }

    // PLURALITY — Map 순회 순서에 의존하지 않도록 득표수 자체만 비교한다(먼저 등장한 대상이
    // 아니라, 오직 표 수만으로 승자를 가린다).
    const voteCounts = new Map()
    for (const target of targets) voteCounts.set(target, (voteCounts.get(target) ?? 0) + 1)

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

// ── F-25b: 밤 진행 자료(session.nightProgress) ───────────────────────────────
//
// 확정 결과(session.nightResolution)와 **분리된** 서버 내부 전용 기록이다. 역할 턴이 하나씩
// 끝날 때마다(completeNightRole) 그 역할의 결과·사건·완료 표식이 여기에 쌓이고, 밤 전체가
// 끝난 뒤의 최종 준비(prepareNightResolutionForSession)가 이 기록 하나만 읽어 확정 resolution을
// 만든다. 공개 payload·snapshot 어느 쪽도 이 객체를 직렬화하지 않는다(A-02).
//
// 이 기록이 canonical player.alive를 절대 바꾸지 않는다는 것이 F-25b의 핵심이다 — 광대가
// 지목한 대상은 밤이 최종화될 때까지 alive:true로 남고(임시 사망), 그래서 그 전 시점의
// 승패 판정·경기 종료·전적 저장이 시작될 수 없다(AC-01).
const NIGHT_RECOVERY_STATES = Object.freeze({
    PENDING_RECOVERY: 'PENDING_RECOVERY',
    RECOVERED: 'RECOVERED',
    DEATH_CANDIDATE: 'DEATH_CANDIDATE',
})

/**
 * 아직 회복하지 못한(= 이번 밤 공격을 받고 살아나지 못한) 상태인가. 의사 턴이 끝나면
 * PENDING_RECOVERY가 DEATH_CANDIDATE로 바뀌므로, 후속 역할(GUARD/WITCH_HUNTER)의 **행위자**
 * 배제는 두 값을 똑같이 취급해야 F-25a의 RECOVERY_BLOCKED 계약이 그대로 유지된다.
 */
function isRecoveryBlockedState(state) {
    return state === NIGHT_RECOVERY_STATES.PENDING_RECOVERY || state === NIGHT_RECOVERY_STATES.DEATH_CANDIDATE
}

/** 진행 자료가 아직 없는 밤의 "완료된 역할" 집합(읽기 전용으로만 쓴다 — 절대 추가하지 않는다). */
const EMPTY_COMPLETED_ROLES = Object.freeze(new Set())

function createNightProgress(session, { sequenced = false } = {}) {
    return {
        gameId: session.id,
        nightDayIndex: session.dayIndex,
        // 역할 완료마다 1씩 오른다. 준비 객체가 이 값을 붙들고 있어서, 준비 이후에 역할이
        // 하나 더 완료되면 그 준비는 오래된 것으로 거부된다.
        revision: 0,
        // 이 밤이 턴 시퀀서로 진행 중인가. nightTurnRole은 턴 사이에 잠시 null이 되므로
        // "순차 진행 중"의 근거로 쓸 수 없다(마지막 턴 종료 방송 중의 틈).
        sequenced,
        completedRoles: new Set(),
        roleSteps: [],
        events: [],
        recoveryStates: new Map(),
        roleTargets: new Map(),
        // 의사 턴이 끝났는가 = 이번 밤의 치료 가능성이 닫혔는가. 의사가 없거나 전멸했거나
        // 기권·상충이어도 의사 턴이 끝나면 참이 된다(A-06).
        healingClosed: false,
    }
}

/** 이 진행 자료가 **지금 이 세션의 이 밤** 것인가(다른 밤의 기록을 재사용하지 않는다). */
function matchesCurrentNight(session, progress) {
    return !!progress
        && progress.gameId === session.id
        && progress.nightDayIndex === session.dayIndex
}

function getNightProgress(session) {
    return matchesCurrentNight(session, session?.nightProgress) ? session.nightProgress : null
}

function ensureNightProgress(session, { sequenced = false } = {}) {
    let progress = getNightProgress(session)
    if (!progress) {
        progress = createNightProgress(session, { sequenced })
        session.nightProgress = progress
    }
    if (sequenced) progress.sequenced = true
    return progress
}

/**
 * 한 역할의 이번 밤 결과를 계산한다(순수 계산 — progress를 읽기만 한다). F-25a의 단일 루프
 * 본문을 그대로 옮긴 것이라 역할별 규칙은 비트 단위로 같다. 순차 경로와 기존 직접 판정
 * 경로가 **같은 함수**를 쓰므로 두 경로의 판정이 갈릴 수 없다(AC-05).
 */
function computeNightRoleStep(session, progress, role) {
    const hasRoleInGame = [...session.players.values()].some((player) => player.role === role)
    if (!hasRoleInGame) return { role, targetId: null, status: 'NO_ROLE' }

    const actors = getAliveActorUuidsForRole(session, role)
    if (actors.length === 0) {
        // 그 역할 보유자가 전멸했거나(사망), dayIndex 때문에 아직 활동할 수 없다.
        return { role, targetId: null, status: 'NO_ACTOR' }
    }

    // DOCTOR만 예외다 — 광대에게 공격받은 의사 본인의 자기 치료를 막지 않기 위해 그 단계에는
    // 배제를 적용하지 않는다(F-25a A-03).
    const excludedActorUuids = role === 'DOCTOR'
        ? new Set()
        : new Set(actors.filter((actorUuid) => isRecoveryBlockedState(progress.recoveryStates.get(actorUuid))))

    const targetId = resolveRoleNightAction(session, role, excludedActorUuids)
    if (targetId === null) {
        return { role, targetId: null, status: excludedActorUuids.size > 0 ? 'RECOVERY_BLOCKED' : 'NO_RESULT' }
    }
    return { role, targetId, status: 'RESOLVED' }
}

/**
 * 의사 턴 종료 = 이번 밤의 치료 가능성이 닫히는 순간. 남은 PENDING_RECOVERY를 전부
 * DEATH_CANDIDATE로 바꾸지만 **canonical alive는 건드리지 않는다**(A-06) — 최종 사망은 밤
 * 전체가 끝난 뒤의 commitNightResolution에서 단 한 번 확정된다.
 */
function closeNightHealing(progress) {
    if (progress.healingClosed) return
    progress.healingClosed = true
    for (const [uuid, state] of progress.recoveryStates) {
        if (state === NIGHT_RECOVERY_STATES.PENDING_RECOVERY) {
            progress.recoveryStates.set(uuid, NIGHT_RECOVERY_STATES.DEATH_CANDIDATE)
        }
    }
}

/**
 * 계산된 역할 결과를 진행 자료에 **기록**한다(유일한 mutation 경계). 같은 역할이 두 번
 * 기록되는 일은 호출자가 completedRoles로 먼저 막는다 — 그래야 사건(events)이 늘어나지 않는다(A-07).
 */
function applyNightRoleStep(progress, step) {
    progress.roleSteps.push(step)
    progress.roleTargets.set(step.role, step.targetId)

    if (step.status === 'RESOLVED') {
        if (step.role === 'JOKER') {
            progress.recoveryStates.set(step.targetId, NIGHT_RECOVERY_STATES.PENDING_RECOVERY)
            progress.events.push({ type: 'KILL', targetId: step.targetId })
        } else if (step.role === 'DOCTOR') {
            // "치료 성공" 사건은 실제로 회복 대기 중이던 대상을 되살렸을 때만 만든다 —
            // 공격받지 않은 생존자를 보호해도 사건은 생기지 않는다(roleTargets에는 그대로 담겨
            // 기존 assassinationBlocked 계약을 지킨다).
            if (progress.recoveryStates.get(step.targetId) === NIGHT_RECOVERY_STATES.PENDING_RECOVERY) {
                progress.recoveryStates.set(step.targetId, NIGHT_RECOVERY_STATES.RECOVERED)
                progress.events.push({ type: 'HEAL', targetId: step.targetId })
            }
        }
    }

    // 상태·사유와 무관하게 의사 턴이 끝나면 치료 가능성이 닫힌다.
    if (step.role === 'DOCTOR') closeNightHealing(progress)

    progress.completedRoles.add(step.role)
    progress.revision += 1
}

/**
 * 그 역할의 생존 행위자가 낸 non-null 대상이 여전히 참가자이고 역할이 요구하는 생존 상태를
 * 유지하는지 확인한다. prepareNightResolution의 두 번째 루프와 같은 규칙을 역할 단위로
 * 좁힌 것이다 — 통과해야만 그 역할의 결과를 기록한다.
 */
function findInvalidRoleSubmission(session, role) {
    for (const actorUuid of getAliveActorUuidsForRole(session, role)) {
        const target = session.nightActions.get(actorUuid)
        if (target === null || target === undefined) continue
        const targetPlayer = session.players.get(target)
        if (!targetPlayer) return actorUuid
        const targetStateOk = requiresAliveTarget(role) ? targetPlayer.alive === true : targetPlayer.alive !== true
        if (!targetStateOk) return actorUuid
    }
    return null
}

/**
 * F-25b: **한 역할의 밤 턴을 확정한다.** 소켓 계층의 endNightTurn이 종료 방송·다음 턴 진행보다
 * 먼저 부르는 유일한 진입점이다.
 *
 * 하는 일은 딱 둘이다 — (1) 그 역할의 canonical 결과를 계산해 session.nightProgress에 기록하고,
 * (2) 그 역할이 DOCTOR면 이번 밤의 치료 가능성을 닫는다. **canonical player.alive는 바꾸지
 * 않으며**, 승패 판정·경기 종료·전적 저장은 어느 것도 시작하지 않는다(AC-01/AC-03/A-06).
 *
 * **순차 완료 경계**를 스스로 강제한다(AC-03). 받아들이는 것은 NIGHT_TURN_ORDER에서 지금
 * 차례인 역할 하나뿐이다:
 *   (1) 선행 역할이 전부 완료(무역할·무행위자로 건너뜀 처리된 것 포함)돼 있어야 하고,
 *   (2) 이 역할 자신은 아직 완료되지 않았어야 하며,
 *   (3) 그 역할의 생존 행위자 전원이 제출(기권 포함)을 마쳤어야 한다.
 * 셋 중 하나라도 어긋나면 **어떤 상태도 바꾸지 않고** 거부한다 — 순서를 건너뛴 완료(의사·경비원
 * 먼저), 이미 완료한 역할의 재완료, 제출이 끝나지 않은 완료가 전부 여기서 끊긴다. 소켓 계층의
 * 턴 가드(run 동일성·현재 턴 역할)를 신뢰하지 않고 core가 독립적으로 재검증한다.
 *
 * 거부는 진행 자료를 만들지도 않는다 — 검증을 전부 통과한 뒤에야 ensureNightProgress로 기록
 * 경계에 들어간다(emit 재진입·늦은 타이머가 사건을 늘리거나 revision을 올릴 수 없다).
 *
 * @param {object} session - canonical GameSession(registry에 등록된 바로 그 객체여야 한다)
 * @param {string} role - NIGHT_TURN_ORDER의 역할
 */
function completeNightRole(session, role) {
    if (!session || typeof session.id !== 'string') return { ok: false, code: 'SESSION_NOT_FOUND' }
    // 자동 경로는 대표 UUID·가짜 소켓을 만들지 않는다(A-10) — 권한의 근거는 "registry에 있는
    // 바로 그 canonical session 객체인가" 하나뿐이다.
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (!NIGHT_TURN_ORDER.includes(role)) return { ok: false, code: 'INVALID_ROLE' }

    // ── 순차 완료 경계(AC-03) — 여기서 거부하면 진행 자료조차 만들지 않는다 ─────────
    //
    // 기준은 **이번 밤의 완료 표식**이다(소켓 계층의 session.nightTurnRole이 아니다) — 그 값은
    // 턴 사이와 마지막 턴 종료 방송 중 잠시 null이라 "지금 차례"의 근거가 될 수 없다.
    const completedRoles = getNightProgress(session)?.completedRoles ?? EMPTY_COMPLETED_ROLES
    if (completedRoles.has(role)) return { ok: false, code: 'ROLE_ALREADY_COMPLETED' }
    for (const earlierRole of NIGHT_TURN_ORDER) {
        if (earlierRole === role) break
        if (!completedRoles.has(earlierRole)) return { ok: false, code: 'ROLE_OUT_OF_ORDER' }
    }
    // 그 역할의 생존 행위자가 전원 제출(기권 포함)을 마쳐야 확정할 수 있다. 무인 역할은 공집합이라
    // 공허참이고, 제한시간 만료는 미제출자를 전부 기권으로 먼저 기록한 뒤에야 이 함수를 부른다.
    if (!isRoleTurnComplete(session, role)) return { ok: false, code: 'ACTIONS_PENDING' }

    if (findInvalidRoleSubmission(session, role) !== null) {
        // 어떤 것도 기록하지 않는다 — 호출자(endNightTurn)는 종료 방송도 다음 턴 진행도 하지 않는다.
        return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
    }

    const progress = ensureNightProgress(session, { sequenced: true })
    const step = computeNightRoleStep(session, progress, role)
    applyNightRoleStep(progress, step)

    return {
        ok: true,
        role,
        alreadyCompleted: false,
        // 방어 복사 — 호출자가 변형해도 진행 자료는 오염되지 않는다.
        step: { ...step },
        revision: progress.revision,
        healingClosed: progress.healingClosed,
    }
}

/**
 * F-25b: 이 밤이 **턴 시퀀서로 진행 중**임을 표시한다(소켓 계층의 startNightTurnSequence가
 * run을 등록한 직후 한 번 부른다).
 *
 * 표식이 필요한 이유: 표식이 없으면 네 역할이 하나도 완료되지 않은 순차 밤에 들어온
 * resolve_night가 "시퀀서 없는 직접 판정"으로 오인돼 미완료 역할을 건너뛴 채 밤을 확정해
 * 버린다. 현재 NIGHT가 아니거나 이미 확정된 밤에는 아무 것도 하지 않는다 — 이탈이 먼저
 * 종결시킨 세션을 이 호출이 되살리지 않는다.
 */
function markNightSequenced(session) {
    if (!session || typeof session.id !== 'string') return false
    if (gameSessions.get(session.id) !== session) return false
    if (session.phase !== 'NIGHT') return false
    if (session.nightResolution !== null) return false
    ensureNightProgress(session, { sequenced: true })
    return true
}

/**
 * 이번 밤의 어떤 역할이 **이미 확정**되었는가. submitNightAction이 늦은 제출을 거부하는 근거다 —
 * 마지막 턴 종료 방송 중 nightTurnRole이 잠시 null인 틈에도 완료된 역할을 다시 쓸 수 없다.
 */
function isNightRoleCompleted(session, role) {
    const progress = getNightProgress(session)
    return !!progress && progress.sequenced && progress.completedRoles.has(role)
}

/**
 * 보호로 암살이 무산된 밤에 "생존한 JOKER 본인"에게만 가는 개인 통지의 canonical 형태를 만든다.
 *
 * 키는 정확히 두 개(actionType/success)이고, 보호자 uuid·보호자 역할·대상·사유는 어떤 필드에도
 * 담지 않는다 — 광대가 알 수 있는 것은 "이번 밤의 암살이 성사되지 않았다"는 사실 하나뿐이다
 * (다른 참가자에게는 사망 없는 밤으로만 보인다). actionType은 GUARD의 'INVESTIGATE',
 * WITCH_HUNTER의 'CONFIRM'과 같은 계열의 동사이고, 소켓 계층은 privateResults에 항목이 있는
 * 수신자에게만 night_action_result를 개별 emit하므로 전달 경로는 그대로 재사용된다.
 *
 * 매 호출마다 새 객체를 만들어 수신자별로 나눠 준다 — 소켓 계층이 이 객체를 spread해 payload에
 * 담으므로, 하나를 공유하면 한 수신자 경로의 오염이 나머지에 전파될 수 있다.
 */
function buildAssassinationFailureNotice() {
    return { actionType: 'ASSASSINATE', success: false }
}

// 자기 자신을 대상으로 지정할 수 있는 역할. DOCTOR(보호)만 허용한다 — GUARD가 자기 자신을
// 지정하면 INVALID_TARGET으로 거부한다. JOKER의 자기 자신 대상은 team 검사에서 먼저 no-op으로
// 처리되므로 이 Set까지 도달하지 않는다(아래 submitNightAction 참고). WITCH_HUNTER도 마찬가지로
// 여기까지 오지 않는다 — 생존한 자기 자신은 그 앞의 대상 생존 검사에서 TARGET_NOT_DEAD로
// 걸린다(requiresAliveTarget('WITCH_HUNTER') === false).
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
 *   → 5. 아직 판정되지 않은 밤 → 6. actor 생존(ACTOR_NOT_ALIVE)
 *   → 7. 역할·dayIndex eligibility → 8. targetId가 있으면 참가자로 존재하는지
 *   → 9. 역할별 대상 생존 요구(requiresAliveTarget): 생존 대상을 요구하는 역할은 사망자를
 *      지목하면 TARGET_NOT_ALIVE, 사망 대상을 요구하는 역할(WITCH_HUNTER)은 생존자를 지목하면
 *      TARGET_NOT_DEAD
 *   → 10. actor가 JOKER이고 대상이 JOKER 진영(자기 자신 포함)이면 Map을 건드리지 않고 성공
 *      종료(no-op — 오라클 방지를 위해 거부하지 않고, 기존 유효 표를 파괴하지 않기 위해
 *      SKIP으로 덮어쓰지도 않는다)
 *   → 11. 그 외 역할이 자기 자신을 대상으로 했는데 허용되지 않으면 거부 → 12. Map에 저장.
 *
 * 6·9번(생존 검사)은 submitDayVote와 같은 원칙·같은 순서다 — 밤과 낮이 한 규칙을 공유하되,
 * 밤에서만 "대상이 사망자여야 하는 역할"이 추가된다. 사망자의 제출을 막는 것이
 * getEligibleNightActorUuids의 생존 필터와 짝을 이뤄 "사망자 때문에 밤이 막히는" 교착을 없애고,
 * 사망한 대상을 막는 것이 commitNightResolution의 "victim은 반드시 alive여야 한다" 전제를
 * 지켜준다(WITCH_HUNTER는 애초에 사망을 만들지 않는 확인 역할이라 이 전제와 무관하다).
 *
 * 모든 실패 경로와 10번(no-op)은 session.nightActions를 절대 건드리지 않습니다 — "성공 응답"과
 * "Map이 바뀜"은 동치가 아닙니다. game-core는 소켓 계층의 가드를 신뢰하지 않고 이 함수 안에서
 * 독립적으로 전부 재검증합니다(acknowledgeRoleReveal과 동일한 원칙).
 *
 * @param {string} uuid - 인증된 요청자 uuid
 * @param {string} gameId - 클라이언트가 알고 있는 gameId(신뢰하지 않음)
 * @param {string|null} targetId - 행동 대상 uuid 또는 SKIP을 뜻하는 null
 * @flow 위 12단계를 순서대로 평가하고, 어느 하나라도 실패하면 그 자리에서 반환한다.
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
    // eligibility보다 먼저 확인한다 — 생존 여부가 역할보다 근본적인 거부 사유이고, 생존
    // 상태는 night_result_applied.players와 스냅샷 isAlive로 이미 공개된 정보라 이 순서가
    // 어떤 비밀도 흘리지 않는다(사망한 CITIZEN은 NOT_ELIGIBLE이 아니라 이 코드를 받는다).
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }
    if (!isEligibleForNightAction(actor.role, session.dayIndex)) {
        return { ok: false, code: 'NOT_ELIGIBLE' }
    }
    // 턴 소유권은 eligibility "다음"이다 — 이 검사가 앞서면 CITIZEN처럼 애초에 밤 행동이 없는
    // 참가자가 NOT_ELIGIBLE 대신 NOT_YOUR_TURN을 받아, 응답 코드가 "네 턴을 기다리면 된다"는
    // 잘못된 신호가 된다. 역할 자격은 그 참가자에 대한 고정 사실이고 턴은 시점의 문제이므로
    // 고정 사실이 먼저 판정되어야 한다.
    //
    // 턴 상태가 없으면(getCurrentNightTurnRole === null) 어떤 제출도 막지 않는다 — 턴 시퀀서가
    // 돌고 있을 때만 유효한 제약이다. 진행 중인 턴의 역할은 그 밤의 모든 참가자에게 이미
    // night_turn_started로 방송된 공개 정보라, 이 거부 코드는 어떤 비밀도 흘리지 않는다.
    const currentTurnRole = getCurrentNightTurnRole(session)
    if (currentTurnRole !== null && currentTurnRole !== actor.role) {
        return { ok: false, code: 'NOT_YOUR_TURN' }
    }
    // F-25b: 순차 진행 중인 밤에서 **이미 확정된 역할**의 늦은 제출은 거부한다. nightTurnRole만
    // 보면 마지막 턴 종료 방송 중(그 값이 잠시 null인 틈)이나 다음 턴 진입 직전에 완료된 역할의
    // 결과를 다시 쓸 수 있다 — 그러면 이미 기록된 KILL/HEAL 사건과 집계가 어긋난다(A-07).
    if (isNightRoleCompleted(session, actor.role)) {
        return { ok: false, code: 'NOT_YOUR_TURN' }
    }

    if (targetId !== null) {
        const targetPlayer = session.players.get(targetId)
        if (!targetPlayer) return { ok: false, code: 'INVALID_TARGET' }
        // 규칙에 어긋난 대상을 여기서 끊는다. 통과시키면 prepareNightResolution이
        // TARGET_NOT_A_PARTICIPANT(internal-only → INTERNAL_ERROR)로 그 밤 전체를 판정
        // 불가능하게 만든다. JOKER 진영 no-op보다 먼저 확인하므로, JOKER가 사망한 동료를
        // 지목하면 조용한 no-op이 아니라 TARGET_NOT_ALIVE를 받는다 — 생존 여부는 공개
        // 정보이므로 진영 오라클이 되지 않는다(살아있는 동료에 대한 no-op은 그대로다).
        //
        // WITCH_HUNTER만 방향이 반대다(requiresAliveTarget === false): 사망자를 확인하는
        // 역할이라 생존자 지목을 TARGET_NOT_DEAD로 거부한다. 이 코드도 생존 여부라는 공개
        // 정보만 알려주므로 어떤 비밀도 흘리지 않는다.
        if (requiresAliveTarget(actor.role)) {
            if (!targetPlayer.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        } else if (targetPlayer.alive) {
            return { ok: false, code: 'TARGET_NOT_DEAD' }
        }

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
 *   → 6. 모든 eligible actor(= 생존한 행동 보유자)의 nightActions 제출 완료
 *      (ACTIONS_PENDING, 추가 정보 없음)
 *   → 7. 그 eligible actor들의 non-null target이 여전히 canonical participant이고, 그 actor의
 *      역할이 요구하는 생존 상태(requiresAliveTarget이면 생존, 아니면 사망)를 유지하고 있는지
 *      (TARGET_NOT_A_PARTICIPANT — internal-only, 소켓 계층이 INTERNAL_ERROR로 정규화).
 *
 * 6번의 기준은 getEligibleNightActorUuids 하나뿐이며 그 목록은 사망자를 포함하지 않는다 —
 * 사망한 행동 보유자가 제출하지 않아도 밤은 정상적으로 판정된다. 행동 보유자가 한 명도
 * 살아있지 않은 밤은 두 루프가 모두 공회전해 곧바로 통과하고, 암살 대상 없는(희생자 없는)
 * 밤으로 판정된다.
 *
 * 네 직업(JOKER·DOCTOR·GUARD·WITCH_HUNTER)의 대상 선택은 모두 resolveRoleNightAction 하나를
 * 지납니다 — 역할이 하나 고른 canonical 대상(또는 없음)만 나오므로, 같은 역할을 여러 명이
 * 가졌을 때도 그 역할의 결과는 정확히 하나입니다. assassinationTargetId는 JOKER의 다수결
 * 결과이고(동률·전원 SKIP이면 null), protectedTargetIds는 DOCTOR의 canonical 보호 대상 하나를
 * 담은 Set입니다(의사들이 서로 다른 대상을 지목했거나 아무도 보호하지 않았으면 빈 Set).
 *
 * 성공 시 { ok:true, session, resolution } — resolution은 commitNightResolution에 그대로
 * 넘길 값입니다. privateResults는 생존한 GUARD/WITCH_HUNTER의 canonical 결과와, 보호로 암살이
 * 막힌 밤의 생존 JOKER 실패 통지만 담는 Map이고(SKIP/미제출/상충은 entry 없음), DOCTOR/CITIZEN은
 * 애초에 이 Map에 등장하지 않습니다. GUARD는 { actionType:'INVESTIGATE', targetId, role },
 * WITCH_HUNTER는 { actionType:'CONFIRM', targetId, role }이며 — 두 결과 모두 대상의 실제 role을
 * 담습니다(경비원 결과는 진영이 아니라 role이다 — 판정 4.3.1). 그 역할을 가진 생존자가 여럿이면
 * 전원이 값이 같은(참조는 서로 다른) 결과를 받습니다. JOKER는
 * { actionType:'ASSASSINATE', success:false } 하나뿐이고, 그 밤의 암살 대상이 보호 대상과
 * 일치했을 때에만 만들어집니다 — 보호자·보호자 역할·대상·사유는 어떤 필드에도 담지 않는다는
 * 것이 이 통지의 계약입니다(buildAssassinationFailureNotice).
 *
 * 한 참가자가 두 항목을 동시에 갖는 경우는 없습니다 — 결과는 역할 단위로 만들어지고 역할은
 * 서로 배타적이라, 각 참가자는 자기 역할의 항목 하나에만 해당합니다.
 *
 * @param {string} uuid - 인증된 요청자 uuid
 * @param {string} gameId - 클라이언트가 알고 있는 gameId(신뢰하지 않음)
 * @flow 위 7단계를 순서대로 평가하고, 통과하면 역할별로 리졸버를 돌려 집계·개인 결과를 만든다.
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

    // 여기부터의 준비는 요청자와 무관한 세션 단위 계산이다 — 자동 밤 최종화(소켓 계층의
    // finalizeNightForSession)가 대표 UUID나 가짜 소켓을 만들지 않고 같은 경계를 쓸 수 있도록
    // 분리했다(A-10).
    return prepareNightResolutionForSession(session)
}

/**
 * F-25b: **세션 하나의 밤 최종 준비**(어떤 상태도 바꾸지 않는 순수 함수). 수동 resolve_night의
 * 인증 래퍼(prepareNightResolution)와 자동 밤 최종화가 공유하는 유일한 준비 경계다.
 *
 * 두 갈래가 있고, 둘 다 **같은 역할 계산**(computeNightRoleStep/applyNightRoleStep)을 쓴다:
 *   - 순차 진행이 시작된 밤: session.nightProgress에 네 역할이 전부 완료되고 치료 가능성이
 *     닫혀 있어야 한다. 하나라도 남았으면 ACTIONS_PENDING이다(미완료 역할을 수동 판정이
 *     건너뛰게 하지 않는다).
 *   - 시퀀서 없는 기존 직접 판정: 현재 적격 행위자의 제출 완료·대상 유효성을 먼저 전부
 *     검증한 뒤, **지역** 진행 자료에서 네 역할을 순서대로 계산한다(session은 건드리지 않는다).
 *
 * 성공하면 반환된 resolution은 내부 준비 대장(nightPreparations)에 등록된다 —
 * commitNightResolution은 그 등록이 있는 객체만 받아들이고, 등록 시점에 복사해 둔 값으로
 * 커밋하므로 반환된 객체의 필드·Map·Set을 변형해도 확정 내용은 달라지지 않는다.
 */
function prepareNightResolutionForSession(session) {
    if (!session || typeof session.id !== 'string') return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }

    const endedCheck1 = assertSessionNotEnded(session)
    if (!endedCheck1.ok) return endedCheck1

    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }

    const sequencedProgress = getNightProgress(session)?.sequenced === true ? getNightProgress(session) : null

    let progress
    if (sequencedProgress) {
        for (const role of NIGHT_TURN_ORDER) {
            if (!sequencedProgress.completedRoles.has(role)) return { ok: false, code: 'ACTIONS_PENDING' }
        }
        if (!sequencedProgress.healingClosed) return { ok: false, code: 'ACTIONS_PENDING' }
        progress = sequencedProgress
    } else {
        // 두 루프가 같은 목록을 봐야 한다 — "제출했어야 할 사람"과 "표를 검증할 사람"이 갈리면
        // 사망자가 남긴 잔여 entry가 판정을 막을 수 있다. 목록은 한 번만 계산해 재사용한다.
        const eligibleActorUuids = getEligibleNightActorUuids(session)
        for (const actorUuid of eligibleActorUuids) {
            if (!session.nightActions.has(actorUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
        }

        // 검증은 eligible alive actor의 표만 본다(session.nightActions 전체가 아님) — 대상도
        // 참가자로 존재할 뿐 아니라 그 actor의 역할이 요구하는 생존 상태를 유지해야 한다.
        // submitNightAction과 같은 헬퍼(requiresAliveTarget)로 판정하므로 두 경계가 갈릴 수 없다 —
        // 여기에 이 규칙이 없으면 WITCH_HUNTER의 (정당한) 사망자 지목이 그 밤 전체를
        // TARGET_NOT_A_PARTICIPANT로 잠가버린다.
        for (const actorUuid of eligibleActorUuids) {
            const target = session.nightActions.get(actorUuid)
            if (target !== null) {
                const targetPlayer = session.players.get(target)
                if (!targetPlayer) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
                const actorRole = session.players.get(actorUuid)?.role
                const targetStateOk = requiresAliveTarget(actorRole) ? targetPlayer.alive === true : targetPlayer.alive !== true
                if (!targetStateOk) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
            }
        }

        // 이 실패는 canonical 생존·phase·확정 결과와 완료 사건을 전혀 바꾸지 않는다 —
        // 지역 진행 자료만 쓰고 session.nightProgress에는 대입하지 않는다.
        progress = createNightProgress(session, { sequenced: false })
        for (const role of NIGHT_TURN_ORDER) {
            applyNightRoleStep(progress, computeNightRoleStep(session, progress, role))
        }
        closeNightHealing(progress)
    }

    const assassinationTargetId = progress.roleTargets.get('JOKER') ?? null
    const protectionTargetId = progress.roleTargets.get('DOCTOR') ?? null
    const investigationTargetId = progress.roleTargets.get('GUARD') ?? null
    const confirmationTargetId = progress.roleTargets.get('WITCH_HUNTER') ?? null

    // 보호 대상은 canonical 하나(또는 없음)다. 필드 이름과 Set 타입은 그대로 두어 이 값을
    // 소비하는 쪽(assassinationBlocked·테스트)의 모양이 바뀌지 않게 하고, 원소 수만 0 또는 1이 된다.
    const protectedTargetIds = new Set(protectionTargetId === null ? [] : [protectionTargetId])
    // 판정 순서 1단계 — "보호 대조"다. 이 대조는 사망 확정(commitNightResolution)보다 반드시
    // 먼저 끝난다: 여기서 쓰는 보호 집합은 "아직 아무도 죽지 않은" 밤의 생존 의사들에게서 나온
    // 것이고, 사망이 확정된 뒤의 잔여 효과 소멸은 3단계에서 별도로 일어난다.
    const assassinationBlocked =
        assassinationTargetId !== null && protectedTargetIds.has(assassinationTargetId)

    // 최종 사망 후보. 치료로 살아났으면 null이고, 준비 시점에 이미 이 판에서 빠졌거나
    // (DISCONNECT 사망·참여 종료) 이미 사망한 대상도 null로 정규화한다 — 그 사망은 이탈 경로가
    // 이미 확정했으므로 여기서 ASSASSINATION과 새 공개 reveal을 만들지 않는다(A-08).
    let pendingEliminationTargetId = assassinationBlocked ? null : assassinationTargetId
    if (pendingEliminationTargetId !== null) {
        const candidate = session.players.get(pendingEliminationTargetId)
        if (!candidate || candidate.alive !== true || !isParticipatingInSession(session, pendingEliminationTargetId)) {
            pendingEliminationTargetId = null
        }
    }

    // 역할 → 그 역할의 생존 보유자 전원에게 "동일하게" 갈 개인 결과의 생성자. 대상이 없는
    // 역할(전원 SKIP·상충·비활성 WITCH_HUNTER)은 아예 등재되지 않아 결과가 만들어지지 않는다.
    // 생성자를 담는 이유는 수신자마다 새 객체를 나눠 주기 위함이다 — 소켓 계층이 이 객체를
    // spread해 payload에 담으므로, 하나를 공유하면 한 수신자 경로의 오염이 나머지에 전파된다.
    const privateResultBuilderByRole = new Map()
    if (investigationTargetId !== null && session.players.has(investigationTargetId)) {
        // 결과는 진영(team)이 아니라 대상의 실제 role이다 — 경비원의 조사는 "시민 진영인가"가
        // 아니라 "무슨 역할인가"를 알려준다(판정 4.3.1).
        const role = session.players.get(investigationTargetId).role
        privateResultBuilderByRole.set('GUARD', () => ({
            actionType: 'INVESTIGATE',
            targetId: investigationTargetId,
            role,
        }))
    }
    if (confirmationTargetId !== null && session.players.has(confirmationTargetId)) {
        const role = session.players.get(confirmationTargetId).role
        privateResultBuilderByRole.set('WITCH_HUNTER', () => ({
            actionType: 'CONFIRM',
            targetId: confirmationTargetId,
            role,
        }))
    }
    if (assassinationBlocked) {
        // 보호로 막힌 밤에만 실패 통지를 만든다. 통지는 생존 JOKER 전원에게 간다 — 암살은
        // 리졸버가 진영 단위로 집계하는 행동이라 "누가 그 대상에 투표했는지"로 수신자를 가르지
        // 않는다. 암살 대상이 없는 밤(전원 SKIP·동률)에는 assassinationBlocked가 false라 통지가
        // 없다 — "실패"는 보호로 막힌 경우만 뜻한다.
        privateResultBuilderByRole.set('JOKER', buildAssassinationFailureNotice)
    }

    const privateResults = new Map()
    for (const player of session.players.values()) {
        // 사망자에게는 개인 결과를 만들지 않는다 — 소켓 계층이 이 Map을 그대로 소비하므로
        // 여기서 빼면 night_action_result 방송 경로도 함께 정리된다.
        if (player.alive !== true) continue
        const buildResult = privateResultBuilderByRole.get(player.role)
        if (buildResult !== undefined) privateResults.set(player.uuid, buildResult())
    }

    const resolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        assassinationTargetId,
        protectedTargetIds,
        pendingEliminationTargetId,
        privateResults,
        // F-25a/F-25b: 서버 내부 전용 기록이다(A-02) — buildNightResultAppliedPayload/
        // buildSessionSnapshot 어느 쪽도 이 세 필드를 읽지 않으므로 공개 payload에는
        // 노출되지 않는다. 매번 새 배열/새 Map으로 복사해 진행 자료와 분리한다.
        roleSteps: progress.roleSteps.map((step) => ({ ...step })),
        events: progress.events.map((event) => ({ ...event })),
        recoveryStates: new Map(progress.recoveryStates),
        resolved: true,
    }

    registerNightPreparation(session, resolution, {
        sequenced: progress.sequenced === true,
        progressRevision: progress.revision,
    })

    return { ok: true, session, resolution }
}

/**
 * F-25b(A-03): 준비 객체 → 그 준비의 **출처 기록**. commitNightResolution은 이 대장에 등재된
 * 객체만 받아들이고, 커밋에 쓰는 값도 이 기록의 복사본에서만 읽는다 — 반환된 resolution의
 * 필드·Map·Set을 바깥에서 변형해도 확정 내용이 달라지지 않는다.
 *
 * WeakMap이라 세션·준비 객체가 사라지면 기록도 함께 사라진다(별도 정리 경로가 필요 없다).
 */
const nightPreparations = new WeakMap()

/**
 * F-25b(AC-05): 준비가 **무엇을 보고 만들어졌는지**의 지문이다. 커밋은 지금 상태로 이 값을 다시
 * 계산해 같을 때만 진행한다 — 준비 뒤에 제출이 바뀌었거나(다른 대상·기권·새 제출·제출 삭제),
 * 그 사이에 순차 진행이 새로 시작·진행됐다면 그 준비는 더 이상 현재 밤을 설명하지 못한다.
 *
 * 생존 roster는 일부러 넣지 않는다 — 준비 이후의 이탈·끊김 사망은 기존 participationRevision과
 * 커밋 시점의 최종 후보 null 정규화가 이미 소유하는 축이고(A-08), 그 경로는 "거부하고 다시 준비"가
 * 아니라 "이미 확정된 사망을 밤이 다시 처리하지 않는다"가 승인된 계약이기 때문이다.
 */
function computeNightInputFingerprint(session) {
    const submissions = []
    for (const [actorUuid, target] of session.nightActions ?? []) {
        submissions.push(`${actorUuid}>${target === null || target === undefined ? 'SKIP' : target}`)
    }
    submissions.sort()

    const progress = getNightProgress(session)
    const progressPart = progress
        ? [
            progress.sequenced ? 'SEQ' : 'DIRECT',
            progress.revision,
            progress.healingClosed ? 'HEAL_CLOSED' : 'HEAL_OPEN',
            NIGHT_TURN_ORDER.filter((role) => progress.completedRoles.has(role)).join('+'),
        ].join('#')
        : 'NO_PROGRESS'

    return `${session.id}@${session.dayIndex}|${progressPart}|${submissions.join(',')}`
}

/** 준비 내용의 깊은 복사(Map/Set/배열/평범한 객체까지). 바깥의 변형이 내부 원본에 닿지 못하게 한다. */
function cloneNightPreparationValue(value) {
    if (value instanceof Map) {
        const copy = new Map()
        for (const [key, nested] of value) copy.set(key, cloneNightPreparationValue(nested))
        return copy
    }
    if (value instanceof Set) return new Set(value)
    if (Array.isArray(value)) return value.map((item) => cloneNightPreparationValue(item))
    if (value !== null && typeof value === 'object') {
        const copy = {}
        for (const [key, nested] of Object.entries(value)) copy[key] = cloneNightPreparationValue(nested)
        return copy
    }
    return value
}

/** 준비 시점의 필드 전체를 키 단위로 떠 둔다 — 커밋이 소비하는 유일한 원본이다. */
function snapshotNightPreparation(resolution) {
    const snapshot = new Map()
    for (const key of Object.keys(resolution)) snapshot.set(key, cloneNightPreparationValue(resolution[key]))
    return snapshot
}

/**
 * 전달된 준비 객체를 **세션이 보관한 준비 결과 그대로** 되돌린다(커밋 직전에 한 번).
 *
 * 준비 이후 바깥에서 바꾼 값(대상·공개 출처 귀속·개인 결과)도, 새로 덧붙인 필드(위조된
 * witchHunterExecutionTargetId 등)도 확정 내용이 될 수 없다 — 전달된 객체는 "어느 준비인가"를
 * 식별하는 데에만 쓰이고, 확정·reveal·스냅샷이 읽는 값은 전부 이 복원본에서 온다.
 */
function restoreNightPreparation(resolution, snapshot) {
    for (const key of Object.keys(resolution)) {
        if (!snapshot.has(key)) delete resolution[key]
    }
    for (const [key, value] of snapshot) resolution[key] = cloneNightPreparationValue(value)
}

function registerNightPreparation(session, resolution, { sequenced, progressRevision }) {
    nightPreparations.set(resolution, {
        session,
        gameId: session.id,
        nightDayIndex: session.dayIndex,
        participationRevision: Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0,
        sequenced,
        progressRevision,
        // 준비가 본 입력(제출·순차 진행 상태)의 지문. 커밋이 지금 상태로 다시 계산해 대조한다.
        inputFingerprint: computeNightInputFingerprint(session),
        // 커밋이 실제로 소비하는 값의 내부 원본. 전달된 객체가 아니라 이 값을 쓴다.
        pendingEliminationTargetId: resolution.pendingEliminationTargetId ?? null,
        prepared: snapshotNightPreparation(resolution),
        consumed: false,
    })
    return resolution
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
 * 밤 해소 판정 순서의 3단계 — "사망자의 잔여 효과 소멸"이다. 이번 밤에 사망이 확정된 참가자가
 * 남긴 밤 행동 엔트리(의사가 타인에게 건 보호, 경비원의 조사 지시 등)를 session.nightActions에서
 * 제거하고, 실제로 지워진 actor uuid 목록을 돌려준다.
 *
 * 오늘의 스펙(킬 소스가 JOKER 하나뿐)에서는 이 소멸이 관측 가능한 결과를 바꾸지 않는다 —
 * 보호 대조(1단계)는 사망 확정(2단계)보다 먼저 끝나고, 이 밤 이후 nightActions는 다음 NIGHT
 * 진입에서 어차피 새 Map으로 교체되기 때문이다. 그럼에도 단계를 코드로 남기는 이유는 킬 직업이
 * 하나 더 생기는 순간 "죽은 의사의 보호가 두 번째 킬을 계속 막는가"라는 질문이 곧바로 관측
 * 가능해지기 때문이다. 그때 답이 조용히 갈리지 않도록 순서를 지금 고정한다.
 *
 * 호출자는 "alive → dead로 실제 바뀐" 참가자만 넘겨야 한다(buildNightDeathReveals와 같은 계약).
 * 엔트리가 없는 uuid는 조용히 무시한다. Map 조회·삭제만 하므로 절대 throw하지 않는다 —
 * commitNightResolution의 "사망 확정 이후로는 throw하지 않는다"는 계약을 깨지 않는다.
 *
 * @param {object} session - canonical GameSession(nightActions만 쓴다)
 * @param {string[]} deadUuids - 이번 판정이 실제로 사망시킨 참가자 uuid 목록
 * @flow deadUuids를 순회하며 엔트리가 있는 uuid만 삭제하고 그 uuid를 결과 목록에 모은다.
 */
function expireDeadPlayerNightEffects(session, deadUuids) {
    const expired = []
    for (const uuid of deadUuids) {
        if (!session.nightActions.has(uuid)) continue
        session.nightActions.delete(uuid)
        expired.push(uuid)
    }
    return expired
}

/**
 * NIGHT 판정 커밋과 사망/phase/day 전이를 모두 담당하는 유일한 mutation입니다.
 * prepareNightResolution이 반환한 resolution.pendingEliminationTargetId만 소비하고, 클라이언트
 * 입력이나 raw nightActions를 다시 읽지 않습니다.
 *
 * 밤 해소의 canonical 판정 순서는 다음 넷이며, 이 함수가 2~4단계를 이 순서대로 실행합니다:
 *   1. 보호 대조 — prepareNightResolution이 이미 끝냈다(아직 아무도 죽지 않은 생존 집합 위에서
 *      계산된 보호 집합으로 pendingEliminationTargetId를 정한다).
 *   2. 사망 확정 — victim.alive = false.
 *   3. 사망자의 잔여 효과 소멸 — expireDeadPlayerNightEffects. 반드시 사망 확정 "뒤"에 온다.
 *   4. 승리 재평가 — 사망 이벤트 직후 항상, 낮 진입(enterDayPhase) 전에 한다(처형·끊김 사망과
 *      공유하는 원칙). 승자가 확정된 밤은 DAY로 넘어가지 않는다.
 *
 * 검증(victim 존재·alive)은 mutation 이전에 전부 끝내고, 통과한 뒤로는 이 함수가 절대
 * throw하지 않습니다 — "커밋은 됐는데 사망/phase/day 적용은 안 된" 부분 커밋 상태가
 * 구조적으로 존재할 수 없습니다. 검증 실패 시 session은 nightResolution을 포함해 어떤
 * 필드도 바뀌지 않습니다.
 *
 * 반환값 { victimUuid }는 buildNightResultAppliedPayload에 그대로 넘길 값입니다.
 */
function commitNightResolution(session, resolution) {
    // 관찰자가 원자적 커밋 구간 안에서 이 함수를 다시 부르는 것을 구조적으로 막는다.
    if (nightCommitObserverBusy) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    // ── F-25b(A-03): mutation 이전의 출처·신선도 검증 ────────────────────────
    //
    // 이 블록을 통과하지 못한 호출은 session의 어떤 필드도 바꾸지 않는다(상태 불변 실패).
    // 출처가 없는 resolution, 다른 세션·다른 경기·이전 밤의 준비, 그리고 준비 이후 상태가
    // 달라진(역할이 더 완료됐거나 참여 구성이 바뀐) 준비가 전부 여기서 끊긴다.
    const record = (resolution !== null && typeof resolution === 'object')
        ? nightPreparations.get(resolution)
        : undefined
    if (!record) return { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' }
    if (record.session !== session) return { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' }
    // 같은 준비로 두 번 커밋할 수 없다(자동/수동 경쟁의 두 번째 진입).
    if (record.consumed) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    // 이탈 종결이나 registry 삭제가 먼저 일어났다면 밤 커밋을 거부한다(A-08).
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (record.gameId !== session.id) return { ok: false, code: 'STALE_RESOLUTION' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (record.nightDayIndex !== session.dayIndex) return { ok: false, code: 'STALE_RESOLUTION' }
    // 같은 밤의 두 번째 커밋은 재평가·재저장·재방송 없이 여기서 끝난다.
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    const currentParticipationRevision =
        Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0
    if (currentParticipationRevision !== record.participationRevision) return { ok: false, code: 'STALE_RESOLUTION' }

    // 준비 뒤에 제출이 바뀌었거나 순차 진행이 새로 시작·진행됐다면 그 준비는 오래된 것이다 —
    // 거부하고 다시 준비하게 한다(이 지점까지 세션은 어떤 필드도 바뀌지 않았다).
    if (record.inputFingerprint !== computeNightInputFingerprint(session)) {
        return { ok: false, code: 'STALE_RESOLUTION' }
    }

    if (record.sequenced) {
        const progress = getNightProgress(session)
        if (!progress || progress.sequenced !== true) return { ok: false, code: 'STALE_RESOLUTION' }
        if (progress.revision !== record.progressRevision) return { ok: false, code: 'STALE_RESOLUTION' }
        if (!progress.healingClosed) return { ok: false, code: 'ACTIONS_PENDING' }
        for (const role of NIGHT_TURN_ORDER) {
            if (!progress.completedRoles.has(role)) return { ok: false, code: 'ACTIONS_PENDING' }
        }
    }

    // 최종 후보는 **내부 원본**에서만 읽는다. 준비 이후 그 대상이 이탈·끊김으로 빠졌다면
    // 여기서 한 번 더 null로 정규화한다 — 그 사망은 이탈 경로가 이미 확정했다(A-08).
    //
    // roster에 **존재하는** 참가자일 때만 정규화한다. 아예 이 판의 참가자가 아닌 uuid는
    // 정상 준비 경로가 만들어낼 수 없는 값이므로 조용히 "희생자 없는 밤"으로 바꾸지 않고
    // 아래 방어적 불변조건에서 그대로 터지게 둔다(수동 조립·오염 fixture 방어).
    let victimUuid = record.pendingEliminationTargetId ?? null
    if (victimUuid !== null && session.players.has(victimUuid) && !isParticipatingInSession(session, victimUuid)) {
        victimUuid = null
    }

    let victim = null
    if (victimUuid !== null) {
        victim = session.players.get(victimUuid)
        // 방어적 불변조건: prepareNightResolution이 이미 eligible actor의 모든 non-null target에
        // 대해 "참가자로 존재하고 alive"임을 TARGET_NOT_A_PARTICIPANT로 검증했으므로 이 두
        // throw는 정상 경로에서 도달 불가능하다 — assertValidSessionForCommit과 동일하게
        // 수동 조립/오염 상태까지 방어한다.
        //
        // prepare와 commit 사이에 victim이 죽을 수 없는 근거: phase가 NIGHT인 동안 생존 집합은
        // 절대 변하지 않는다. alive를 false로 바꾸는 곳은 이 함수(직후 finalizeGameSession
        // 또는 enterDayPhase로 반드시 NIGHT를 벗어난다)와 commitTribunalVoteResolution
        // (phase === 'TRIBUNAL'에서만 실행된다) 두 곳뿐이다. 즉 밤은 고정된 생존 집합 위에서
        // 시작해 그 집합 위에서 판정되며, "밤 도중 사망"이라는 상태는 존재하지 않는다.
        //
        // 이 시점까지는 session에 어떤 mutation도 일어나지 않았으므로, 여기서 throw하면
        // nightResolution을 포함해 아무 상태도 바뀌지 않는다.
        if (!victim) throw new Error(`commitNightResolution: victim(${victimUuid})이 참가자가 아님`)
        if (victim.alive !== true) throw new Error(`commitNightResolution: victim(${victimUuid})이 이미 사망 상태`)
    }
    // 이 지점 이후로는 절대 throw하지 않는다.
    // 준비를 "소진"으로 표시하는 것도, 전달된 객체에 확정 값을 반영하는 것도 검증을 전부
    // 통과한 뒤에만 한다 — 거부·throw로 끝난 호출은 세션도 준비 기록도 바꾸지 않는다.
    //
    // 확정에 쓰는 값은 **세션이 보관한 준비 결과**뿐이다. 전달된 객체는 여기까지 "어느 준비인가"를
    // 식별하는 데에만 쓰였으므로, 그 사이 바깥에서 바뀐 필드·덧붙은 필드를 전부 원본으로 되돌린 뒤
    // 확정한다(AC-05). 되돌린 객체가 곧 session.nightResolution이 되고
    // buildSessionSnapshot/buildNightResultAppliedPayload가 그 필드를 읽는다.
    restoreNightPreparation(resolution, record.prepared)
    resolution.pendingEliminationTargetId = victimUuid
    record.consumed = true
    // 공개 사망 reveal은 반드시 이 지점에서 만든다 — 위 두 검증을 통과했다는 것은 victim이
    // 참가자로 실재하고 아직 alive:true였다는 뜻이므로, 여기서 만들어진 reveal은 정의상
    // "이번 판정이 실제로 alive→dead로 바꾼 참가자"만 담는다. victim이 없는 밤(무득표·보호
    // 성공·SKIP)은 빈 배열이고, 재판정 시도는 애초에 이 함수에 도달하지 못한다
    // (prepareNightResolution의 NIGHT_ALREADY_RESOLVED / assertSessionNotEnded).
    resolution.publicDeathReveals = buildNightDeathReveals(resolution, victimUuid === null ? [] : [victimUuid])
    session.nightResolution = resolution
    // 판정 순서 2단계 — 사망 확정.
    if (victim) {
        victim.alive = false
        victim.deathReason = DEATH_REASONS.ASSASSINATION
        observeNightCommit('NIGHT_DEATH_FINALIZED', { gameId: session.id, victimUuid, reason: DEATH_REASONS.ASSASSINATION })
    }
    // 판정 순서 3단계 — 사망자의 잔여 효과 소멸. 반드시 사망 확정 뒤에 온다.
    expireDeadPlayerNightEffects(session, victimUuid === null ? [] : [victimUuid])

    // 판정 순서 4단계 — 승리 재평가는 사망 이벤트 직후 항상, 낮 진입 전에 한다.
    const winResult = evaluateWinCondition(session)
    observeNightCommit('WIN_EVALUATED', { gameId: session.id, source: 'NIGHT', winner: winResult?.winner ?? null })
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
 * 재접속 유예가 만료된 참가자의 사망을 확정하는 유일한 mutation이다(밤 판정과 독립적으로
 * 호출할 수 있다는 점만 다르고, 판정 순서는 commitNightResolution의 2~4단계를 그대로 따른다):
 *   2. 사망 확정 — victim.alive = false.
 *   3. 사망자의 잔여 효과 소멸 — expireDeadPlayerNightEffects. 반드시 사망 확정 "뒤"에 온다.
 *   4. 승리 재평가 — 사망 이벤트 직후 항상. 승자가 확정되면 그 자리에서 ENDED가 된다.
 * 밤 판정과 달리 phase는 건드리지 않는다 — 유예 만료는 "그 참가자가 빠졌다"는 사건일 뿐,
 * 낮/밤을 넘기는 사건이 아니다(진행 중인 턴·구간은 그대로 이어진다).
 *
 * 멱등하다 — 이미 죽었거나(ALREADY_ELIMINATED) 이미 끝난 세션(GAME_ALREADY_ENDED)은 아무
 * 상태도 바꾸지 않고 실패 코드만 돌려준다. "재접속과 타이머 만료가 동시에 도착해도 중복으로
 * 사망 처리되지 않는다"는 계약이 소켓 계층의 타이머 가드가 아니라 여기서 구조적으로 보장된다.
 *
 * 검증을 통과한 뒤로는 절대 throw하지 않는다(commitNightResolution과 같은 계약) — 부분 커밋
 * 상태가 구조적으로 존재할 수 없다.
 *
 * 끊김 사망은 밤 판정이 아니므로 nightResolution/deathReveals를 만들거나 오염시키지 않는다.
 * 공개 방송 계약은 buildDisconnectEliminationPayload가 별도로 만들며 role/team/원인을 싣지 않는다.
 */
function commitDisconnectElimination(session, uuid) {
    if (nightCommitObserverBusy) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const victim = session.players.get(uuid)
    if (!victim) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (victim.alive !== true) return { ok: false, code: 'ALREADY_ELIMINATED' }

    // 이 지점 이후로는 절대 throw하지 않는다.
    victim.alive = false
    victim.deathReason = DEATH_REASONS.DISCONNECT
    observeNightCommit('DISCONNECT_DEATH_FINALIZED', { gameId: session.id, victimUuid: uuid, reason: DEATH_REASONS.DISCONNECT })
    expireDeadPlayerNightEffects(session, [uuid])

    if (!session.forfeitedUuids) session.forfeitedUuids = new Set()
    session.forfeitedUuids.add(uuid)
    // 배제된 uuid는 다시 접속하지 못하므로 스스로 "이탈"을 알릴 기회가 영영 없다. 여기서 미리
    // detachedUuids에 넣어 두지 않으면 ENDED 이후 마지막 참가자가 나가도 그 수가 채워지지 않아
    // 세션이 registry(gameSessions/roomGameSession)에 영원히 남는다.
    if (!session.detachedUuids) session.detachedUuids = new Set()
    session.detachedUuids.add(uuid)

    const winResult = evaluateWinCondition(session)
    // 이탈이 촉발한 승패 평가는 밤 최종화의 평가와 **출처로 구분**해 센다(A-08).
    observeNightCommit('WIN_EVALUATED', { gameId: session.id, source: 'DISCONNECT', winner: winResult?.winner ?? null })
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, victimUuid: uuid, terminal: { winner: winResult.winner } }
    }

    return { ok: true, victimUuid: uuid, terminal: null }
}

/**
 * F-21(AC-03/AC-05/AC-06): 진행 중인 세션에서 **참가자 한 명만** 빠지는 유일한 canonical
 * mutation이다. 방장 추방과 명시적 이탈, 재접속 유예 만료가 전부 이 함수 하나를 지난다 —
 * 세 경로가 각자 상태를 만지면 "추방은 사망으로, 이탈은 세션 삭제로" 같은 비대칭이 조용히
 * 생기고, 그 차이가 그대로 전적·보상의 차이가 된다(AC-03의 핵심).
 *
 * 생존자는 기존 `commitDisconnectElimination`을 **그대로 재사용한다** — 사망 원인·잔여 효과
 * 소멸·승패 재평가의 순서를 여기서 다시 적지 않는다. 이미 죽은 참가자는 사망을 다시 만들지
 * 않고 참여 종료만 기록한다: 기존 EXECUTION/ASSASSINATION을 DISCONNECT로 덮어쓰면 그 판의
 * 전적이 거짓이 되고, 사망 사건·효과음·승패 평가가 두 번 일어난다(A-06).
 *
 * "살아 있는가"와 "참여 중인가"는 끝까지 분리한다. 사망자도 결과·roster를 위해 참여 중일 수
 * 있고, 참여가 끝난 참가자도 session.players에는 남는다 — roster를 지우면 전적 레코드와
 * snapshot의 명단이 판마다 달라진다.
 *
 * 이 함수는 어떤 소켓도 알지 못하고 await도 두지 않는다. 방송·타이머·저장은 전부 호출부
 * (backend/socket/gameSession.js의 applyParticipantDeparture)의 몫이다.
 *
 * @param {object} session - canonical GameSession(이 함수가 직접 변형한다)
 * @param {string} uuid - 빠지는 참가자
 * @param {{reason?:string}} [options]
 * @returns {{ok:false,code:string}|{ok:true,...}}
 */
function commitParticipantDeparture(session, uuid, { reason = 'PARTICIPANT_LEFT' } = {}) {
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    // ENDED는 이 경계의 대상이 아니다 — 결과가 이미 확정된 판에서 "빠진다"는 것은 결과 화면을
    // 닫는 일이고, 그 정리는 endGameSessionForPlayer의 개인 detach가 이미 소유한다.
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const player = session.players.get(uuid)
    if (!player) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (player.isParticipating === false) return { ok: false, code: 'ALREADY_LEFT' }
    // 유예 만료로 이미 배제된 참가자도 "이미 빠진" 사람이다. isParticipating이 없는 구버전
    // 세션 객체까지 같은 답을 내도록 두 근거를 함께 본다.
    if (session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)) {
        return { ok: false, code: 'ALREADY_LEFT' }
    }

    const wasAlive = player.alive === true
    const phaseAtDeparture = session.phase
    const wasDefendant = session.phase === 'TRIBUNAL'
        && session.tribunal?.defendantUuid === uuid
        && session.tribunal?.resolved !== true

    // ── 1) 사망(또는 사망 없음) ────────────────────────────────────────────────
    let eliminated = false
    let terminal = null
    if (wasAlive) {
        const applied = commitDisconnectElimination(session, uuid)
        // 위에서 ENDED·참가자 존재·생존을 모두 확인했으므로 정상 경로에서는 실패하지 않는다.
        // 실패를 그대로 돌려주는 이유는, 실패했다는 것은 아직 **아무 상태도 바뀌지 않았다**는
        // 뜻이고(그 함수의 계약) 그럴 때 참여 종료만 따로 기록하면 사망 없는 유령이 남기 때문이다.
        if (!applied.ok) return applied
        eliminated = true
        terminal = applied.terminal
    } else {
        // 사망자: 원인·역할·roster를 그대로 두고 배제와 이탈만 기록한다(사망 사건 0회).
        if (!session.forfeitedUuids) session.forfeitedUuids = new Set()
        session.forfeitedUuids.add(uuid)
        if (!session.detachedUuids) session.detachedUuids = new Set()
        session.detachedUuids.add(uuid)
    }

    // ── 2) 참여 종료 ──────────────────────────────────────────────────────────
    player.isParticipating = false
    session.participationRevision =
        (Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0) + 1

    // 계정→세션 매핑은 **그 값이 이 게임일 때만** 지운다. 이 참가자가 이미 다른 새 게임에
    // 들어가 있다면 그 매핑은 이 판의 소유가 아니다(A-04).
    const released = playerSession.get(uuid) === session.id
    if (released) playerSession.delete(uuid)

    // ── 3) 방장 승계 — 아직 참여 중인 첫 참가자. 사망 여부는 보지 않는다 ─────────
    let hostChanged = false
    let newHostUuid = session.hostUuid ?? null
    if (session.hostUuid === uuid) {
        newHostUuid = null
        for (const candidate of session.players.values()) {
            if (candidate.uuid === uuid) continue
            if (candidate.isParticipating === false) continue
            newHostUuid = candidate.uuid
            break
        }
        session.hostUuid = newHostUuid
        hostChanged = true
    }

    // ── 4) 비종결 단계 정리 ───────────────────────────────────────────────────
    //
    // terminal이면 아무 것도 전이하지 않는다 — 이미 ENDED인 판의 준비·표·턴은 의미가 없고,
    // 여기서 건드리면 결과 화면이 읽는 최종 상태가 흔들린다.
    const cleanup = {
        removedRoleRevealAck: false,
        removedDayVoteReady: false,
        removedDayVote: false,
        normalizedVoterUuids: [],
        removedTribunalVote: false,
    }
    let tribunalCancelled = false

    if (!terminal) {
        if (session.roleRevealAcks instanceof Set) {
            cleanup.removedRoleRevealAck = session.roleRevealAcks.delete(uuid)
        }
        if (session.dayVoteReadyUuids instanceof Set) {
            cleanup.removedDayVoteReady = session.dayVoteReadyUuids.delete(uuid)
        }
        if (session.dayVotes instanceof Map) {
            cleanup.removedDayVote = session.dayVotes.delete(uuid)
            // 이탈자를 지목했던 **생존 잔류자**의 표만 기권(null)으로 정규화한다. 다른 표는
            // 그대로 둔다 — 정규화는 "이미 던진 표의 대상이 사라졌다"는 사실의 반영이지 새
            // 투표가 아니므로, 투표 참여 저장·제출 효과음을 새로 만들지 않는다.
            for (const [voterUuid, targetUuid] of session.dayVotes) {
                if (targetUuid !== uuid) continue
                session.dayVotes.set(voterUuid, null)
                cleanup.normalizedVoterUuids.push(voterUuid)
            }
        }
        if (session.nightActions instanceof Map) {
            session.nightActions.delete(uuid)
            // 이탈자를 겨눈 밤 행동도 함께 거둔다 — 사라진 대상을 향한 지목이 그대로 남으면
            // 밤 판정이 참가자 아님/사망 대상으로 거부돼 그 밤 전체가 멈춘다.
            for (const [actorUuid, targetId] of session.nightActions) {
                if (targetId === uuid) session.nightActions.set(actorUuid, null)
            }
        }

        if (session.tribunal && session.tribunal.resolved !== true) {
            if (session.tribunal.votes instanceof Map) {
                cleanup.removedTribunalVote = session.tribunal.votes.delete(uuid)
            }
            if (wasDefendant) {
                // 피고가 빠졌으므로 이 재판은 유죄도 무죄도 아니다. 진행 중이던 판정 준비를
                // 무효화하고(옛 prepare 결과로 커밋할 수 없게) 같은 날 밤으로 **한 번만**
                // 넘긴다 — 정상 무죄 전이와 같은 모양이라 뒤따르는 밤이 특별해지지 않는다.
                TRIBUNAL_PENDING.delete(session)
                const counts = tallyTribunalBallots(
                    buildTribunalBallotSnapshot(session, session.tribunal),
                    session.tribunal.defendantUuid,
                ).counts
                session.tribunal.outcome = TRIBUNAL_CANCELLED_OUTCOME
                session.tribunal.cancelReason = TRIBUNAL_CANCEL_REASONS.DEFENDANT_LEFT
                // 취소 순간의 유효 제출표다. 유죄/무죄의 확정이 아니라 "여기까지 모인 표"다.
                session.tribunal.counts = { guilty: counts.guilty, notGuilty: counts.notGuilty }
                session.tribunal.executedUuid = null
                session.tribunal.resolved = true
                session.phase = 'NIGHT'
                session.nightActions = new Map()
                session.nightResolution = null
                // F-25b: 지난 밤의 진행 기록을 이어받지 않는다.
                session.nightProgress = null
                tribunalCancelled = true
            }
        }
    }

    return {
        ok: true,
        reason,
        victimUuid: uuid,
        eliminated,
        terminal,
        wasAlive,
        phaseAtDeparture,
        hostChanged,
        newHostUuid,
        participationRevision: session.participationRevision,
        released,
        tribunalCancelled,
        cleanup,
    }
}

/** 피고 이탈로 취소된 재판의 outcome. GUILTY/NOT_GUILTY 어느 쪽도 아니라는 뜻이다. */
const TRIBUNAL_CANCELLED_OUTCOME = 'CANCELLED'

/** 재판 취소 사유의 단일 원천(지금은 하나뿐이지만 프런트가 문자열을 복붙하지 않게 한다). */
const TRIBUNAL_CANCEL_REASONS = Object.freeze({
    DEFENDANT_LEFT: 'DEFENDANT_LEFT',
})

/**
 * F-21(AC-03): 참여 상태 변화 공개 payload. 역할·진영·밤 행동자 수·개별 제출자는 싣지 않는다 —
 * 이 사건은 "누가 더 이상 이 판에 없는가"만 말한다. 낮/재판/역할확인의 **공개** 진행 수는
 * 이미 각 단계의 기존 방송이 공개하는 값이라 새로 드러나는 비밀이 없다.
 */
function buildParticipationChangedPayload(session, departedUuid) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        hostUuid: session.hostUuid ?? null,
        participationRevision: session.participationRevision ?? 0,
        departedUuid,
        players: [...session.players.values()].map((player) => ({
            uuid: player.uuid,
            membershipId: player.membershipId ?? null,
            alive: player.alive === true,
            isParticipating: player.isParticipating !== false,
        })),
        // 이탈로 **분모가 줄어든** 단계의 공개 진행 수. 화면이 스스로 계산하면 이탈자를 언제
        // 빼는지가 서버와 어긋난다(준비 3/4가 영원히 안 채워지는 화면이 된다).
        progress: buildPublicPhaseProgress(session),
    }
}

/**
 * F-21(AC-03): 지금 단계의 **공개** 진행 수. 이미 각 단계의 기존 방송이 공개하고 있는 값과
 * 같은 범위다 — 누가 했는지는 담지 않고 몇 명이 했는지만 담는다.
 *
 * NIGHT은 의도적으로 비어 있다. 밤의 행동자 수·제출자 목록은 역할 구성을 역산할 수 있는
 * 정보라 공개 계약이 아니다(계획 메모: "밤의 행동자 수·제출자 목록은 공개하지 않는다").
 */
function buildPublicPhaseProgress(session) {
    if (session.phase === 'ROLE_REVEAL') {
        const pending = [...session.players.values()].filter((p) => p.isParticipating !== false)
        const acks = session.roleRevealAcks instanceof Set ? session.roleRevealAcks : new Set()
        return {
            kind: 'ROLE_REVEAL',
            doneCount: pending.filter((p) => acks.has(p.uuid)).length,
            requiredCount: pending.length,
        }
    }
    if (session.phase === 'DAY') {
        const eligible = getEligibleDayVoterUuids(session)
        if (getDayPhase(session) === DAY_PHASES.DISCUSSION) {
            const ready = session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
            return {
                kind: 'DAY_DISCUSSION',
                doneCount: eligible.filter((uuid) => ready.has(uuid)).length,
                requiredCount: eligible.length,
            }
        }
        return {
            kind: 'DAY_VOTE',
            doneCount: eligible.filter((uuid) => session.dayVotes.has(uuid)).length,
            requiredCount: eligible.length,
        }
    }
    if (session.phase === 'TRIBUNAL' && session.tribunal) {
        const eligible = getEligibleTribunalVoterUuids(session, session.tribunal.defendantUuid)
        const votes = session.tribunal.votes instanceof Map ? session.tribunal.votes : new Map()
        return {
            kind: 'TRIBUNAL',
            doneCount: eligible.filter((uuid) => votes.has(uuid)).length,
            requiredCount: eligible.length,
        }
    }
    return { kind: session.phase === 'NIGHT' ? 'NIGHT' : 'NONE', doneCount: null, requiredCount: null }
}

/**
 * F-21(AC-03): 개인 제출 상태 전송 한 묶음마다 1씩 오르는 순서값을 발급한다.
 *
 * 이 값이 없으면 "이탈 당시의 미제출"과 "그 뒤의 평범한 제출"을 화면이 구별하지 못한다 —
 * 둘 다 같은 participationRevision을 달고 오기 때문이다(제출은 참여를 바꾸지 않는다). 개인
 * 값의 순서는 개인 값의 시계로 정해야 한다.
 *
 * 세션 객체 하나당 단조 증가이므로 어느 수신자 관점에서도 순서가 뒤집히지 않는다.
 */
function bumpSelfProgressSeq(session) {
    const next = (Number.isSafeInteger(session.selfProgressSeq) ? session.selfProgressSeq : 0) + 1
    session.selfProgressSeq = next
    return next
}

/**
 * F-21(AC-03): **수신자 본인의** 제출 상태. 다른 참가자의 선택은 하나도 담지 않는다.
 *
 * 표적이 이탈로 기권(null)으로 정규화된 뒤에도 화면이 옛 선택을 그대로 그리고 있으면, 사용자는
 * 자기 표가 아직 그 사람을 향하고 있다고 믿는다. 그래서 서버가 확정한 현재 값을 그대로 준다 —
 * 제출하지 않았으면 hasSubmitted:false이고 targetUuid는 null이다.
 */
function buildSelfSubmissionFields(session, uuid) {
    const fields = {}
    if (session.phase === 'ROLE_REVEAL') {
        fields.hasAcknowledgedRoleReveal = session.roleRevealAcks instanceof Set
            && session.roleRevealAcks.has(uuid)
        return fields
    }
    if (session.phase === 'DAY') {
        if (getDayPhase(session) === DAY_PHASES.DISCUSSION) {
            fields.isDayVoteReady = session.dayVoteReadyUuids instanceof Set
                && session.dayVoteReadyUuids.has(uuid)
            return fields
        }
        const submitted = session.dayVotes.has(uuid)
        fields.hasSubmittedDayVote = submitted
        const target = submitted ? session.dayVotes.get(uuid) : null
        // 기권으로 정규화된 표는 null이다 — 화면이 옛 표적을 남겨두지 않게 한다.
        fields.dayVoteTargetUuid = target === undefined ? null : target
        fields.dayVoteRound = getDayVoteRound(session)
        return fields
    }
    if (session.phase === 'TRIBUNAL' && session.tribunal) {
        fields.hasSubmittedTribunalVote = session.tribunal.votes instanceof Map
            && session.tribunal.votes.has(uuid)
        return fields
    }
    return fields
}

/** 끊김 사망 전용 공개 payload. 밤 결과와 원인 필드를 공유하지 않고 공개 생존 상태만 전달한다. */
function buildDisconnectEliminationPayload(session, victimUuid) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
    }
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
 *   → 4. registry 일관성(session 실존, uuid가 참가자) → 5. 이 dayIndex·이 라운드가 이미
 *   판정됐는지 → 6. DAY phase → 7. DAY_VOTE 하위 구간(토론 중이면 INVALID_DAY_PHASE)
 *   → 8. actor 생존 → 9. targetId가 문자열이면 참가자로 존재하는지
 *   → 10. 대상 생존 → 11. 자기 자신 대상 거부 → 12. 재투표 제외 대상 거부
 *   (TARGET_EXCLUDED_FROM_REVOTE) → 13. session.dayVotes에 저장.
 *
 * 7번이 토론 중 투표 제출을 막는 유일한 지점이다 — 재투표는 DAY_VOTE 안의 반복이므로 이
 * 가드에 걸리지 않는다(commitDayVoteResolution의 REVOTE 분기는 dayPhase를 건드리지 않는다).
 *
 * 5번의 판정 완료 검사는 dayIndex만이 아니라 라운드까지 함께 본다 — 동점 재투표(REVOTE)는
 * 같은 dayIndex에서 라운드만 올리므로, dayIndex만 보면 1라운드의 판정 기록이 2라운드 제출을
 * 통째로 막아버린다.
 *
 * 모든 실패 경로는 session.dayVotes를 절대 건드리지 않습니다 — submitNightAction과 동일한
 * 원칙(game-core는 소켓 계층의 가드를 신뢰하지 않고 이 함수 안에서 독립적으로 전부
 * 재검증합니다). 재제출은 기존 값을 최신 값으로 덮어씁니다.
 *
 * @param {string} uuid - 인증된 요청자 uuid
 * @param {string} gameId - 클라이언트가 알고 있는 gameId(신뢰하지 않음)
 * @param {string|null} targetId - 투표 대상 uuid 또는 명시적 기권을 뜻하는 null
 * @flow 위 13단계를 순서대로 평가하고, 어느 하나라도 실패하면 그 자리에서 반환한다.
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

    // 이 dayIndex·이 라운드가 이미 판정됐으면 outcome과 무관하게 거부한다 —
    // mutation(dayVotes.set) 전에 확인해 재제출이 이미 판정된 집계를 조용히 어긋나게 만들지
    // 못하게 한다. phase 검사보다 먼저 확인해야 한다: 판정이 성공하면 phase가 DAY를 벗어나므로
    // INVALID_PHASE로도 결과적으로 막히지만, "이미 판정됨"이라는 사실 자체를 별도 코드로
    // 구분해 응답한다. 라운드까지 비교하는 이유는 REVOTE만이 phase를 DAY에 남긴 채 라운드를
    // 올리기 때문이다(1라운드 판정 기록이 2라운드 제출을 막으면 재투표가 성립하지 않는다).
    if (
        session.dayVoteResolution !== null &&
        session.dayVoteResolution.dayIndex === session.dayIndex &&
        getResolutionRound(session.dayVoteResolution) === getDayVoteRound(session)
    ) {
        return { ok: false, code: 'DAY_VOTE_ALREADY_RESOLVED' }
    }
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    // 토론 중에는 투표를 받지 않는다 — 투표는 DAY_VOTE에서만 열린다(요구 1).
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    if (targetId !== null) {
        const target = session.players.get(targetId)
        if (!target) return { ok: false, code: 'INVALID_TARGET' }
        if (!target.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        if (targetId === uuid) return { ok: false, code: 'SELF_TARGET_NOT_ALLOWED' }
        // 재투표 라운드에서는 직전 라운드의 동점자가 후보에서 빠진다. 최초 투표에서는 이
        // 집합이 항상 비어 있으므로 이 검사가 아무것도 막지 않는다.
        if (getDayVoteExcludedUuids(session).has(targetId)) {
            return { ok: false, code: 'TARGET_EXCLUDED_FROM_REVOTE' }
        }
    }

    // 성공이 확정된 뒤에만 사건 메타데이터를 갱신한다 — 위의 모든 실패 경로는 dayVotes와
    // 마찬가지로 dayVoteSfx도 건드리지 않는다.
    const isFirstSubmission = !session.dayVotes.has(uuid)
    session.dayVotes.set(uuid, targetId)
    advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission)
    return { ok: true }
}

/**
 * F-16(AC-01/AC-04): 낮 투표 제출 사건 ID를 actor별로 갱신한다(submitDayVote 성공 직후에만 호출).
 *
 * revision을 올리는 조건은 **실제 변경**뿐이다 — 최초 제출(기권 null 포함)이거나 대상이
 * 바뀐 경우다. 같은 대상 재요청은 기존 revision·eventId를 그대로 유지하므로, 클라이언트가
 * 같은 표를 다시 보내도 새 소리가 나지 않는다.
 *
 * A→B→A는 세 번의 실제 변경이므로 revision 1·2·3의 서로 다른 ID가 된다 — uuid+target만으로
 * 키를 만들면 세 번째가 첫 번째와 같은 키가 되어 "중복"으로 묻힌다.
 *
 * eventId에는 target도 role도 넣지 않는다(AC-05) — 누가 누구를 찍었는지가 사건 ID나 로그로
 * 새어나가면 안 된다.
 *
 * 라운드/날짜가 다른 이전 기록은 "없음"과 같게 취급한다 — 재투표(새 round)와 다음 낮은
 * 각각 별도 범위이고, 그 안에서 revision은 1부터 다시 시작한다.
 */
function advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission) {
    const dayIndex = session.dayIndex
    const round = getDayVoteRound(session)
    const previous = session.dayVoteSfx instanceof Map ? session.dayVoteSfx.get(uuid) : undefined
    const inSameScope =
        previous !== undefined && previous.dayIndex === dayIndex && previous.round === round

    if (inSameScope && !isFirstSubmission && previous.targetId === targetId) return

    const revision = inSameScope ? previous.revision + 1 : 1
    if (!(session.dayVoteSfx instanceof Map)) session.dayVoteSfx = new Map()
    session.dayVoteSfx.set(
        uuid,
        Object.freeze({
            dayIndex,
            round,
            targetId,
            revision,
            eventId: `game:${session.id}:day:${dayIndex}:round:${round}:actor:${uuid}:vote:${revision}`,
        }),
    )
}

/**
 * F-16(AC-01): 방금 성공한 낮 투표 제출의 **불변** 사건 봉투를 돌려준다(순수 조회).
 *
 * submitDayVote의 반환값에 필드를 더하지 않는 이유는 이 파일이 이미 F-11에서 문서화한 것과
 * 같다 — 기존 dayVote 시험들이 deepEqual({ok:true})로 정확한 키 집합을 검증하므로, 반환
 * 계약을 바꾸는 대신 별도 조회 함수를 둔다(readDayVoteContext와 같은 관례).
 *
 * 소켓 핸들러는 submitDayVote 성공 **직후·어떤 await보다 먼저** 이 함수를 호출해 객체를
 * 캡처한다. 나중에 같은 actor가 다시 제출하면 위 advanceDayVoteSfx가 **새 객체**로 교체하므로,
 * 이미 캡처한 참조는 늦은 DB 완료 시점에도 다음 제출의 ID로 바뀌지 않는다.
 *
 * @returns {{dayIndex:number, round:number, revision:number, eventId:string}|null}
 */
function readDayVoteSubmitSfxEvent(uuid, gameId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return null
    const session = gameSessions.get(gameId)
    if (!session || !(session.dayVoteSfx instanceof Map)) return null
    const record = session.dayVoteSfx.get(uuid)
    if (record === undefined) return null
    // targetId는 공개 경계로 나가지 않는다 — 누구에게 투표했는지는 사건 봉투에 담지 않는다.
    return Object.freeze({
        dayIndex: record.dayIndex,
        round: record.round,
        revision: record.revision,
        eventId: record.eventId,
    })
}

/**
 * F-11: 투표 참여 사건을 저장할 때 필요한 최소 컨텍스트(day_index)만 읽어옵니다(상태를
 * 바꾸지 않는 순수 조회). submitDayVote가 이미 성공한 직후에만 호출되므로 존재 검증을
 * 다시 하지 않고, 세션이 없으면 null만 돌려줍니다 — submitDayVote의 반환 계약({ok:true})을
 * 건드리지 않기 위해 별도 함수로 둡니다(기존 dayVote 테스트들이 deepEqual({ok:true})로
 * 정확한 키 집합을 검증하므로, 반환값에 필드를 추가하면 그 계약이 깨집니다).
 *
 * 집계 키에는 재투표 차수(dayVoteRound)가 아니라 이 dayIndex만 들어갑니다(A-02) — 같은
 * dayIndex 안에서 재투표가 열려도 이미 기록된 사건은 다시 만들어지지 않습니다.
 *
 * @param {string} gameId
 * @returns {number|null}
 */
function getSessionDayIndex(gameId) {
    const session = gameSessions.get(gameId)
    return session ? session.dayIndex : null
}

/**
 * F-11 CODEX-1 재검토(AC-03): 투표 참여 사건을 저장하기 전에 "지금이 이 dayIndex의 최초
 * 투표 라운드인가"를 확인하기 위한 순수 조회입니다(상태를 바꾸지 않습니다). getSessionDayIndex와
 * 같은 이유로 별도 함수입니다 — submitDayVote의 반환 계약({ok:true})에 필드를 추가하지 않기
 * 위함입니다.
 *
 * A-01: "일반 낮 라운드당 1회"는 최초 투표 라운드(getDayVoteRound===1)의 유효한 비기권
 * 참여만을 뜻합니다("재판·재투표 자체는 새 사건을 만들지 않는다"). 최초 라운드에서 기권한
 * 참가자가 재투표(REVOTE, round>=2)에서 뒤늦게 비기권으로 돌아서더라도, 그 제출 자체는
 * "최초 일반 낮 투표"가 아니므로 새 사건을 만들면 안 됩니다 — 호출부(handleSubmitDayVote)는
 * 이 값이 1일 때만 저장을 시도합니다.
 *
 * @param {string} gameId
 * @returns {number|null}
 */
function getSessionDayVoteRound(gameId) {
    const session = gameSessions.get(gameId)
    return session ? getDayVoteRound(session) : null
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

/**
 * DAY_DISCUSSION의 "투표 시작 준비"를 처리합니다. 인증된 uuid와 클라이언트가 알고 있는 gameId만
 * 입력으로 받습니다(role 등 비밀 정보는 이 함수의 입력에도 출력에도 없습니다).
 *
 * acknowledgeRoleReveal과 같은 골격입니다 — 생존자 전원이 각자 한 번 보내고, 마지막으로 남은
 * 준비 하나가 도착하면 enterDayVotePhase로 DAY_VOTE를 엽니다. 그 이후의 모든 요청은 하위 구간
 * 가드에 걸려 INVALID_DAY_PHASE가 되므로 transitioned:true는 한 낮에 정확히 한 번만 나옵니다.
 * 타이머 기반 자동 전환은 이 슬라이스의 범위 밖이며(후속 슬라이스), 준비 취소도 없습니다.
 *
 * 준비 자격은 투표 자격과 같은 집합(getEligibleDayVoterUuids — 생존자)입니다. 두 규칙을 한
 * 함수로 묶어야 "준비는 했는데 투표는 못 하는" 참가자나, 사망자가 정족수를 막아 낮이 진행되지
 * 않는 교착이 생기지 않습니다. readyCount도 그 자격 집합 안에서만 셉니다 — 준비 뒤에 사망한
 * 참가자가 남긴 항목이 정족수를 오염시키지 못하게 하는 방어입니다(tallyDayVoteOutcome이
 * eligible voter만 순회하는 것과 같은 원칙).
 *
 * SESSION_NOT_FOUND/NOT_A_PARTICIPANT는 registry 불일치에서만 나오는 내부 진단용 코드이므로
 * 소켓 계층이 INTERNAL_ERROR로 정규화해야 합니다. INVALID_DAY_PHASE/ACTOR_NOT_ALIVE는
 * 클라이언트가 정상적으로 마주칠 수 있는 공개 코드입니다.
 *
 * @param {string} uuid - 인증된 요청자 uuid
 * @param {string} gameId - 클라이언트가 알고 있는 gameId(신뢰하지 않음)
 * @flow gameId 형태 → 세션 소유·registry 일관성 → 종료 → DAY phase → DAY_DISCUSSION →
 *       생존 → 중복(멱등) 순으로 검사하고, 통과하면 준비를 기록한 뒤 정족수가 차면 전이한다.
 */
function acknowledgeDayVoteReady(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    // acknowledgeRoleReveal과 동일하게 registry 불변조건을 "신뢰"만 하지 않고 직접 확인한다.
    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.DISCUSSION) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    const eligibleUuids = getEligibleDayVoterUuids(session)
    const readyUuids = session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
    session.dayVoteReadyUuids = readyUuids
    const countReady = () => eligibleUuids.filter((eligibleUuid) => readyUuids.has(eligibleUuid)).length

    // 같은 uuid의 중복 준비는 멱등이다 — 정족수를 두 번 채우지 못하므로 두 번째 준비만으로
    // 전이가 일어나는 경로가 없다.
    if (readyUuids.has(uuid)) {
        return { ok: true, transitioned: false, session, readyCount: countReady(), requiredCount: eligibleUuids.length }
    }

    readyUuids.add(uuid)
    const readyCount = countReady()
    if (readyCount === eligibleUuids.length) {
        enterDayVotePhase(session)
        return { ok: true, transitioned: true, session, readyCount, requiredCount: eligibleUuids.length }
    }
    return { ok: true, transitioned: false, session, readyCount, requiredCount: eligibleUuids.length }
}

/**
 * DAY_DISCUSSION→DAY_VOTE 전이를 참가자 전체에게 알리는 공용 payload. 참가자 식별·비밀 정보를
 * 전혀 포함하지 않는다 — round는 이미 buildDayVoteResolvedPayload가 공개하는 값이라 새로
 * 드러나는 정보가 없고, 재접속·재투표 표시에 필요하다.
 * @param {object} session - canonical GameSession(id/dayIndex/하위 구간만 읽는다)
 */
function buildDayPhaseChangedPayload(session) {
    return {
        gameId: session.id,
        dayIndex: session.dayIndex,
        dayPhase: getDayPhase(session),
        round: getDayVoteRound(session),
    }
}

// session.dayVotes를 집계해 TRIBUNAL/TIE/ABSTAINED 중 하나를 판정한다(순수 계산 — 어떤 상태도
// 바꾸지 않는다). resolveRoleNightAction의 PLURALITY와 동일한 tie-break 원칙(득표수만으로 비교하고,
// Map 순회 순서에 의존하지 않는다)을 따른다. 기권(null)은 별도로 세되 집계 대상에서 제외한다.
// 유효 표가 하나도 없으면(전원 기권) ABSTAINED, 최다 득표가 둘 이상이면 TIE, 그 외엔 단독
// 최다 득표자를 TRIBUNAL 대상으로 반환한다. 동률일 때는 공동 최다 득표 대상 전체를
// tiedTargetUuids(코드유닛 오름차순)로 함께 돌려준다 — 재투표에서 후보를 제외할 근거다.
// TIE를 REVOTE로 바꿀지(1라운드)의 판단은 이 함수가 아니라 prepareDayVoteResolution이 한다.
//
// 집계는 session.dayVotes 전체가 아니라 getEligibleDayVoterUuids(session)로 확정한 eligible
// alive voter 목록만 순회한다 — 사망 후 남은 entry나 non-eligible entry가 결과를 바꾸지 못하게
// 하기 위함이다. publicVoteCount는 이 eligible voter 총수이고(제출 완료 인원 전체 — 기권 포함),
// publicAbstainCount는 그중 null 제출 수다. 이번 라운드에서 제외된 대상을 향한 표는 기권으로
// 센다 — submitDayVote가 이미 막으므로 정상 경로에서는 도달할 수 없지만, 잔여·오염 entry가
// 제외된 후보를 다시 재판에 세우지 못하게 하는 방어 규칙이다(두 공개 집계 수치의 불변식
// "publicAbstainCount ≤ publicVoteCount"도 그대로 유지된다).
// @param {object} session - canonical GameSession(dayVotes/players/제외 집합을 읽기만 한다)
// @flow eligible voter를 순회해 표를 세고, 최다 득표를 찾은 뒤 공동 최다가 둘 이상인지로 분기한다.
/** 정렬된 uuid 목록 두 개가 같은가(판정 재검증 전용 — 어떤 상태도 읽지 않는 순수 비교다). */
function uuidListsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false
    }
    return true
}

function tallyDayVoteOutcome(session) {
    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    const excludedUuids = getDayVoteExcludedUuids(session)
    const voteCounts = new Map()
    let abstainCount = 0
    for (const voterUuid of eligibleVoterUuids) {
        const targetId = session.dayVotes.get(voterUuid)
        if (targetId === null || targetId === undefined || excludedUuids.has(targetId)) {
            abstainCount += 1
            continue
        }
        voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1)
    }
    const publicVoteCount = eligibleVoterUuids.length
    const publicAbstainCount = abstainCount

    if (voteCounts.size === 0) {
        return { outcome: 'ABSTAINED', tribunalTargetUuid: null, tiedTargetUuids: [], publicVoteCount, publicAbstainCount }
    }

    let winnerVotes = 0
    for (const votes of voteCounts.values()) {
        if (votes > winnerVotes) winnerVotes = votes
    }
    const topTargetUuids = [...voteCounts.entries()]
        .filter(([, votes]) => votes === winnerVotes)
        .map(([target]) => target)
        .sort()

    if (topTargetUuids.length > 1) {
        return {
            outcome: 'TIE',
            tribunalTargetUuid: null,
            tiedTargetUuids: topTargetUuids,
            publicVoteCount,
            publicAbstainCount,
        }
    }
    return {
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: topTargetUuids[0],
        tiedTargetUuids: [],
        publicVoteCount,
        publicAbstainCount,
    }
}

/**
 * F-21(AC-03): 준비 시점의 **표 내용 그 자체**를 동결해 둔다.
 *
 * 집계 수치(득표·기권·동률 집합)만 대조하면 표가 서로 **교환**된 변화를 잡지 못한다. 예를
 * 들어 A→B·B→A가 A→A·B→B로 바뀌면 두 표 모두 달라졌는데도 득표(각 1표)·기권 수·동률
 * 집합({A,B})이 전부 같다. 그 상태로 옛 판정을 커밋하면 "지금 표"가 아닌 판정이 확정된다 —
 * 재투표 제외 목록도, 방송되는 공개 수치도 이미 존재하지 않는 표의 산물이다.
 *
 * 그래서 (투표자, 표적) 쌍을 투표자 uuid로 정렬해 그대로 보관한다. 이 값은 resolution 안에만
 * 있고 어떤 공개 payload에도 실리지 않는다(buildDayVoteResolvedPayload는 필드를 명시적으로
 * 골라 담는다) — 남의 표를 드러내지 않는다.
 */
function buildDayVoteBallotSnapshot(session) {
    const ballots = getEligibleDayVoterUuids(session)
        .slice()
        .sort()
        .map((voterUuid) => {
            const target = session.dayVotes.get(voterUuid)
            return Object.freeze([voterUuid, target === undefined ? null : target])
        })
    return Object.freeze(ballots)
}

/** 두 표 스냅샷이 투표자·표적까지 정확히 같은가(순서는 이미 정렬돼 있다). */
function dayVoteBallotSnapshotsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false
    }
    return true
}

/**
 * DAY 투표 판정을 준비합니다(어떤 상태도 바꾸지 않는 순수 함수) — prepareNightResolution과
 * 동일한 prepare 경계입니다. 인증된 uuid와 클라이언트가 알고 있는 gameId·dayIndex만 입력으로
 * 받습니다.
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId/dayIndex 형태 → 2. uuid의 활성 세션 존재·gameId 일치 → 3. registry 일관성
 *   (session 실존, uuid가 참가자) → 4. dayIndex가 session.dayIndex와 정확히 일치
 *   → 5. 이 dayIndex·이 라운드가 이미 판정됐는지(완료 표식 — phase와 무관하게 이미 있으면 그
 *   결과를 그대로 담아 alreadyResolved:true로 성공 반환합니다. 판정 성공 시 phase가 DAY를
 *   벗어나므로, phase 검사보다 먼저 확인해야 재요청이 INVALID_PHASE가 아니라 멱등한 성공으로
 *   처리됩니다. REVOTE만은 phase를 DAY에 남기고 라운드를 올리므로, 그 뒤에 도착한 중복 요청은
 *   멱등한 성공이 아니라 2라운드의 ACTIONS_PENDING을 받습니다 — 라운드가 다르면 다른 판정입니다)
 *   → 6. DAY phase와 DAY_VOTE 하위 구간(토론 중이면 INVALID_DAY_PHASE)
 *   → 7. 생존자 전원의 dayVotes 제출 완료(ACTIONS_PENDING, 추가 정보 없음)
 *   → 8. 저장된 모든 non-null target이 여전히 canonical participant인지(TARGET_NOT_A_PARTICIPANT
 *   — internal-only, 소켓 계층이 INTERNAL_ERROR로 정규화).
 *
 * 동점 처리(판정 6.4/6.5): 1라운드가 동률이면 outcome은 TIE가 아니라 REVOTE이고,
 * revoteExcludedUuids에 동점자 전체가 담깁니다(commit이 그들을 후보에서 빼고 2라운드를 엽니다).
 * 2라운드 이후의 동률은 기존 TIE 그대로 — 처형 없이 그 밤으로 넘어갑니다. 두 라운드로 항상
 * 종결됩니다(2라운드에 후보가 하나도 남지 않으면 전원 기권 → ABSTAINED → NIGHT).
 *
 * 성공 시(신규 판정) { ok:true, session, resolution } — resolution은 commitDayVoteResolution에
 * 그대로 넘길 값입니다. 이미 판정된 경우 { ok:true, alreadyResolved:true, session, resolution }을
 * 반환하고, 호출자는 다시 commit하거나 재방송하지 않아야 합니다.
 *
 * @param {string} uuid - 인증된 요청자 uuid
 * @param {string} gameId - 클라이언트가 알고 있는 gameId(신뢰하지 않음)
 * @param {number} dayIndex - 클라이언트가 알고 있는 dayIndex(신뢰하지 않음)
 * @flow 위 8단계를 순서대로 평가하고, 통과하면 집계 결과의 동률 여부와 현재 라운드로 outcome을 고른다.
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

    const currentRound = getDayVoteRound(session)
    if (
        session.dayVoteResolution !== null &&
        session.dayVoteResolution.dayIndex === dayIndex &&
        getResolutionRound(session.dayVoteResolution) === currentRound
    ) {
        return { ok: true, alreadyResolved: true, session, resolution: session.dayVoteResolution }
    }

    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    // 토론 중에는 집계 자체가 열리지 않는다 — 제출이 하나도 없는 상태(생존자 1명 세션이라면
    // 0표 집계가 그대로 통과할 수도 있는 상태)에서 판정이 나가는 경로를 막는다.
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }

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
    // 1라운드 동률만 재투표로 바꾼다 — 2라운드 이후의 동률은 기존 TIE 계약(처형 없이 NIGHT)
    // 그대로다. 프런트가 아직 모르는 새 outcome을 TIE 자리에 끼워넣지 않는 이유이기도 하다.
    const isRevote = tally.outcome === 'TIE' && currentRound === 1
    return {
        ok: true,
        session,
        resolution: {
            gameId: session.id,
            dayIndex: session.dayIndex,
            round: currentRound,
            outcome: isRevote ? 'REVOTE' : tally.outcome,
            tribunalTargetUuid: tally.tribunalTargetUuid,
            publicVoteCount: tally.publicVoteCount,
            publicAbstainCount: tally.publicAbstainCount,
            // 이번 라운드에 이미 적용된 제외 목록과, 다음 라운드에 적용할 제외 목록.
            // 둘 다 정렬·동결된 복사본이라 판정 이후 누구도 바꿀 수 없다.
            excludedUuids: Object.freeze([...getDayVoteExcludedUuids(session)].sort()),
            revoteExcludedUuids: Object.freeze(isRevote ? [...tally.tiedTargetUuids] : []),
            // F-21(AC-03): 이 판정이 근거로 삼은 표 전체. 커밋 직전에 지금의 표와 정확히
            // 대조한다(집계가 우연히 같아도 표가 달라졌으면 다른 판정이다).
            ballotSnapshot: buildDayVoteBallotSnapshot(session),
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
 *
 * REVOTE(1라운드 동점)만은 phase를 DAY에 그대로 두고 라운드만 올린다 — 새 phase나 타이머를
 * 만들지 않고 동점 재투표를 표현하기 위해서다. 이때 동점자 전체가 dayVoteExcludedUuids로
 * 들어가고(그들에게는 투표할 수 없다) dayVotes는 새 빈 Map으로 교체된다. 라운드/제외 목록은
 * 다음 enterDayPhase가 최초 투표 상태로 되돌린다.
 *
 * 커밋 전에 resolution이 정말 "지금 이 세션의 이 라운드" 판정인지 확인한다 — 같은 resolution을
 * 두 번 커밋하면 라운드가 두 번 오르고 표가 두 번 지워지므로, 어긋나면 아무 것도 바꾸지 않고
 * DAY_VOTE_RESOLUTION_MISMATCH로 거부한다.
 *
 * @param {object} session - canonical GameSession(이 함수가 직접 변형한다)
 * @param {object} resolution - prepareDayVoteResolution이 반환한 판정 객체
 * @flow 종료·일관성 가드를 먼저 통과한 뒤 outcome이 TRIBUNAL / REVOTE / 그 외(TIE·ABSTAINED)인지로 분기한다.
 */
function commitDayVoteResolution(session, resolution) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (resolution.dayIndex !== session.dayIndex || getResolutionRound(resolution) !== getDayVoteRound(session)) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    // ── F-21(AC-03): 커밋 직전 재검증 ─────────────────────────────────────────
    //
    // 예전에는 dayIndex와 라운드만 봤다. 그 둘은 **참가자 이탈로 바뀌지 않는 값**이라, 판정을
    // 준비한 뒤 대상이 추방되거나 그 대상을 겨눈 표가 기권으로 정규화돼도 옛 판정이 그대로
    // 커밋됐다 — 사라진 사람을 재판에 세우거나, 이미 달라진 집계로 밤을 열 수 있었다.
    // TRIBUNAL 커밋이 이미 쓰고 있던 것과 같은 재검증을 여기에도 둔다.
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    if (session.phase !== 'DAY') return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }

    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    for (const voterUuid of eligibleVoterUuids) {
        // 준비된 표가 그대로인가 — 그 사이 투표자가 빠졌다면 남은 사람의 제출이 비어 있을 수 있다.
        if (!session.dayVotes.has(voterUuid)) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
        const target = session.dayVotes.get(voterUuid)
        if (target === null) continue
        const targetPlayer = session.players.get(target)
        if (!targetPlayer || !targetPlayer.alive) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    // 현재 표로 다시 집계해 준비된 판정과 대조한다. prepare와 **같은 재투표 승격 규칙**을
    // 여기서도 적용해야 REVOTE 경로가 스스로 어긋났다고 판정하지 않는다.
    const recheck = tallyDayVoteOutcome(session)
    const recheckOutcome = recheck.outcome === 'TIE' && getDayVoteRound(session) === 1 ? 'REVOTE' : recheck.outcome
    if (
        recheckOutcome !== resolution.outcome ||
        recheck.tribunalTargetUuid !== resolution.tribunalTargetUuid ||
        recheck.publicVoteCount !== resolution.publicVoteCount ||
        recheck.publicAbstainCount !== resolution.publicAbstainCount
    ) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    // 집계 수치만 대조하면 **동률 후보 집합**이 빠진다. outcome·대상·표수·기권 수가 모두
    // 같으면서 공동 최다 득표자만 달라지는 표 변화가 가능한데, 재투표 제외 목록은 바로 그
    // 집합에서 나온다 — 준비된 목록을 그대로 쓰면 지금의 동률과 다른 후보를 다음 라운드에서
    // 배제하게 된다. 이번 라운드에 적용된 제외 목록도 같은 이유로 함께 확인한다.
    const recheckRevoteExcluded = recheckOutcome === 'REVOTE' ? [...recheck.tiedTargetUuids].sort() : []
    if (!uuidListsEqual(recheckRevoteExcluded, resolution.revoteExcludedUuids ?? [])) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    if (!uuidListsEqual([...getDayVoteExcludedUuids(session)].sort(), resolution.excludedUuids ?? [])) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    // 마지막으로 **표 자체**를 대조한다. 위 검사들은 전부 집계에서 파생된 값이라, 표가 서로
    // 교환되기만 한 변화(A→B·B→A ⇒ A→A·B→B)는 전부 통과한다 — 득표·기권·동률 집합이 그대로이기
    // 때문이다. 그런 판정을 커밋하면 이미 존재하지 않는 표로 그 낮을 끝내게 된다. 준비 시점에
    // 동결해 둔 (투표자, 표적) 쌍과 지금의 쌍이 정확히 같을 때만 통과한다.
    //
    // ballotSnapshot이 없는 resolution은 이 재검증을 건너뛰지 않는다 — prepare가 항상 함께
    // 만들므로, 없다는 것은 이 함수가 소비해서는 안 되는 값이 들어왔다는 뜻이다(fail-closed).
    if (!dayVoteBallotSnapshotsEqual(buildDayVoteBallotSnapshot(session), resolution.ballotSnapshot)) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    // 재판 대상이 지금도 살아 있는 참가자인지 마지막으로 확인한다.
    if (resolution.outcome === 'TRIBUNAL') {
        const defendant = session.players.get(resolution.tribunalTargetUuid)
        if (!defendant || defendant.alive !== true) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    session.dayVoteResolution = resolution
    if (resolution.outcome === 'TRIBUNAL') {
        session.phase = 'TRIBUNAL'
        session.tribunal = {
            candidateId: resolution.tribunalTargetUuid,
            dayIndex: session.dayIndex,
            defendantUuid: resolution.tribunalTargetUuid,
            votes: new Map(),
        }
    } else if (resolution.outcome === 'REVOTE') {
        // phase는 DAY 그대로다 — 밤으로 넘어가지 않고 같은 낮에서 한 번 더 투표한다.
        // dayPhase도 의도적으로 건드리지 않는다: 한 번 열린 DAY_VOTE는 그 낮이 끝날 때까지
        // DAY_VOTE이므로 재투표는 자동으로 그 안의 반복이 된다(토론으로 되돌아가 준비를 다시
        // 요구하면 교착이 생긴다 — 요구 3의 계약).
        session.tribunal = null
        session.dayVoteRound = getResolutionRound(resolution) + 1
        session.dayVoteExcludedUuids = new Set(resolution.revoteExcludedUuids ?? [])
        session.dayVotes = new Map()
        // F-16: 재투표는 별도 라운드 범위다 — revision이 1부터 다시 시작한다.
        session.dayVoteSfx = new Map()
    } else {
        // TRIBUNAL/TIE/ABSTAINED는 phase가 DAY를 벗어나므로 dayPhase는 그 순간부터 어떤
        // 게이트의 입력도 아니다 — dayVoteResolution/tribunal을 남겨두는 기존 관례와 동일하게
        // 굳이 null로 되돌리지 않고, 다음 enterDayPhase가 DAY_DISCUSSION으로 덮어쓴다.
        session.tribunal = null
        session.phase = 'NIGHT'
        session.nightActions = new Map()
        session.nightResolution = null
        // F-25b: 지난 밤의 진행 기록을 이어받지 않는다.
        session.nightProgress = null
    }
    return { ok: true }
}

/**
 * DAY 투표 판정 공개 payload. voterUuid→targetUuid 매핑, role, team, socketId, 내부 Map/Set은
 * 어디에도 포함하지 않습니다 — 공개 집계 수치와 결과 판정만 담습니다.
 *
 * round와 revoteExcludedUuids는 재투표를 위한 공개 계약입니다 — 어느 라운드의 결과인지와
 * 다음 라운드에서 후보 자격을 잃은 사람이 누구인지는 전원이 알아야 하는 정보입니다(동점자
 * 자체가 공개 집계에서 유도되는 값이라 새로 드러나는 비밀이 없습니다).
 * revoteExcludedUuids는 매 호출마다 새 배열로 복사하므로 수신자가 변형해도 canonical
 * resolution은 오염되지 않습니다.
 *
 * @param {object} session - canonical GameSession(id/phase만 읽는다)
 * @param {object} resolution - prepareDayVoteResolution이 반환한 판정 객체
 */
function buildDayVoteResolvedPayload(session, resolution) {
    return {
        gameId: session.id,
        dayIndex: resolution.dayIndex,
        phase: session.phase,
        round: getResolutionRound(resolution),
        outcome: resolution.outcome,
        tribunalTargetUuid: resolution.tribunalTargetUuid,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
        revoteExcludedUuids: [...(resolution.revoteExcludedUuids ?? [])],
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

/**
 * F-16(AC-01): 재판 투표 "제출" 사건의 불변 봉투(순수 조회).
 *
 * 재판 투표는 votes.has(uuid)면 TRIBUNAL_VOTE_ALREADY_SUBMITTED로 실패하므로 **최초 성공이
 * 정확히 한 번**이다. 그래서 낮 투표와 달리 revision이 필요 없고, (게임, 날짜, actor) 하나로
 * 이미 안정적이다 — 중복 실패에는 애초에 봉투가 붙지 않는다.
 *
 * castTribunalVote의 반환 계약(정확히 {ok,gameId,dayIndex,vote})은 시험이 키 집합까지
 * 검증하므로 건드리지 않고, readDayVoteSubmitSfxEvent와 같은 관례로 별도 조회를 둔다.
 * 투표 내용(GUILTY/NOT_GUILTY)은 봉투에 담지 않는다(AC-05).
 *
 * @returns {{dayIndex:number, eventId:string}|null}
 */
function readTribunalVoteSubmitSfxEvent(uuid, gameId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    const tribunal = session.tribunal
    if (!tribunal || !(tribunal.votes instanceof Map)) return null
    if (!tribunal.votes.has(uuid)) return null
    const dayIndex = tribunal.dayIndex
    if (!Number.isInteger(dayIndex)) return null
    return Object.freeze({
        dayIndex,
        eventId: `game:${session.id}:day:${dayIndex}:actor:${uuid}:tribunal-submitted`,
    })
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

    if (resolution.outcome === 'GUILTY') {
        defendant.alive = false
        defendant.deathReason = DEATH_REASONS.EXECUTION
    }
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
    // F-25b: 지난 밤의 진행 기록을 이어받지 않는다.
    session.nightProgress = null
    return { ok: true, terminal: null }
}

/**
 * TRIBUNAL 판정 공개 payload. top-level 키는 정확히
 * [counts, dayIndex, defendantUuid, executedRole, executedUuid, gameId, outcome, phase]뿐입니다 —
 * voterUuid별 개별 표(ballotSnapshot)나 처형되지 않은 참가자의 role/team 등은 어디에도 없습니다.
 *
 * executedRole은 "이번 처형으로 죽은 사람의 역할"입니다 — 처형된 참가자의 역할은 스펙상 전원에게
 * 공개되는 정보입니다(판정 6.6/8.2). 최상위 role이 아니라 executedRole이라는 이름을 쓰는 이유는,
 * 이 저장소에서 최상위 role 키가 "이 payload를 보는 본인의 역할"을 뜻하는 예약된 의미이기
 * 때문입니다(buildViewerRoleFields). 처형이 없었다면(NOT_GUILTY) executedUuid와 함께 null입니다.
 *
 * F-21(AC-03): outcome은 CANCELLED일 수도 있습니다 — 피고가 이 판에서 빠져 재판 자체가 성립하지
 * 않은 경우입니다. 그때 counts는 **취소 순간까지 모인 유효 제출표**일 뿐 유죄/무죄의 확정이
 * 아니며 executedUuid는 언제나 null입니다. reason 키는 취소일 때만 만듭니다(선택 필드 관례).
 *
 * @param {object} session - canonical GameSession(id/phase/tribunal/players를 읽기만 한다)
 */
function buildTribunalVoteResolvedPayload(session) {
    const tribunal = session.tribunal
    const executedUuid = tribunal.executedUuid
    return {
        ...(tribunal.outcome === TRIBUNAL_CANCELLED_OUTCOME
            ? { reason: tribunal.cancelReason ?? TRIBUNAL_CANCEL_REASONS.DEFENDANT_LEFT }
            : {}),
        gameId: session.id,
        dayIndex: tribunal.dayIndex,
        phase: session.phase,
        defendantUuid: tribunal.defendantUuid,
        outcome: tribunal.outcome,
        counts: { guilty: tribunal.counts.guilty, notGuilty: tribunal.counts.notGuilty },
        executedUuid,
        executedRole: executedUuid ? session.players.get(executedUuid)?.role ?? null : null,
    }
}

// uuid 본인이 현재 phase에서 이미 제출을 마쳤는지(순수 계산 — 어떤 상태도 바꾸지 않는다).
// 항상 .has()로만 판정한다(.get() !== undefined가 아님) — session.nightActions/dayVotes는
// SKIP/기권을 null 값으로 저장하므로, .get()은 "미제출"과 "SKIP 제출"을 구분하지 못한다.
// DAY는 하위 구간마다 "제출"의 뜻이 다르다 — 토론에서는 투표 시작 준비, 투표에서는 표다.
// 재접속한 클라이언트가 "내가 이미 준비를 눌렀는가"를 알아야 준비 버튼이 두 번 나오지 않는다.
function computeHasActedThisPhase(session, uuid) {
    switch (session.phase) {
        case 'ROLE_REVEAL':
            return session.roleRevealAcks.has(uuid)
        case 'NIGHT':
            return session.nightActions.has(uuid)
        case 'DAY':
            if (getDayPhase(session) === DAY_PHASES.VOTE) return session.dayVotes.has(uuid)
            return session.dayVoteReadyUuids instanceof Set && session.dayVoteReadyUuids.has(uuid)
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
 * 담는다.
 *
 * @param {object} session - canonical GameSession(읽기만 한다)
 * @param {string} uuid - 스냅샷을 받을 참가자 본인의 uuid(viewer)
 * @flow 항상 top-level을 만든 뒤, nightResolution·DAY/TRIBUNAL 노출 조건·winResult를 각각 확인해 선택 필드를 덧붙인다.
 */
function buildSessionSnapshot(session, uuid) {
    const viewer = session.players.get(uuid)
    const themeIndices = buildPlayerThemeIndices(session)
    const fields = {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        // F-21(AC-01): 방장은 공개 정보다(대기방에서도 그랬다). 새로고침 한 번에 방관리 권한이
        // 사라지거나 옛 방장에게 남는 일이 없도록 서버 값을 그대로 싣는다. 비밀 필드(self)와
        // 섞지 않는다 — 이 값은 전원이 같은 답을 본다.
        hostUuid: session.hostUuid ?? null,
        // game_started와 **같은 세 식별자**다. 새로고침으로 메모리 store가 비어도 방장이
        // 추방 요청을 만들 수 있어야 한다(그 값들이 없으면 새로고침 한 번에 방관리가 멈춘다).
        roomId: session.roomId ?? null,
        roomInstanceId: session.roomInstanceId ?? null,
        bootEpoch: session.bootEpoch ?? null,
        // F-24(AC-01/AC-04): game_started와 **같은 두 필드**다. 새로고침으로 메모리 store가
        // 비어도 진행 중 방 코드 보기와 다음 방 설정 유지가 같은 근거를 다시 얻는다.
        roomCode: session.roomCode ?? null,
        ...buildRoomSettingsSourceFields(session),
        // 참여 상태의 세대. 이 사건 이전에 캡처된 snapshot·ACK가 최신 참여 상태를 되돌리지
        // 못하도록 프론트가 적용 세대와 함께 검사한다(AC-03/AC-05).
        participationRevision: session.participationRevision ?? 0,
        // F-21(AC-03): 이 스냅샷이 말하는 **개인 제출 상태**의 순서값. 재접속 스냅샷 조회는
        // 비동기라, 조회가 발행된 뒤에 낸 제출이 먼저 반영되고 그 뒤에 옛 스냅샷이 도착하면
        // 방금 낸 표가 화면에서 사라진다(참여 세대는 같으므로 기존 검사로는 잡히지 않는다).
        selfProgressSeq: session.selfProgressSeq ?? 0,
        // dayPhase는 낮에서만 의미가 있으므로 phase가 DAY일 때만 키 자체를 만든다
        // (nightResult/tribunal의 선택 필드 관례와 동일). 이 값이 없으면 재접속 클라이언트가
        // 토론과 투표를 구분하지 못해 그 낮에 갇힌다.
        ...(session.phase === 'DAY' ? { dayPhase: getDayPhase(session) } : {}),
        players: [...session.players.values()].map((player, index) => ({
            uuid: player.uuid,
            nickname: player.nickname,
            isAlive: player.alive,
            // F-21(AC-03/AC-06): 생존과 분리된 사실이다. 보드의 사망 표시는 isAlive가, 추방
            // 목록의 포함 여부는 이 값이 결정한다 — 사망했어도 참여 중이면 추방할 수 있다.
            isParticipating: player.isParticipating !== false,
            // 이 판에서의 서버 소속 식별자. 추방 요청이 대상을 지목하는 근거다.
            membershipId: player.membershipId ?? null,
            // game_started와 같은 session-id 기반 순열을 다시 계산한다. 메모리 store가 사라진
            // 새로고침에서도 참가자별 색·보드 슬롯이 최초 진입과 정확히 같아진다.
            themeIndex: themeIndices[index % PLAYER_THEME_PALETTE_SIZE],
            // F-13(AC-05): 세션 커밋 시점에 session.players로 복사된(assignRoles의 스프레드,
            // A-04) 계정 프로필 식별자를 그대로 재노출한다 — game_started와 동일한 값이라
            // 재접속·새로고침 후에도 preview 기본 이미지로 되돌아가지 않는다.
            ...buildPlayerAccountProfileFields(player),
        })),
        self: {
            ...buildViewerRoleFields(session, viewer),
            hasActedThisPhase: computeHasActedThisPhase(session, uuid),
            // F-21(AC-03): hasActedThisPhase만으로는 **무엇을** 제출했는지 복원하지 못한다.
            // 표적이 이탈로 기권(null)으로 정규화된 뒤 재접속하면, 화면은 서버가 이미 지운
            // 선택을 그대로 그린 채로 남는다. 수신자 본인의 값만 담는다(남의 선택은 없다).
            ...buildSelfSubmissionFields(session, uuid),
        },
        // 이탈로 분모가 바뀌는 단계의 공개 진행 수. 화면이 스스로 세면 "이탈자를 언제 빼는가"가
        // 서버와 어긋나 준비 3/4가 영원히 채워지지 않는다. NIGHT은 비어 있다(공개 계약 아님).
        progress: buildPublicPhaseProgress(session),
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
            // round/revoteExcludedUuids도 함께 싣는다 — 재투표가 열려 있는 DAY로 재접속한
            // 클라이언트가 "지금이 몇 라운드이고 누가 후보에서 빠졌는지"를 모르면 그 낮에
            // 갇힌다(제외된 후보에게 투표해 계속 거부당한다). 둘 다 공개 계약이다
            // (buildDayVoteResolvedPayload 참고).
            const { round, outcome, tribunalTargetUuid, publicVoteCount, publicAbstainCount, revoteExcludedUuids } =
                buildDayVoteResolvedPayload(session, session.dayVoteResolution)
            fields.dayVoteResolution = {
                round,
                outcome,
                tribunalTargetUuid,
                publicVoteCount,
                publicAbstainCount,
                revoteExcludedUuids,
            }
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

    if (session.winResult) fields.winResult = { ...session.winResult }

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
    if (!gameId) {
        // F-21(AC-06): 이탈·추방·유예 만료로 배제된 계정은 playerSession 매핑이 풀린다(그래야
        // 다른 새 게임에 들어갈 수 있다). 그 상태에서 옛 gameId로 스냅샷을 물으면 "참가자가
        // 아님"(내부 오류로 정규화된다)이 아니라 **참여 불가 사유**를 알려야 한다 — 그 안내를
        // 받은 클라이언트만 재시도를 멈추고 로비로 돌아갈 수 있다. 여기서 세션을 직접 찾더라도
        // 스냅샷은 절대 만들지 않는다(복귀를 허용하지 않는다).
        const normalized = typeof expectedGameId === 'string' ? expectedGameId.trim() : ''
        if (normalized && isForfeitedFromSession(normalized, uuid)) {
            return { ok: false, code: 'FORFEITED_FROM_SESSION' }
        }
        return { ok: false, code: 'NOT_A_PARTICIPANT' }
    }

    const session = gameSessions.get(gameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    // 유예 만료로 배제된 uuid는 gameId가 맞든 틀리든 스냅샷을 받지 못한다 — 거부는 스냅샷을
    // 만들기 전에 끝나야 하고(그 뒤로 가면 이미 판정이 틀린 것이다), 참여 자격 없음은 gameId
    // 오타와 다른 사유이므로 별도의 안정된 공개 코드로 알린다.
    if (isForfeitedFromSession(gameId, uuid)) return { ok: false, code: 'FORFEITED_FROM_SESSION' }

    if (expectedGameId !== undefined) {
        const normalizedExpected = typeof expectedGameId === 'string' ? expectedGameId.trim() : ''
        if (!normalizedExpected || normalizedExpected !== session.id) {
            return { ok: false, code: 'GAME_ID_MISMATCH' }
        }
    }

    return { ok: true, snapshot: buildSessionSnapshot(session, uuid) }
}

/**
 * NIGHT 단계 역할별 채팅 메시지를 검증합니다(어떤 상태도 바꾸지 않는 순수 함수). 인증된
 * uuid와 클라이언트가 알고 있는 gameId, 원문 text만 입력으로 받습니다 — role/team/senderUuid
 * 등은 이 함수의 입력에 아예 없습니다(클라이언트가 그런 필드를 함께 보내도 무시됩니다).
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 정규화(trim 후 빈 문자열 거부) → 2. uuid의 활성 세션 존재·gameId 일치
 *   → 3. registry 일관성(session 실존, uuid가 참가자) → 4. NIGHT phase
 *   → 5. 발신자가 생존했는지(사망 JOKER만 예외) → 6. sanitizeChatText
 *   → 7. now()를 정확히 한 번 호출해 sentAt을 계산하고 유효성 검증(INVALID_CLOCK_VALUE)
 *   → 8. jokerChatRateLimit을 읽기만 해서 rate limit 판정(RATE_LIMITED).
 *
 * 생존자는 자신의 역할 채널을 사용하고, 사망한 광대만 JOKER 채널에서 계속 말하고 듣습니다.
 * 공개 채팅은 사망자의 발행을 전부 거부합니다(resolveGameChatChannel).
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
    if (actor.alive !== true && actor.role !== GAME_ROLES.JOKER) return { ok: false, code: 'NOT_ELIGIBLE' }

    const sanitized = sanitizeChatText(text)
    if (!sanitized.ok) return sanitized

    const sentAt = now()
    if (!Number.isFinite(sentAt) || !Number.isInteger(sentAt) || sentAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }

    const channel = actor.role
    const lastSentAt = getChatRateLimitMap(session, channel).get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'RATE_LIMITED' }
    }

    return { ok: true, session, channel, actorUuid: uuid, sanitizedText: sanitized.text, sentAt }
}

/** JOKER 채팅의 유일한 mutation — prepareJokerChatMessage가 반환한 session/uuid/sentAt으로 rate limit을 갱신합니다. */
function commitJokerChatMessage(session, uuid, sentAt) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (actor.alive !== true && actor.role !== GAME_ROLES.JOKER) return { ok: false, code: 'NOT_ELIGIBLE' }

    const rateLimitMap = getChatRateLimitMap(session, actor.role)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }
    rateLimitMap.set(uuid, sentAt)
    return { ok: true }
}

/**
 * 공개 DAY 채팅의 단일 검증 진입점입니다(어떤 상태도 바꾸지 않는 순수
 * 함수). prepareJokerChatMessage와 마찬가지로 인증된 uuid·클라이언트가 알고 있는 gameId·원문
 * text만 입력으로 받습니다 — 채널·발신자·닉네임·수신자·dayIndex는 전부 canonical 상태에서
 * 유도되며, 클라이언트가 그런 필드를 함께 보내도 이 함수의 입력에 아예 없습니다.
 *
 * 검증 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. gameId 정규화(trim 후 빈 문자열 거부) → 2. uuid의 활성 세션 존재·gameId 일치
 *   → 3. registry 일관성(session 실존, uuid가 참가자) → 4. 종료 여부(GAME_ALREADY_ENDED)
 *   → 5. resolveGameChatChannel로 채널 유도(사망자는 NOT_ELIGIBLE, 생존자는 DAY에서만
 *   통과하고 그 외 phase는 INVALID_PHASE)
 *   → 6. sanitizeChatText → 7. now()를 정확히 한 번 호출해 sentAt 계산·검증
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
 *      대조 — 현재 phase/생존 권한을 여기서 다시 통과해야 한다. 그 사이 DAY→NIGHT 전이가
 *      있었으면 INVALID_PHASE로, 생존→사망 전이가 있었으면 NOT_ELIGIBLE로 거부된다(발행
 *      권한을 잃은 요청은 준비돼 있었더라도 커밋되지 않는다). STALE_CHAT_CHANNEL은 유도된
 *      채널이 발급 당시와 달라지는 경우를 위한 방어선으로 남겨 둔다. dayIndex도 발급 당시와
 *      같아야 한다.
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
 * sentAt을 씁니다 — 다른 채널의 Map은 절대 건드리지 않습니다. 실패한 commit은 어느
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
        // Capture ownership before detaching: earlier leavers may already own a new room/game.
        const cleanupUuids = [...session.players.keys()].filter((playerUuid) => playerSession.get(playerUuid) === gameId)
        // ENDED 세션은 첫 이탈에 registry 전체를 지우지 않는다 — 참가자마다 개별적으로
        // "이탈"만 반영하고, 마지막 참가자가 이탈할 때만 세션 자체를 registry에서 지운다.
        if (!session.detachedUuids) session.detachedUuids = new Set()
        session.detachedUuids.add(uuid)
        playerSession.delete(uuid)

        const sessionDeleted = session.detachedUuids.size >= session.players.size
        if (sessionDeleted) {
            gameSessions.delete(gameId)
            if (roomGameSession.get(session.roomId) === gameId) roomGameSession.delete(session.roomId)
            // 비-ENDED 분기와 같은 마무리를 여기서도 한다 — 유예 만료로 배제된 참가자는
            // detachedUuids에 미리 들어가 있을 뿐 playerSession 매핑은 남아 있으므로, 이
            // 정리가 없으면 그 uuid만 영영 "다른 세션에 속함" 상태로 묶여 새 게임을 시작하지
            // 못한다. 이미 지워진 uuid에 대한 delete는 no-op이라 기존 경로는 그대로다.
            cleanupUuids.forEach((playerUuid) => playerSession.delete(playerUuid))
        }
        return { ok: true, session, reason, sessionDeleted, cleanupUuids }
    }

    const cleanupUuids = [...session.players.keys()].filter((playerUuid) => playerSession.get(playerUuid) === gameId)
    gameSessions.delete(gameId)
    if (roomGameSession.get(session.roomId) === gameId) roomGameSession.delete(session.roomId)
    cleanupUuids.forEach((playerUuid) => playerSession.delete(playerUuid))

    return { ok: true, session, reason, sessionDeleted: true, cleanupUuids }
}

/** 테스트 전용: 모듈 내부 상태를 초기화합니다. 런타임 코드에서는 호출하지 마세요. */
function __resetStateForTests() {
    gameSessions.clear()
    playerSession.clear()
    roomGameSession.clear()
    // F-25b: 관찰자가 남으면 다음 테스트의 커밋이 이전 테스트의 배열에 사건을 쌓는다.
    nightCommitObserver = null
    nightCommitObserverBusy = false
    // 채팅 능력 기록은 WeakMap이라 지울 대상이 없다 — prepared 객체가 버려지면 함께 사라진다.
}

/** 운영 지표용 read-only 조회: 활성 세션 수와 모든 참가자 uuid를 복제해 반환합니다. */
function getActiveGamePresenceSnapshot() {
    const participantUuids = new Set()
    for (const session of gameSessions.values()) {
        for (const uuid of session.players.keys()) participantUuids.add(uuid)
    }
    return { room_count: gameSessions.size, participantUuids }
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
    DAY_PHASES,
    acknowledgeDayVoteReady,
    buildDayPhaseChangedPayload,
    // 낮 페이즈 타이머(소켓 계층)가 소비하는 공개 계약 — 밤 턴 진행 규칙과 같은 이유로
    // __testables가 아니라 정식 export다. getDayPhase/getEligibleDayVoterUuids/enterDayVotePhase는
    // 기존 테스트 호환을 위해 __testables에도 같은 참조로 남아 있다.
    DAY_DISCUSSION_DURATION_MS,
    DAY_VOTE_DURATION_MS,
    getDayPhase,
    getDayVoteRound,
    enterDayVotePhase,
    getEligibleDayVoterUuids,
    submitNightAction,
    // 밤 턴 진행 규칙(순서·제한시간·payload·완료 판정)은 소켓 계층의 턴 오케스트레이터가
    // 그대로 소비하는 공개 계약이므로 __testables가 아니라 정식 export다.
    NIGHT_TURN_ORDER,
    NIGHT_TURN_DURATION_MS,
    buildNightTurnStartedPayload,
    buildNightTurnEndedPayload,
    getAliveActorUuidsForRole,
    isRoleTurnComplete,
    getCurrentNightTurnRole,
    submitDayVote,
    getSessionDayIndex,
    getSessionDayVoteRound,
    // F-16(AC-01/AC-04): 투표 제출 사건 봉투 조회(순수). 소켓 핸들러가 성공 직후·await 전에 캡처한다.
    readDayVoteSubmitSfxEvent,
    readTribunalVoteSubmitSfxEvent,
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareGameChatMessage,
    commitGameChatMessage,
    getChatRecipientUuids,
    CHAT_CHANNELS,
    prepareNightResolution,
    // F-25b: 세션 단위 준비/역할 완료 경계. 소켓 계층의 턴 오케스트레이터와 공통 밤 최종화가
    // 직접 부르는 진입점이라 __testables가 아니라 정식 export다.
    prepareNightResolutionForSession,
    completeNightRole,
    isNightRoleCompleted,
    markNightSequenced,
    // F-25: 역할 턴이 끝난 직후의 **내부** 사건·수신 대상 계산이 읽는 진행 자료 조회기와 제출
    // 수집기. 소켓 계층의 연출 계약이 production 경로에서 그대로 부르므로 __testables가 아니라
    // 정식 export다(같은 함수 참조가 __testables에도 그대로 남아 기존 시험은 영향받지 않는다).
    // 반환값은 **살아 있는 내부 자료**다 — 호출부는 읽고 즉시 복사할 뿐 변형하지 않는다.
    getNightProgress,
    collectRoleNightSubmissions,
    // 회복 상태 열거값. 소켓 계층이 core와 **같은** 회복 제외 규칙을 적용해야 하므로,
    // 문자열을 다시 적지 않도록 값 자체를 노출한다.
    NIGHT_RECOVERY_STATES,
    commitNightResolution,
    // 끊김 사망은 밤 판정과 같은 순서 계약을 공유하지만 소켓 계층의 유예 타이머가 직접 부르는
    // 진입점이므로, 밤 판정 3인방과 나란히 정식 export로 둔다.
    commitDisconnectElimination,
    buildDisconnectEliminationPayload,
    // F-21(AC-03): 추방·명시적 이탈·유예 만료가 공유하는 개인 이탈 커밋과 그 공개 사건.
    // 소켓 계층이 직접 부르는 진입점이라 __testables가 아니라 정식 export다.
    commitParticipantDeparture,
    buildParticipationChangedPayload,
    // F-21(AC-03): 이탈로 분모·본인 표가 바뀐 단계의 공개 진행 수와 **수신자 본인의** 제출
    // 상태. 소켓 계층이 각각 공개 방송과 개인 전송에 싣는다.
    buildPublicPhaseProgress,
    buildSelfSubmissionFields,
    // 개인 제출 상태 전송의 순서값 발급. 소켓 계층이 한 묶음마다 한 번 부른다.
    bumpSelfProgressSeq,
    advanceStalledPhaseAfterDeparture,
    isParticipatingInSession,
    getActiveSessionForDeparture,
    TRIBUNAL_CANCELLED_OUTCOME,
    TRIBUNAL_CANCEL_REASONS,
    getDisconnectGraceTarget,
    isForfeitedFromSession,
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
    // 전적 저장 레코드 조립은 소켓 계층이 종결 시점에 그대로 소비하는 공개 계약이라
    // __testables가 아니라 정식 export다(사망 원인 열거값도 함께 노출해 호출부와 테스트가
    // 문자열을 다시 적지 않게 한다).
    buildGameResultRecord,
    DEATH_REASONS,
    getSessionSnapshotForPlayer,
    buildSessionSnapshot,
    getActiveSessionRoutingInfo,
    // F-24(AC-02): 방 코드 → 세션 상태 조회. 소켓 계층(matchmaking)의 입장 판정과 코드 재발급
    // 예약이 직접 부르는 진입점이라 __testables가 아니라 정식 export다.
    getRoomCodeSessionState,
    getActiveGamePresenceSnapshot,
    __resetStateForTests,
    __getStateSnapshotForTests,
    /**
     * F-25b: **테스트 전용** 준비 등록. 실제 제출 경로로는 만들 수 없는 밤(광대가 동료를
     * 지목해야 성립하는 CITIZEN 승리 분기 등)을 손으로 조립한 resolution으로 재현하면서도
     * commitNightResolution의 출처 검증을 우회하지 않게 한다.
     *
     * 소켓·HTTP 어느 경로에도 노출되지 않는다 — production 코드는 이 함수를 참조하지 않으며,
     * 등록되는 값도 실제 준비와 동일하게 **등록 시점의** 세션 상태로 고정된다(그래서 오염된
     * fixture는 여전히 victim 검증에서 걸린다).
     */
    /**
     * F-25b: **테스트 전용** 커밋 관찰자 등록(null이면 해제). 실제 사망 확정·승패 평가·종료
     * 확정 지점에서 { event, detail }을 받는다 — 횟수 단언(AC-01의 0회, AC-03의 1회)의 근거다.
     */
    __setNightCommitObserverForTests(observer = null) {
        nightCommitObserver = typeof observer === 'function' ? observer : null
        nightCommitObserverBusy = false
    },
    __registerNightPreparationForTests(session, resolution, options = {}) {
        const progress = getNightProgress(session)
        return registerNightPreparation(session, resolution, {
            sequenced: options.sequenced ?? (progress?.sequenced === true),
            progressRevision: options.progressRevision ?? (progress?.revision ?? 0),
        })
    },
    // 테스트에서 개별 함수를 직접 호출하거나 registry를 의도적으로 파괴하기 위한 통로입니다.
    // 런타임 코드에서는 참조하지 않습니다.
    __testables: {
        evaluateWinCondition,
        finalizeGameSession,
        assertSessionNotEnded,
        assignRoles,
        enterDayPhase,
        enterDayVotePhase,
        getDayPhase,
        validateSessionInput,
        buildTimerSettings,
        buildSessionCandidate,
        buildRoomSettingsSource,
        resolveGameSource,
        checkGameSessionPreconditions,
        assertValidSessionForCommit,
        getSpecialRoleBudget,
        computeRoleComposition,
        isEligibleForNightAction,
        requiresAliveTarget,
        getDayVoteRound,
        getDayVoteExcludedUuids,
        sanitizeChatText,
        // 기존 테스트/호출부가 쓰던 이름을 그대로 남긴다(동일 함수 참조 — 채널 공용 규칙이다).
        sanitizeJokerChatText: sanitizeChatText,
        resolveGameChatChannel,
        getChatRateLimitMap,
        getEligibleNightActorUuids,
        NIGHT_ACTION_RESOLUTION_POLICY,
        // F-25b 밤 진행 자료의 내부 계산기·조회기. 테스트가 역할 단위 중간 상태를 직접 검사한다.
        NIGHT_RECOVERY_STATES,
        getNightProgress,
        computeNightRoleStep,
        closeNightHealing,
        collectRoleNightSubmissions,
        resolveRoleNightAction,
        buildAssassinationFailureNotice,
        expireDeadPlayerNightEffects,
        resolveNightDeathSource,
        buildNightDeathReveals,
        getEligibleDayVoterUuids,
        tallyDayVoteOutcome,
        buildDayVoteBallotSnapshot,
        dayVoteBallotSnapshotsEqual,
        __deleteGameSessionOnlyForTests,
    },
}
