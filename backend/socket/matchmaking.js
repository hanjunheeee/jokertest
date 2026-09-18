const crypto = require('crypto')
const userRepository = require('../repositories/user.repositories')
const economyService = require('../service/economy.service')
const { generateRoomCode, generateUniqueRoomCode } = require('../utils/roomCode')
const { validateCreateRoomPayload } = require('../utils/createRoomValidation')
// F-20(AC-01~AC-06): 대기방 설정 변경의 입력 검증·허용 필드·이벤트/오류 코드는 전부 이
// 모듈이 소유한다. 이 파일은 "권한·현재 상태·커밋"만 판단하고 값의 모양은 판단하지 않는다.
const {
    validateUpdateRoomSettingsPayload,
    buildEditableSettingsView,
    buildRoomSettingsView,
    settingsContainNonAllowlistedKeys,
    fingerprintUpdateSettings,
    fingerprintUpdateRequest,
    isRoomSettingsIdentifier,
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
    PRESERVED_ROOM_SETTING_KEYS,
} = require('../utils/updateRoomSettingsValidation')
const { ROOM_JOIN_ERROR_CODES } = require('./roomJoinErrors')
const gameSession = require('../game-core/gameSession')
const {
    validateCreateRoomRoleComposition,
    resolveRoleComposition,
} = require('../game-core/roleComposition')
// F-19(AC-06): 초대의 SQL 결정(수락 선형화·영수증)은 이 서비스가 소유하고, 방 registry와
// 실제 입장은 이 파일이 소유한다. require 방향은 matchmaking → service 한쪽뿐이라
// 순환이 생기지 않는다(서비스는 아래 __setRoomAccessForRuntime으로 registry를 주입받는다).
const gameInviteModule = require('../service/gameInvite.service')
// F-21: 프로세스 기동 식별(BOOT_EPOCH)·추방 입력 검증·영수증의 단일 소유자다. 대기방과
// 진행 중 추방이 같은 표를 공유해야 원 요청자의 재조회가 명령 종류와 무관하게 하나의 답을
// 갖는다(공통 영수증 계약). 이 모듈은 방 registry를 알지 못하므로 순환이 생기지 않는다.
const kickReceiptStore = require('./kickReceiptStore')
// F-21(AC-05/AC-06): 채널 이탈·되돌리기·전달 제외의 단일 소유자(socket/gameSession.js와 공유).
const channelMembership = require('./channelMembership')

/**
 * F-21(AC-05/AC-06): uuid → 현재 canonical socket.id(socket.js의 onlineUsers). 복제하지 않고
 * 참조만 들고 있으며 이 파일은 절대 쓰지 않는다 — 쓰기는 socket.js의 책임이다.
 *
 * 주입 전에는 null이고, 그때는 canonical 판정이 "같은 계정의 다른 소켓이 이미 그 방을
 * 소유했는가"로 퇴화한다(fail-safe: 옛 소켓을 되살리지 않는 쪽).
 */
let onlineUsersRegistry = null

/** 런타임 진입점(socket.js의 모듈 초기화)에서 onlineUsers registry를 주입한다. */
function setOnlineUsersRegistry(registry) {
    onlineUsersRegistry = registry
}

// userRepositoryRef·economyServiceRef와 **같은 이유**의 최소 의존성 주입이다: 초대 서비스는
// 호출 시 실제 MySQL 트랜잭션을 열므로, DB 없이 입장 상태 기계(예약·publication·영수증·
// timeout·무효화)를 결정적으로 재현하려면 이 참조를 교체할 수 있어야 한다.
// 런타임에는 항상 실제 모듈을 쓴다.
let gameInviteService = gameInviteModule

/** 테스트 전용: gameInvite 서비스 구현을 교체합니다. 인자 없이 호출하면 실제 모듈로 되돌립니다. */
function __setGameInviteServiceForTests(fakeService) {
    gameInviteService = fakeService ?? gameInviteModule
}

// 테스트에서 실제 DB 모듈 대신 교체할 수 있도록 참조를 변수로 감싼다.
// node:test의 mock.module()을 시도했으나 이 프로젝트에서는 user.repositories가
// require 시점에 backend/models(Sequelize 초기화, DATABASE_URL 필요)를 함께 불러와
// 목업 환경에서도 실제 DB 접속을 시도하며 깨졌다(--experimental-test-module-mocks로 직접
// 확인). 그래서 최소한의 의존성 주입으로 대체했다 — 런타임에는 항상 실제 모듈을 쓴다.
let userRepositoryRef = userRepository

/** 테스트 전용: userRepository 구현을 교체합니다. 인자 없이 호출하면 실제 모듈로 되돌립니다. */
function __setUserRepositoryForTests(fakeRepository) {
    userRepositoryRef = fakeRepository ?? userRepository
}

// F-13(AC-05): economy.service.js 자체는 require 시점에 backend/models를 즉시 불러오지
// 않지만(defaultDb()가 호출 시점에 지연 require한다), 실제로 호출하면 그 순간 실제 DB
// 연결을 요구한다 — userRepositoryRef와 같은 이유로 테스트가 교체할 수 있어야 한다.
let economyServiceRef = economyService

/** 테스트 전용: economyService 구현을 교체합니다. 인자 없이 호출하면 실제 모듈로 되돌립니다. */
function __setEconomyServiceForTests(fakeEconomyService) {
    economyServiceRef = fakeEconomyService ?? economyService
}
// NOTE: 게임 시작(handleStartGame)은 방장 권한·인원·준비 상태 가드를 통과하면
// game-core/gameSession(prepareGameSession → commitGameSession)으로 GameSession을 만들고,
// 참가자 각자에게 자신의 역할만 담은 개별 game_started를 전달한다. 인게임 중 실시간
// 턴/페이즈 동기화(useInGameSocket 및 대응 소켓 핸들러)는 아직 없다 — 다음 슬라이스의 몫이다.

const OFFICIAL_MIN_PLAYERS = 5
const OFFICIAL_ROOM_SIZES = [10, 8, 6, 5]
const DEVELOPMENT_ROOM_SIZES = [10, 8, 6, 5, 2, 1]

// 초기 서비스의 낮은 동시접속자 수를 고려해 랜덤 매칭을 의도적으로 비활성화한다.
// 큐 등록/매칭 성사 로직 자체는 지우지 않고 아래에 그대로 남겨둔다 — 이 상수만 true로
// 되돌리면 재활성화할 수 있다. 재활성화 시 큐 정책(수동 방 생성과의 관계 등)은 별도 검토 필요.
const RANDOM_MATCHMAKING_ENABLED = false

// 테스트 전용 오버라이드. 이 상수 자체가 false라 큐 등록/매칭 성사 로직은 정상 경로로는
// 실행되지 않으므로, 그 경로의 generation 재검사(GameSession 종료 경쟁 조건)를 검증하려면
// 테스트에서만 일시적으로 켤 수 있어야 한다.
let randomMatchmakingEnabledOverride = null

function isRandomMatchmakingEnabled() {
    return randomMatchmakingEnabledOverride ?? RANDOM_MATCHMAKING_ENABLED
}

/** 테스트 전용: RANDOM_MATCHMAKING_ENABLED를 일시적으로 override한다. null/undefined면 원래 상수로 되돌린다. */
function __setRandomMatchmakingEnabledForTests(value) {
    randomMatchmakingEnabledOverride = value ?? null
}

function isDevelopmentMatchmaking() {
    return process.env.NODE_ENV !== 'production'
}

function getMinPlayers() {
    if (!isDevelopmentMatchmaking()) return OFFICIAL_MIN_PLAYERS
    const configured = Number(process.env.GAME_DEV_MIN_PLAYERS ?? 1)
    return Number.isInteger(configured) && configured > 0 ? configured : 1
}

function getSupportedRoomSizes() {
    return isDevelopmentMatchmaking() ? DEVELOPMENT_ROOM_SIZES : OFFICIAL_ROOM_SIZES
}

/** uuid → { uuid, nickname, socketId } */
const matchmakingQueue = new Map()

/** roomId → { id, code, hostUuid, title, accessType, players: Map<uuid,{uuid,nickname}>, settings } */
const gameRooms = new Map()

/** uuid → roomId — 역방향 조회용 */
const playerRoom = new Map()

// create_room과 join_room_by_code가 함께 쓰는 "방 전환 처리 중" 잠금이다. 생성 전용으로
// 좁게 두지 않고 두 작업이 공유해야, 같은 사용자가 두 요청을 동시에 보내도(예: 다른 탭에서
// 만들기와 코드 참가를 동시에 시도) 한쪽만 통과시킬 수 있다.
//
// F-19(AC-06): Set에서 uuid→소유 token Map으로 바꿨다. 예전에는 오래 걸린 요청의 finally가
// `delete(uuid)`만 해서, 그 사이에 시작된 **새** 요청의 잠금까지 풀어 버릴 수 있었다.
// 이제 해제는 자기 token이 아직 걸려 있을 때만 일어난다.
const pendingRoomTransitions = new Map()

let roomTransitionTokenSeq = 0

/** 잠금을 잡는다. 이미 다른 요청이 잡고 있으면 null. 반드시 첫 await 이전 동기 구간에서 부른다. */
function acquireRoomTransition(uuid) {
    if (pendingRoomTransitions.has(uuid)) return null
    roomTransitionTokenSeq += 1
    const token = `rt-${roomTransitionTokenSeq}`
    pendingRoomTransitions.set(uuid, token)
    return token
}

/** 자기 token일 때만 해제한다 — 늦게 끝난 옛 요청이 새 요청의 잠금을 풀지 못하게 한다. */
function releaseRoomTransition(uuid, token) {
    if (pendingRoomTransitions.get(uuid) === token) pendingRoomTransitions.delete(uuid)
}

// ── F-19 AC-06: 초대 입장 예약(private admission reservation) ────────────────
//
// 이 프로세스 기동을 식별한다. 재시작하면 값이 달라지므로, 옛 boot에서 만들어진 초대의
// 입장 재실행이 허용되지 않는다(A-11). 서버는 방을 영속 복원하지 않으므로 "같은 문자열
// 방 코드"를 과거 방 인스턴스로 인정할 근거도 없다.
//
// F-21(A-08): 값의 소유를 kickReceiptStore로 옮겼다. 초대 경로와 추방 경로가 각자
// randomUUID()를 만들면 같은 서버 기동인데도 두 값이 달라, 한 화면에서 두 계약을 함께 쓰는
// 클라이언트가 어느 쪽을 boot 식별자로 믿어야 할지 알 수 없다. 여기서는 이름만 유지한다.
const BOOT_EPOCH = kickReceiptStore.BOOT_EPOCH

/**
 * uuid → {
 *   attemptId, roomId, room(참조), roomInstanceId, bootEpoch, generation,
 *   socketId, inviteId, phase: 'reserved' | 'published', expiresAt
 * }
 *
 * 한 계정은 동시에 하나의 시도만 가진다. 두 국면을 **같은 Map**으로 다루는 이유는 둘 다
 * "아직 확정되지 않은 입장"이라는 하나의 사실이기 때문이다:
 *
 *   phase='reserved'  — SQL 수락 결정 중. room.players/playerRoom/실제 방송 room 어디에도
 *                       없지만 **정원은 한 자리 차지한다**(마지막 자리 경합 방지).
 *   phase='published' — 두 Map에는 들어갔지만 durable 영수증이 아직 없다. get_current_room은
 *                       pending으로 답하고 ready·start는 거부한다.
 *
 * 어느 국면이든 buildRoomPayload·buildPublicRoomList의 참가자 목록에는 나타나지 않는다
 * (phase='published'는 room.players에 실제로 있으므로 나타난다 — 그건 확정 전이지만 실제
 * 소속이므로 숨기면 다른 참가자가 정원을 잘못 본다).
 */
const roomAdmissionAttempts = new Map()

/**
 * 애플리케이션 응답 대기 상한. 원격 SQL 잠금 해제 시간을 보장하지는 않는다.
 *
 * 시험이 실제 5초/15초를 기다리지 않고 timeout 경로를 돌 수 있도록 값만 바꿀 수 있게
 * 열어 둔다(__setAdmissionTimeoutsForTests). 판정 로직은 프로덕션 경로 그대로다.
 */
const ADMISSION_DEFAULT_STEP_TIMEOUT_MS = 5 * 1000
const ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS = 15 * 1000
let ADMISSION_STEP_TIMEOUT_MS = ADMISSION_DEFAULT_STEP_TIMEOUT_MS
let ADMISSION_TOTAL_TIMEOUT_MS = ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS

/** 테스트 전용: 인자 없이 부르면 실제 기본값으로 되돌린다. */
function __setAdmissionTimeoutsForTests({ step, total } = {}) {
    ADMISSION_STEP_TIMEOUT_MS = Number.isFinite(step) ? step : ADMISSION_DEFAULT_STEP_TIMEOUT_MS
    ADMISSION_TOTAL_TIMEOUT_MS = Number.isFinite(total) ? total : ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS
}

let admissionAttemptSeq = 0

function nextAttemptId() {
    admissionAttemptSeq += 1
    return `adm-${BOOT_EPOCH.slice(0, 8)}-${admissionAttemptSeq}`
}

/**
 * uuid → 아직 durable 영수증이 없는 **publication의 현재 소유자**(attempt).
 *
 * roomAdmissionAttempts와 따로 두는 이유는 "토큰의 수명"과 "두 Map에 실제로 넣은 항목의
 * 소유권"이 서로 다른 사실이기 때문이다. 이 값이 있어야 늦게 깨어난 옛 시도가 자기가 넣은
 * 것만 되돌리고, 그 사이에 정상 경로로 성립한 **더 새로운 소속**은 건드리지 않는다.
 */
const publishedAdmissions = new Map()

/** 이 시도가 publication 소유자에서 물러난다(확정 성공·되돌림 양쪽에서 부른다). */
function releasePublishedAdmission(attempt) {
    if (attempt && publishedAdmissions.get(attempt.accountUuid) === attempt) {
        publishedAdmissions.delete(attempt.accountUuid)
    }
}

/**
 * 이 계정의 현재 시도(있으면). 만료된 시도는 여기서 정리하고 없는 것으로 본다.
 *
 * **단, phase='published'는 기한이 지나도 버리지 않는다(review5 #1).** 그 시도는 두 Map에
 * 실제로 들어간 미확정 소속이라, 토큰만 버리면 두 가지가 동시에 깨진다:
 *
 *   · get_current_room이 영수증 없는 입장을 **정상 소속**으로 답한다(pending 우회).
 *   · 그 소속을 되돌릴 소유자가 사라져, 뒤이은 RECEIPT_TIMEOUT 정리가 자기 시도를 알아보지
 *     못하고 아무것도 회수하지 못한다 — 유령 참가자가 영구히 남는다.
 *
 * 기한은 애플리케이션 대기의 상한일 뿐 원격 SQL의 종료를 보장하지 않는다. 미확정 소속의
 * 수명은 그 시도를 소유한 흐름(withAdmissionTimeout)이 끝맺는다.
 */
function getAdmissionAttempt(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (!attempt) return null
    if (attempt.phase !== 'published' && attempt.expiresAt <= Date.now()) {
        roomAdmissionAttempts.delete(uuid)
        return null
    }
    return attempt
}

/**
 * 이 계정의 시도를 즉시 무효화한다(소유권 동기 회수).
 *
 * disconnect·canonical 교체·세션 종료 정리·방 삭제·명시적 이탈이 전부 이 함수를 지난다.
 * SQL 보상이나 room mutex를 기다리지 않는다 — 늦게 끝난 SQL은 역사적 결과 조회로만 다룬다.
 *
 * @returns {object|null} 무효화된 시도(있으면). 호출자가 필요하면 보상에 쓴다.
 */
function invalidateAdmissionAttempt(uuid, reason) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (!attempt) return null
    roomAdmissionAttempts.delete(uuid)
    attempt.invalidated = reason ?? 'INVALIDATED'
    return attempt
}

/**
 * 무효화된 시도의 durable 상태를 뒤늦게 INTERRUPTED로 맞춘다(지연 보상).
 *
 * fire-and-forget이다 — 실패해도 메모리 정리를 되돌리지 않는다. 입장 검사는 언제나 현재 방
 * 상태로 다시 하므로, 이 보상이 실패해도 사라진 방으로 들어갈 수는 없다(상태표 12).
 */
function compensateInvalidatedAttempt(attempt, reason) {
    if (!attempt || typeof attempt.inviteId !== 'string') return

    // ── 늦게 커밋된 결정과의 화해 (review5 #2) ───────────────────────────────
    //
    // recordEntryInterrupted는 id + attempt_id + entry_outcome='UNCONFIRMED' 한 문장이다.
    // 이 조건부 UPDATE가 경합 보호의 핵심이므로 그대로 둔다 — 대신 **부르는 시점**을 고친다.
    //
    // 결정(recordAcceptDecision)이 아직 잠금을 얻지 못했거나 커밋 전이면 그 행에는 attempt_id가
    // 없다. 그 상태에서 보상을 부르면 0행이라 아무것도 적히지 않고, 뒤늦게 결정이 커밋되면
    // ACCEPTED/UNCONFIRMED가 영구히 남는다 — 아무도 입장하지 않은 시도가 "입장 결과 미확정"
    // 으로 굳는다.
    //
    // 그래서 결정이 아직 정착하지 않았으면 **정착을 기다렸다가** 기록한다. 여전히 조건부
    // UPDATE이므로 그 사이에 새 시도가 attempt_id를 가져갔거나 PUBLISHED가 확정됐으면 0행이
    // 되어 역사를 덮지 않는다. 결정이 실패로 끝났으면 설치된 attempt_id가 없어 역시 0행이다.
    const settled = attempt.decisionSettled === true || !attempt.decisionPromise
    const waitForDecision = settled
        ? Promise.resolve()
        : Promise.resolve(attempt.decisionPromise).then(() => null, () => null)

    waitForDecision
        .then(() => gameInviteService.recordEntryInterrupted({
            inviteId: attempt.inviteId, attemptId: attempt.attemptId, reason,
        }))
        .catch((err) => console.error('[초대 입장 보상 실패]', err))
}

/**
 * 확정되지 않은 publication을 **동기적으로** 되돌린다(상태표 4·6).
 *
 * 자기 attempt가 넣은 항목만 지운다 — room 객체 참조와 인스턴스가 모두 같을 때만 건드리므로,
 * 그 사이에 사용자가 정상 경로로 다른 방(또는 같은 코드의 새 방)에 들어갔다면 그 새 소속을
 * 지우지 않는다. DB 결과를 기다리지 않는다.
 */
function removePublishedAdmission(io, socket, attempt) {
    if (!attempt || attempt.phase !== 'published') return
    const room = gameRooms.get(attempt.roomId)

    // ── 소유권 (review5 #1) ──────────────────────────────────────────────────
    //
    // 방 참조·인스턴스·계정→방 매핑이 전부 같아도, 그 소속을 만든 것이 **이 시도**라는
    // 증거는 되지 못한다. 같은 계정이 같은 방에 다시 들어오면 세 값이 모두 일치하기 때문이다.
    // 그래서 늦게 깨어난 옛 시도가 정상 경로로 성립한 새 소속을 지우고 있지도 않은 이탈을
    // 방송했다. publication 소유자 등록부로 "지금 이 미확정 소속의 주인이 나인가"를 묻는다.
    //
    // F-21(AC-05/AC-06): 소속 식별자까지 함께 대조한다. 소유자 등록부만으로도 대부분은
    // 걸러지지만, 이 시도가 넣은 참가자 항목이 그 사이 제거되고(추방·이탈) 같은 계정이 같은
    // 방에 다시 들어온 경우 등록부 항목이 미처 정리되지 못한 채 남아 있을 수 있다 — 그때
    // 현재 참가자 항목의 membershipId는 이 시도가 발급한 값이 아니다.
    const ownsPublication = publishedAdmissions.get(attempt.accountUuid) === attempt
    const seatedMembershipId = room?.players.get(attempt.accountUuid)?.membershipId
    const stillMine = ownsPublication
        && room === attempt.room
        && room?.instanceId === attempt.roomInstanceId
        && playerRoom.get(attempt.accountUuid) === attempt.roomId
        && (attempt.publicationMembershipId === undefined
            || seatedMembershipId === attempt.publicationMembershipId)
    if (stillMine) {
        releasePublishedAdmission(attempt)
        room.players.delete(attempt.accountUuid)
        playerRoom.delete(attempt.accountUuid)
    }

    // 채널도 같은 기준으로 뗀다. 내가 되돌린 경우이거나, 그 계정이 애초에 이 방의 확정
    // 참가자가 아닐 때만 뗀다 — 더 새로운 정상 소속의 채널을 끊으면 그 참가자가 방송을
    // 받지 못한다.
    const accountStillSeated = isAccountSeatedInRoom(attempt.accountUuid, attempt.roomId)
    if (socket && typeof socket.leave === 'function' && socket.id === attempt.socketId
        && (stillMine || !accountStillSeated)) {
        // F-21(AC-05/AC-06): 예전에는 raw socket.leave를 부르고 **동기 예외만** 잡았다.
        // adapter가 Promise를 돌려주면 그 거부는 잡히지 않고(채널이 그대로 남는다), 완료가
        // 늦어지는 사이 같은 계정·같은 소켓이 그 방에 정상 입장하면 뒤늦은 완료가 방금 성립한
        // 소속의 채널을 대신 떼어 간다. 공통 경계가 완료 후 소유권을 다시 묻게 한다.
        detachSocketFromChannel(socket, attempt.roomId, '[초대 입장 채널 정리 실패]', {
            ownsChannel: () =>
                isAccountSeatedInRoom(attempt.accountUuid, attempt.roomId)
                && isCanonicalSocketForAccount(io, attempt.accountUuid, socket, attempt.roomId),
            keepsConnection: () =>
                hasRoomMembership(attempt.accountUuid) || hasLiveGameMembership(attempt.accountUuid),
        })
    }
    if (!stillMine || !room) return
    if (room.players.size === 0) {
        gameRooms.delete(attempt.roomId)
        // F-20(AC-05/A-07): 이 경로도 **실제 방 소멸**이다. 다른 소멸 경로(삭제·시작·이탈·
        // 세션 정리)와 똑같이 그 방의 설정 변경 결과 기록도 함께 끝낸다 — 방이 사라졌는데
        // 기록만 남으면, 같은 방 식별자로 다시 만들어진 방에서 옛 결과를 조회할 수 있다.
        forgetSettingsUpdateResultsForRoom(attempt.roomId)
        emitPublicRoomList(io)
        return
    }
    if (!room.players.has(room.hostUuid)) {
        room.hostUuid = room.players.keys().next().value
        try {
            channelMembership.emitToChannel(io, attempt.roomId, 'host_changed', {
                hostUuid: room.hostUuid,
                canStart: computeCanStart(room),
                roomInstanceId: room.instanceId ?? null,
                bootEpoch: BOOT_EPOCH,
                // F-20(AC-05): 새 방장이 "지금 서버가 확정한 설정"을 편집 시작점으로 삼을 수
                // 있도록 현재 버전을 함께 알린다. 값 자체는 싣지 않는다 — 방장이 된 클라이언트는
                // get_current_room으로 최신 설정을 다시 확보한 뒤에만 편집할 수 있다.
                roomId: attempt.roomId,
                settingsVersion: getSettingsVersion(room),
            })
        } catch (err) { console.error('[초대 입장 보상 방송 실패]', err) }
    }
    try {
        channelMembership.emitToChannel(io, attempt.roomId, 'player_left_room', {
            uuid: attempt.accountUuid,
            membershipId: attempt.publicationMembershipId ?? null,
            roomId: attempt.roomId,
            roomInstanceId: room.instanceId ?? null,
            bootEpoch: BOOT_EPOCH,
            canStart: computeCanStart(room),
        })
    } catch (err) { console.error('[초대 입장 보상 방송 실패]', err) }
    emitPublicRoomList(io)
}

/**
 * JOIN_TIMEOUT 뒤에 **늦게 성공한** socket.join을 정리한다(상태표 4).
 *
 * 제한 시간은 애플리케이션 대기의 상한일 뿐이라 어댑터의 join이 그 뒤에 성공할 수 있다.
 * 그대로 두면 두 Map에는 없는데 실제 방송 room에는 남아 다른 참가자의 사건을 계속 받는
 * "유령 청취자"가 된다. 그렇다고 무조건 leave하면 그 사이에 정상 경로로 다시 들어온 **더
 * 새로운 소속**의 채널을 끊게 되므로, 늦은 완료 시점에 소유권을 다시 확인한다:
 *
 *   - socket.id가 달라졌으면(재접속·canonical 교체) 이 socket은 더 이상 그 계정의 채널이
 *     아니다. 자기 시도가 쓰던 바로 그 socket일 때만 건드린다.
 *   - 그 계정의 확정 소속이 이미 이 방이면(playerRoom이 이 방을 가리킨다) 정상 참가자다 —
 *     끊지 않는다.
 *   - 같은 계정의 **다른(더 새로운)** 시도가 같은 방으로 진행 중이면 그 시도의 채널을
 *     뺏지 않는다.
 *
 * ── 소속만 보면 안 된다(CODEX-2 보수) ───────────────────────────────────────
 * playerRoom은 **계정**에 묶인 값이라 "누구의 연결이 그 소속을 만들었는가"를 말해 주지
 * 않는다. 옛 소켓의 가입이 timeout된 뒤 교체 소켓이 같은 방에 정상 입장하면
 * playerRoom.get(uuid)가 그 방을 가리키게 되고, 그것만 보고 물러나면 **옛 소켓의 채널이
 * 그대로 남아** 유령 청취자가 된다. 그래서 같은 계정의 다른 살아 있는 소켓이 이미 그 방
 * 채널·소속을 소유하고 있으면 이 소켓은 무조건 obsolete로 보고 자기 채널만 정리한다.
 * 새 소켓의 방·소속·roster와 **같은 소켓에서 갱신된** 시도는 건드리지 않는다.
 */
function isRoomOwnedByAnotherSocket(io, roomId, uuid, socket) {
    const sockets = io?.sockets?.sockets
    if (!sockets || typeof sockets.values !== 'function') return false
    for (const other of sockets.values()) {
        if (!other || other === socket || other.id === socket.id) continue
        if (other.connected === false) continue
        if (other.data?.user?.uuid !== uuid) continue
        if (other.rooms?.has?.(roomId) || other.data?.activeRoomId === roomId) return true
    }
    return false
}

function scheduleLateJoinCleanup(io, socket, roomId, uuid, attempt, joinPromise) {
    if (!joinPromise || typeof joinPromise.then !== 'function') return
    joinPromise.then(() => {
        if (!socket || typeof socket.leave !== 'function') return
        if (socket.id !== attempt.socketId) return
        // F-23(AC-04): 예전에는 raw socket.leave를 부르고 동기 예외만 잡았다 — adapter가 Promise를
        // 돌려주면 그 거부는 잡히지 않아 채널이 그대로 남고, 남은 동안 이 소켓은 그 방의 방송을
        // 계속 받는다. 공통 경계가 완료·실패를 조정하고, 떼지 못하면 자기 토큰으로 전달에서 뺀다.
        const leaveNow = () => {
            detachSocketFromChannel(socket, roomId, '[늦은 초대 채널 정리 실패]', { uuid }, {
                ownsChannel: () =>
                    isAccountSeatedInRoom(uuid, roomId)
                    && isCanonicalSocketForAccount(io, uuid, socket, roomId),
                keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
            })
        }
        // 교체 소켓이 이미 그 방을 소유했다면 아래의 소속·시도 검사는 전부 **그 소켓의
        // 사실**이라 이 소켓을 남길 근거가 되지 못한다.
        if (isRoomOwnedByAnotherSocket(io, roomId, uuid, socket)) { leaveNow(); return }
        if (playerRoom.get(uuid) === roomId) return
        const current = roomAdmissionAttempts.get(uuid)
        if (current && current !== attempt && current.roomId === roomId && current.socketId === socket.id) return
        leaveNow()
    }, () => {})
}

/** 이 방과 묶인 모든 미확정 시도를 무효화한다(방 삭제·시작·소멸). */
function invalidateAdmissionAttemptsForRoom(roomId, reason) {
    for (const [uuid, attempt] of [...roomAdmissionAttempts]) {
        if (attempt.roomId !== roomId) continue
        roomAdmissionAttempts.delete(uuid)
        compensateInvalidatedAttempt(attempt, reason)
    }
}

/** 이 방에 미확정 시도가 하나라도 있는가(ready·start·인원 판정에 쓴다). */
function hasPendingAdmissionForRoom(roomId) {
    for (const [uuid] of roomAdmissionAttempts) {
        const attempt = getAdmissionAttempt(uuid)
        if (attempt && attempt.roomId === roomId) return true
    }
    return false
}

/**
 * 이 방이 지금 실제로 차지하고 있는 자리 수.
 *
 * 확정 참가자(room.players) + phase='reserved' 예약이다. phase='published'는 이미
 * room.players에 있으므로 두 번 세지 않는다. excludeUuid는 "자기 자신을 제외한" 계산
 * (마지막 자리 판정)에 쓴다.
 */
function countRoomOccupancy(room, excludeUuid = null) {
    let count = 0
    for (const uuid of room.players.keys()) {
        if (uuid !== excludeUuid) count += 1
    }
    for (const [uuid] of roomAdmissionAttempts) {
        if (uuid === excludeUuid) continue
        const attempt = getAdmissionAttempt(uuid)
        if (!attempt || attempt.roomId !== room.id) continue
        if (attempt.phase === 'reserved') count += 1
    }
    return count
}

// ── F-20: 대기방 설정 버전과 설정 변경 요청 결과 기록 ──────────────────────────
//
// settingsVersion은 "이 방의 설정이 몇 번째 확정본인가"를 말하는 서버 소유 값이다. 생성 시
// 1을 부여하고 **실제 설정 교체**에서만 1씩 올린다. 클라이언트가 보내는 값이 아니므로
// 어떤 검증 경로에서도 payload에서 읽지 않는다.
const INITIAL_SETTINGS_VERSION = 1

/**
 * 이 방의 현재 설정 버전. settingsVersion이 없는 구버전/직접 심은 방은 1로 본다 — 없다고
 * 해서 편집을 막으면 기존 방이 영구히 수정 불가가 되고, 0/음수로 보면 클라이언트의 기대
 * 버전과 영원히 어긋난다.
 */
function getSettingsVersion(room) {
    const version = room?.settingsVersion
    return Number.isSafeInteger(version) && version > 0 ? version : INITIAL_SETTINGS_VERSION
}

/**
 * `${uuid}:${roomId}:${requestId}` → 그 요청의 확정 결과.
 *
 * ACK가 유실된 방장이 "내 저장이 반영됐는가"를 **새 저장을 만들지 않고** 확인할 수 있게
 * 하는 유일한 근거다. 메모리 대기방과 같은 수명의 제한된 기록이라(A-07) 크기·TTL 상한을
 * 두고 방이 사라질 때 함께 지운다. 기록이 없으면 UNKNOWN이며, 없다는 사실로 적용/미적용을
 * 확정하지 않는다.
 */
const roomSettingsUpdateResults = new Map()

// 한 계정이 requestId를 바꿔가며 무한히 기록을 쌓지 못하게 하는 상한이다. 대기방 하나의
// 편집 재시도 횟수를 넉넉히 덮으면 충분하다.
const SETTINGS_UPDATE_RESULT_TTL_MS = 10 * 60 * 1000
const SETTINGS_UPDATE_RESULT_MAX_ENTRIES = 500

// 세 값을 구분자 문자열로 이어 붙이면 식별자에 그 구분자가 섞였을 때 서로 다른 세 쌍이
// 같은 키가 될 수 있다('a:b'+'c'와 'a'+'b:c'). JSON 배열로 직렬화하면 각 조각의 경계가
// 따옴표로 보존되므로 그런 충돌이 생기지 않는다.
function settingsUpdateResultKey(uuid, roomId, requestId) {
    return JSON.stringify([uuid, roomId, requestId])
}

/** 기한이 지난 기록을 걷어낸다(조회·기록 양쪽에서 부른다). */
function pruneSettingsUpdateResults(now = Date.now()) {
    for (const [key, entry] of roomSettingsUpdateResults) {
        if (entry.expiresAt <= now) roomSettingsUpdateResults.delete(key)
    }
    enforceSettingsUpdateResultCapacity()
}

/**
 * 상한을 지킨다 — 삽입 순서(Map의 보장)대로 가장 오래된 것부터 버린다.
 *
 * **삽입 시점에도** 불러야 한다. 진입 시점에만 걷어내면 상한에 도달한 뒤 들어온 요청이
 * 언제나 size+1로 남아, 실제로는 상한을 한 칸씩 넘긴 채 유지된다.
 */
function enforceSettingsUpdateResultCapacity() {
    while (roomSettingsUpdateResults.size > SETTINGS_UPDATE_RESULT_MAX_ENTRIES) {
        const oldest = roomSettingsUpdateResults.keys().next().value
        if (oldest === undefined) break
        roomSettingsUpdateResults.delete(oldest)
    }
}

/** 결과 기록을 남기는 유일한 경계 — 기록 직후 반드시 상한을 다시 집행한다. */
function recordSettingsUpdateResult(key, entry) {
    roomSettingsUpdateResults.set(key, entry)
    enforceSettingsUpdateResultCapacity()
}

/** 방이 사라질 때(삭제·시작·전원 이탈) 그 방의 요청 결과 기록도 함께 버린다. */
function forgetSettingsUpdateResultsForRoom(roomId) {
    for (const [key, entry] of roomSettingsUpdateResults) {
        if (entry.roomId === roomId) roomSettingsUpdateResults.delete(key)
    }
}

// uuid → 방 전환 세대(generation) 카운터. create_room/코드·공개방 참가/join_matchmaking은
// 자신의 첫 await 이전(동기 구간)에 이 값을 캡처해 두고, 실제 Room/queue Map에 커밋하기
// 직전에 다시 비교한다. GameSession 종료 정리(cleanupRoomStateForSessionParticipants)는
// 종료 core 호출과 같은 동기 구간에서 참가자 전원의 세대를 증가시킨다 — 그 사이에 시작된
// 요청은 재개돼도 세대가 달라 커밋되지 않는다. 종료 이후에 새로 시작되는 요청은 이미
// 증가된 세대를 캡처하므로 영향을 받지 않는다.
const roomTransitionGeneration = new Map()

function getRoomTransitionGeneration(uuid) {
    return roomTransitionGeneration.get(uuid) ?? 0
}

/** 세션 종료 정리 전용: uuid의 세대를 1 증가시켜 그 uuid의 진행 중인 방 전환 요청을 무효화한다. */
function bumpRoomTransitionGeneration(uuid) {
    roomTransitionGeneration.set(uuid, getRoomTransitionGeneration(uuid) + 1)
}

// "code:<입장코드>" | "id:<roomId>" → 시작 시각(ms).
// 게임이 시작되면 handleStartGame이 그 Room을 gameRooms에서 지운다 — 그래서 시작된 방의
// 코드/roomId로 들어오는 뒤늦은 참가 요청은 "애초에 없던 방"과 구분할 근거가 남지 않는다.
// 그 구분(ROOM_ALREADY_STARTED vs ROOM_NOT_FOUND)만을 위해 지워진 방의 식별자만 짧게
// 기억해 둔다. 참가 판정 자체는 언제나 gameRooms의 살아있는 방이 우선이고, 이 표식은
// 살아있는 방을 하나도 못 찾았을 때만 읽는다 — 즉 어떤 입장도 이 표식으로는 허용되지 않는다.
const startedRoomMarks = new Map()

// 시작 직후 잘못 들어온 사용자에게 이유를 알려주기 위한 창이다. 한 판의 길이를 넉넉히
// 덮으면 충분하고, 그 뒤에는 일반적인 "코드 불일치"로 되돌아가도 사용자 경험이 나빠지지
// 않는다. TTL을 두는 이유는 이 Map이 무한히 커지지 않게 하기 위함이다.
const STARTED_ROOM_MARK_TTL_MS = 30 * 60 * 1000

function pruneStartedRoomMarks(now) {
    const threshold = now - STARTED_ROOM_MARK_TTL_MS
    for (const [mark, startedAt] of startedRoomMarks) {
        if (startedAt <= threshold) startedRoomMarks.delete(mark)
    }
}

/** 게임 시작으로 사라진 Room의 코드/roomId를 표식으로 남긴다(참가 허용 근거가 아니라 사유 판별용). */
function rememberStartedRoom(room) {
    const now = Date.now()
    // 삽입 시점마다 정리해 두면 별도 타이머 없이도 Map 크기가 유효 기간 안쪽으로 유지된다.
    pruneStartedRoomMarks(now)
    if (typeof room?.code === 'string' && room.code) startedRoomMarks.set(`code:${room.code}`, now)
    if (typeof room?.id === 'string' && room.id) startedRoomMarks.set(`id:${room.id}`, now)
}

/** 해당 식별자가 "방금 시작돼 사라진 방"의 것인지 확인한다. mark는 'code:...' 또는 'id:...' 형식이다. */
function isStartedRoomMark(mark) {
    const startedAt = startedRoomMarks.get(mark)
    if (startedAt === undefined) return false
    if (startedAt <= Date.now() - STARTED_ROOM_MARK_TTL_MS) {
        startedRoomMarks.delete(mark)
        return false
    }
    return true
}

/**
 * 참가 실패를 단일 계약으로 응답합니다. code는 클라이언트가 분기에 쓰는 안정적 식별자이고
 * message는 사람이 읽는 기본 안내다 — 두 필드를 한 곳에서 함께 붙여 code 누락을 막는다.
 */
function emitRoomJoinFailed(socket, code, message, details = {}) {
    socket.emit('room_join_failed', { code, message, ...details })
}

/**
 * ALREADY_IN_GAME 안내 문구의 유일한 원본. 네 진입점(create_room·join_room_by_code·
 * join_public_room·join_matchmaking)이 같은 상수를 참조해야 응답 형식이 문자열 복붙에
 * 기대지 않고 한 곳에서 유지된다.
 */
const ALREADY_IN_GAME_MESSAGE = '진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요.'

/**
 * 방 생성·참가 네 진입점이 공유하는 인게임 게이트. 활성 게임이 있으면 respond로
 * ALREADY_IN_GAME을 알리고 true를 돌려준다(호출자는 즉시 return해야 한다).
 *
 * respond는 경로별 응답 채널을 감싼 (code, message) 함수다 — create_room은 ack callback,
 * join 계열은 emitRoomJoinFailed. 채널은 각자의 기존 계약을 그대로 쓰되 code/message 쌍은
 * 여기 한 곳에서만 만들어진다.
 *
 * 네 곳 모두 예약(pendingRoomTransitions.add)·socket.join·await 이전의 동기 구간에서
 * 호출하므로, 차단됐을 때 되돌려야 할 상태가 아예 생기지 않는다.
 */
function rejectIfInActiveGame(uuid, respond) {
    const routing = gameSession.getActiveSessionRoutingInfo(uuid)
    if (!routing || gameSession.isForfeitedFromSession(routing.gameId, uuid)) return false
    respond({
        code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME,
        message: ALREADY_IN_GAME_MESSAGE,
        gameId: routing.gameId,
    })
    return true
}

/**
 * @param {(uuid:string)=>string|null} [getCurrentSocketId] - onlineUsers의 현재 socket.id
 *   접근자(backend/socket/socket.js가 주입한다). F-20(AC-01): 세션 재검증 await 사이에
 *   같은 계정의 새 로그인이 canonical 소켓을 교체했다면, 교체된 옛 소켓의 설정 저장·결과
 *   조회는 진입 시점에 거부돼야 한다. 주입이 없으면(테스트·구형 호출부) 이 이중 방어만
 *   비활성화되고 나머지 권한 검사는 그대로 적용된다.
 */
function registerMatchmakingHandlers(io, socket, uuid, { getCurrentSocketId } = {}) {
    socket.on('join_matchmaking', () =>
        handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    )
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    socket.on('join_room_by_code', (payload = {}) => {
        const { roomCode, roomId } = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
            ? payload
            : {}
        return handleJoinRoomByCode(
            io,
            socket,
            uuid,
            roomCode,
            typeof roomId === 'string' && roomId ? { roomId, accessType: 'code' } : null,
        ).catch((err) =>
            console.error('\x1b[31m[방 코드 참가 에러]\x1b[0m', err)
        )
    })
    socket.on('create_room', (payload, callback) => handleCreateRoom(io, socket, uuid, payload, callback))
    socket.on('get_current_room', (payload, callback) => handleGetCurrentRoom(uuid, callback))
    socket.on('get_public_rooms', (payload, callback) => handleGetPublicRooms(callback))
    // payload를 여기서 미리 구조분해하지 않는다. null/문자열/배열처럼 예상 밖 형태가 오면
    // `{ roomId } = payload` 구조분해 자체가 예외를 던져 .catch()로 넘어가 사용자에게
    // 아무 응답도 못 주고 조용히 실패하므로, 원본 payload를 그대로 넘겨 핸들러 안에서 검증한다.
    socket.on('join_public_room', (payload) =>
        handleJoinPublicRoom(io, socket, uuid, payload).catch((err) =>
            console.error('\x1b[31m[공개 방 참가 에러]\x1b[0m', err)
        )
    )
    socket.on('delete_room',       () => handleDeleteRoom(io, uuid))
    // start_game은 acknowledgement로 응답한다(예전에는 실패 시 game_start_failed 이벤트를
    // 따로 emit했으나, 요청-응답을 한 쌍으로 명확히 묶기 위해 ack 계약으로 통일했다).
    // F-20(AC-04): payload를 버리지 않는다 — 방·설정 버전이 이 요청의 필수 근거라서,
    // 등록부가 흘려버리면 실제 소켓 경로만 검사를 통과하지 못한 채 시작될 수 있다.
    // getCurrentSocketId도 함께 넘긴다 — 비동기 선행 작업 뒤에 깨어난 옛 소켓이 이 계정의
    // 현재 연결인지 다시 물을 수 있어야 한다(F-20 AC-04).
    socket.on('start_game', (payload, callback) =>
        handleStartGame(io, socket, uuid, payload, callback, getCurrentSocketId).catch((err) =>
            console.error('\x1b[31m[게임 시작 에러]\x1b[0m', err)
        )
    )
    socket.on('set_ready', (payload, callback) => handleSetReady(io, socket, uuid, payload, callback))
    // F-20: 대기방 설정 저장과 그 결과 재조회. 둘 다 ack 한 번으로만 응답하고, 신원은 위에서
    // 캡처한 uuid(서버가 인증한 값)만 쓴다 — payload의 어떤 필드도 신원이 되지 않는다.
    socket.on(ROOM_SETTINGS_EVENTS.UPDATE_ROOM_SETTINGS, (payload, callback) =>
        handleUpdateRoomSettings(io, socket, uuid, payload, callback, getCurrentSocketId))
    socket.on(ROOM_SETTINGS_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, (payload, callback) =>
        handleGetRoomSettingsUpdateResult(uuid, payload, callback, socket, getCurrentSocketId))
    socket.on('leave_room',        () => removeFromRoom(io, socket, uuid))
    // F-21(AC-01/AC-02): 대기방 추방의 **실제 등록 지점**이다. 인증 uuid와 이 소켓, 그리고
    // canonical 소켓 접근자를 그대로 넘긴다 — 세 값 중 어느 것도 payload에서 오지 않는다.
    // 결과 재조회(get_kick_result)는 대기방·게임 공용이라 gameSession 쪽에 한 번만 등록한다.
    socket.on(kickReceiptStore.KICK_EVENTS.KICK_ROOM_PLAYER, (payload, callback) =>
        handleKickRoomPlayer(io, socket, uuid, payload, callback, getCurrentSocketId))
    // F-19(AC-06): 실제 초대 수락은 인증·세션 guard를 통과한 이 소켓 경계에서만 일어난다
    // (REST로는 수락하지 않는다 — 입장은 이 프로세스의 방 registry와 이 소켓의 채널 가입을
    // 동시에 확정해야 하기 때문). 응답은 언제나 ack 한 번이다.
    socket.on('accept_game_invite', (payload, callback) =>
        handleAcceptGameInvite(io, socket, uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 수락 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'INTERNAL_ERROR', message: '초대를 처리하지 못했습니다.' }) } catch { /* ack 실패는 상태를 바꾸지 않는다 */ }
            }
        })
    )
    // 같은 시도의 결과를 다시 묻는다(ACK 유실 재조회). 새 수락을 만들지 않는다.
    socket.on('get_game_invite_result', (payload, callback) =>
        handleGetGameInviteResult(uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 결과 조회 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'UNKNOWN' }) } catch { /* 위와 같음 */ }
            }
        })
    )
}

// ── 재접속 유예(새로고침 대비) ───────────────────────────────────────────────
// 새로고침은 서버에게 "disconnect 후 새 connect"로만 보인다. 예전처럼 disconnect 즉시 방에서
// 빼면 재접속 직후의 get_current_room은 언제나 room:null을 돌려줘 대기방이 복구되지 않았다.
// 그래서 disconnect는 곧바로 제거하지 않고 짧은 유예를 예약하고, 그 안에 "나 아직 이 방에
// 있다"는 확인(get_current_room의 성공 응답)이 오면 예약을 취소한다.
const ROOM_RECONNECT_GRACE_MS = 15 * 1000

/** uuid → { roomId, timer, run } — 유예 중인 방 제거 예약 */
const pendingRoomRemovals = new Map()

// uuid → 마지막으로 "이 방에 있음"이 확인된 순번. 벽시계 대신 단조 증가 카운터를 쓴다 —
// 예약과 확인이 같은 밀리초에 일어나도 순서 판정이 뒤집히면 안 되기 때문이다.
let roomPresenceTick = 0
const roomPresenceConfirmedTick = new Map()

/** get_current_room이 실제 방을 확인해 준 순간을 기록한다(유예 만료 시 판정 기준). */
function markRoomPresenceConfirmed(uuid) {
    roomPresenceTick += 1
    roomPresenceConfirmedTick.set(uuid, roomPresenceTick)
}

/** 유예 중인 제거 예약을 취소한다. 예약이 없으면 아무 일도 하지 않는다. */
function cancelRoomRetention(uuid) {
    const pending = pendingRoomRemovals.get(uuid)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingRoomRemovals.delete(uuid)
}

/** 지금 이 uuid로 살아있는 소켓 하나를 찾는다(없으면 null). 유예 만료 시 채널 정리에 쓴다. */
function findLiveSocketForUuid(io, uuid) {
    for (const candidate of io?.sockets?.sockets?.values?.() ?? []) {
        if (candidate?.data?.user?.uuid !== uuid) continue
        if (candidate.connected === false) continue
        return candidate
    }
    return null
}

/**
 * disconnect 시점의 즉시 제거를 대신하는 예약이다. 유예가 끝날 때까지 재접속 확인이 없었을
 * 때에만 실제로 방에서 뺀다. 예약 이후에 확인이 왔는지를 순번(tick)으로 판정하므로,
 * "확인 → 뒤늦은 disconnect" 순서로 도착해도 방금 돌아온 사용자를 내쫓지 않는다.
 */
function scheduleRoomRetentionOnDisconnect(io, socket, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    cancelRoomRetention(uuid) // 같은 uuid의 예약은 언제나 가장 최근 것 하나만 남긴다
    const scheduledTick = roomPresenceTick

    const run = () => {
        pendingRoomRemovals.delete(uuid)
        // 예약 이후에 재접속 확인이 왔다면(순번이 더 크다면) 사용자는 이미 돌아온 것이다.
        if ((roomPresenceConfirmedTick.get(uuid) ?? -1) > scheduledTick) return
        // 유예 중에 다른 방으로 옮겼거나 이미 정리됐다면 지금 방은 건드리지 않는다.
        if (playerRoom.get(uuid) !== roomId) return
        // 재접속은 했지만 대기방으로 돌아오지 않은 경우(예: 로비로 이동) 그 새 소켓이
        // 채널에 남아 있을 수 있어, 살아있는 소켓을 찾아 leave까지 함께 처리한다.
        removeFromRoom(io, findLiveSocketForUuid(io, uuid), uuid)
    }

    const timer = setTimeout(run, ROOM_RECONNECT_GRACE_MS)
    // 이 타이머 하나 때문에 프로세스가 종료되지 않는 일이 없게 한다(정리는 어차피 유예 목적).
    if (typeof timer.unref === 'function') timer.unref()

    pendingRoomRemovals.set(uuid, { roomId, timer, run })
}

/**
 * 재접속(새로고침·다른 기기 로그인) 직후 새 소켓을 원래 대기방 채널에 다시 넣는다.
 * 채널 재가입이 없으면 복구된 클라이언트는 player_joined_room·host_changed·room_deleted·
 * game_started 방송을 하나도 받지 못하고, handleStartGame의 "참가자 전원이 Room channel에
 * 있어야 한다" 검사에도 걸려 방 전체가 게임을 시작할 수 없게 된다.
 *
 * 소속(playerRoom)은 여기서 만들지 않는다 — 이미 있는 소속의 라우팅만 되돌린다. 유예 예약도
 * 취소하지 않는다 — 재접속했지만 대기방 화면으로 돌아오지 않은 사용자는 유예가 끝나면
 * 정상적으로 방에서 빠져야 하고, "정말 대기방에 있다"는 확인은 get_current_room만 준다.
 */
async function resyncRoomChannelOnReconnect(socket, uuid) {
    if (!socket) return

    // F-19(AC-06): 새 소켓이 canonical이 되는 순간, 옛 소켓이 소유하던 미확정 입장 시도는
    // 무효다. 확정되지 않은 채널은 **복구하지 않는다** — 복구하면 영수증 없는 입장이
    // 정상 소속처럼 되살아난다(상태표 4). 이미 확정된 일반 소속만 아래에서 재가입한다.
    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt && attempt.socketId !== socket.id) {
        invalidateAdmissionAttempt(uuid, 'CANONICAL_SOCKET_REPLACED')
        removePublishedAdmission(socket.server ?? null, null, attempt)
        compensateInvalidatedAttempt(attempt, 'CANONICAL_SOCKET_REPLACED')
    }

    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || !room.players.has(uuid)) return

    /**
     * F-21(AC-06): **가입이 끝난 뒤에도 그 소속이 아직 자기 것인지 다시 묻는다.**
     *
     * socket.join은 Promise다. 예전에는 await만 하고 끝냈으므로, 가입이 완료되기 전에 이 계정이
     * 그 방에서 **추방**되면(또는 방이 사라지거나 같은 방이 새 인스턴스로 다시 만들어지면)
     * 마지막에 완료된 join이 권한 없는 소켓을 그 채널에 남겼다 — 그 뒤 아무도 치우지 않는다.
     * 추방된 계정이 그 방의 방송을 계속 받는 경로가 정확히 이것이다.
     *
     * 그래서 가입 **이전에** 지금의 소속을 구성하는 값들을 통째로 캡처한다: 방 객체 동일성,
     * 방 인스턴스, 서버 기동, 그 참가자 항목(재입장은 항상 새 membershipId를 받는다), 그리고
     * 이 소켓이 이 계정의 canonical 연결이라는 사실. 완료 시점에 하나라도 어긋나면 이 재가입은
     * 지난 소속의 것이므로 **내가 남긴 그 가입만** 되돌린다.
     */
    const seatAtCapture = room.players.get(uuid)
    const capturedMembershipId = seatAtCapture?.membershipId ?? null
    const capturedInstanceId = room.instanceId ?? room.id
    const capturedBootEpoch = kickReceiptStore.BOOT_EPOCH
    const io = socket.server ?? null

    /** 지금도 "캡처한 바로 그 소속"인가. 더 새로운 정상 소속은 이 판정을 통과하지 못한다. */
    const stillOwnsCapturedSeat = () => {
        if (playerRoom.get(uuid) !== roomId) return false
        const current = gameRooms.get(roomId)
        // 같은 id로 다시 만들어진 **다른** 방은 같은 소속이 아니다(객체·인스턴스 동일성).
        if (current !== room) return false
        if ((current.instanceId ?? current.id) !== capturedInstanceId) return false
        if (kickReceiptStore.BOOT_EPOCH !== capturedBootEpoch) return false
        const seat = current.players.get(uuid)
        if (!seat) return false
        // 나갔다 다시 들어온 새 소속은 다른 membershipId다 — 그 가입은 이 재가입이 만든 것이
        // 아니므로 여기서 떼면 방금 성립한 정상 참가자가 자기 채널을 잃는다.
        if (capturedMembershipId !== null && (seat.membershipId ?? null) !== capturedMembershipId) return false
        return isCanonicalSocketForAccount(io, uuid, socket, roomId)
    }

    // 이미 canonical이 아니면 채널을 되살릴 근거 자체가 없다(유령 청취자를 만들지 않는다).
    if (!stillOwnsCapturedSeat()) return

    // 이 소켓의 뒤늦은 disconnect도 아래 onDisconnect의 ABA 가드를 통과하도록 결합해 둔다.
    if (socket.data) socket.data.activeRoomId = roomId

    try {
        await socket.join(roomId)
    } catch (err) {
        console.error('\x1b[31m[방 채널 재가입 실패]\x1b[0m', err)
        return
    }

    if (stillOwnsCapturedSeat()) return

    // 가입이 끝나는 사이 그 소속이 사라졌다(추방·방 소멸·소켓 교체·새 소속으로 교체). 이
    // 재가입이 남긴 것만 되돌린다 — 공용 정리 경계를 쓰므로 더 새로운 정상 소속의 채널은
    // 떼지 않고, 다른 곳에 살아 있는 소속이 있으면 연결도 끊지 않는다.
    detachSocketFromChannel(
        socket, roomId, '[방 채널 재가입 보상 실패]',
        {
            ownsChannel: () =>
                isAccountSeatedInRoom(uuid, roomId)
                && isCanonicalSocketForAccount(io, uuid, socket, roomId),
            keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
        },
    )
}

/**
 * ABA 방지: 이 uuid가 매칭 큐/Room을 처리하던 Socket이 지금 disconnect한 그 Socket이 맞는지
 * 확인한다. 방/코드 참가·생성·큐 매칭 시 그 Socket에 결합해 둔 canonical roomId
 * (socket.data.activeRoomId)가 현재 playerRoom의 값과 다르면, 이 disconnect는 이미 지난
 * Room 소속에 대한 뒤늦은 신호이므로 지금의(다른 Socket이 만든) Room을 잘못 정리하지
 * 않도록 건드리지 않는다. 결합이 아예 없는 Socket(레거시 경로·테스트 등)은 기존처럼
 * 무조건 정리한다 — 이 가드는 실제로 결합이 있는데 값이 다를 때만 개입한다.
 *
 * 가드를 통과해도 곧바로 제거하지 않는다 — 새로고침과 진짜 이탈을 disconnect만으로는
 * 구분할 수 없으므로, 판단을 유예로 미룬다(scheduleRoomRetentionOnDisconnect).
 */
function onDisconnect(io, socket, uuid) {
    // F-21(AC-05/AC-06): 연결이 끝나면 그 소켓을 향한 채널 전달 제외는 더 이상 의미가 없다.
    // 제외 목록이 무한히 자라지 않게 하는 실제 생명주기 경계다(모든 소켓이 이 경로를 지난다).
    if (typeof socket?.id === 'string') channelMembership.releaseSocketFromAllChannels(socket.id)
    const queuedEntry = matchmakingQueue.get(uuid)
    if (queuedEntry && queuedEntry.socketId === socket?.id) {
        matchmakingQueue.delete(uuid)
    }

    // F-19(AC-06): 자기 소켓의 미확정 입장 시도는 playerRoom 유무와 **무관하게**, 그리고
    // 아래 조기 return보다 **먼저** 무효화한다. 확정되지 않은 입장에는 재접속 유예가 없다 —
    // 유예는 이미 확정된 소속에만 적용된다.
    const ownAttempt = roomAdmissionAttempts.get(uuid)
    if (ownAttempt && (socket?.id === undefined || ownAttempt.socketId === socket.id)) {
        const invalidated = invalidateAdmissionAttempt(uuid, 'DISCONNECTED')
        if (invalidated?.phase === 'published') removePublishedAdmission(io, socket, invalidated)
        compensateInvalidatedAttempt(invalidated, 'DISCONNECTED')
    }

    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) return

    const expectedRoomId = socket?.data?.activeRoomId
    if (expectedRoomId !== undefined && expectedRoomId !== currentRoomId) return

    scheduleRoomRetentionOnDisconnect(io, socket, uuid)
}

async function handleJoinMatchmaking(io, socket, uuid) {
    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    if (!isRandomMatchmakingEnabled()) {
        // 현재 UI에는 진입 경로가 없지만, 소켓 이벤트는 클라이언트가 직접 emit할 수도 있어
        // 서버에서 명시적으로 막고 그 사실을 알린다(조용히 무시하지 않음).
        socket.emit('matchmaking_disabled', { message: '현재 빠른 매칭은 지원하지 않습니다.' })
        return
    }

    // 이 경로는 지금까지 중복 소속을 조용히 무시했지만(아래 playerRoom 검사), 인게임 거부만은
    // 다른 세 경로와 같은 room_join_failed 계약으로 명시적으로 알린다 — 사유를 알 수 없는
    // 무반응은 "진행 중인 게임을 정리하라"는 조치로 이어질 수 없기 때문이다. 큐 등록 이전의
    // 동기 구간이라 되돌릴 상태도 남지 않는다.
    if (playerRoom.has(uuid)) return
    // F-19(AC-06): 이 경로에는 예약 잠금이 없었다 — 같은 계정의 큐 진입과 create_room/코드
    // 참가가 동시에 통과해 큐와 방 양쪽에 소속될 수 있었다. 다른 세 진입점과 같은 잠금을
    // 공유하고, 확정되지 않은 초대 입장 중에도 거부한다.
    if (getAdmissionAttempt(uuid)) return

    // 유일한 await(사용자 조회) 이전, 동기 구간에서 세대를 캡처한다. 대기 중 GameSession
    // 종료 정리가 이 uuid의 세대를 증가시켰으면(세션 종료), 조회가 끝나도 큐에 등록하지
    // 않고 기존 `!user` 실패 경로와 동일하게 조용히 반환한다.
    const generationAtRequest = getRoomTransitionGeneration(uuid)
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) return

    let user
    try {
        user = await userRepositoryRef.findByUuid(uuid)
    } finally {
        releaseRoomTransition(uuid, transitionToken)
    }
    if (!user) return
    if (getRoomTransitionGeneration(uuid) !== generationAtRequest) return
    // 조회를 기다리는 동안 다른 경로로 방에 들어갔거나 초대 입장이 시작됐을 수 있다.
    if (playerRoom.has(uuid) || getAdmissionAttempt(uuid)) return

    matchmakingQueue.set(uuid, { uuid, nickname: user.nickname, socketId: socket.id, generation: generationAtRequest })
    socket.emit('matchmaking_queued', { position: matchmakingQueue.size })

    if (matchmakingQueue.size < getMinPlayers()) return

    // 큐에서 Room으로 전환하기 직전에도 각 항목의 등록 당시 세대와 현재 세대를 다시 비교한다.
    // 정상적으로는 세션 종료 정리가 참가자를 큐에서도 함께 제거하므로 무관한 항목은 이미
    // 여기 없겠지만, 그 보장이 깨지는 경우에도 무효화된 항목이 새 Room에 섞여 들어가지
    // 않도록 하는 방어선이다.
    const queuedPlayers = [...matchmakingQueue.values()].filter(
        (entry) => getRoomTransitionGeneration(entry.uuid) === entry.generation
    )
    const roomSize = getSupportedRoomSizes().find((size) => queuedPlayers.length >= size)
    if (!roomSize) return

    const players = queuedPlayers.slice(0, roomSize)
    players.forEach((player) => matchmakingQueue.delete(player.uuid))

    const roomId     = crypto.randomUUID()
    const roomCode   = generateRoomCode()
    const hostUuid   = players[0].uuid
    // F-21(AC-06): 네 입장 생산자 중 하나다. 큐에서 방으로 확정되는 참가자마다 **여기서**
    // 새 membershipId를 발급한다 — 발급 지점이 실제 Map 커밋과 같은 동기 구간이어야, 늦게
    // 깨어난 옛 요청이 "같은 계정"이라는 이유로 새 소속을 자기 것으로 오인할 수 없다.
    // F-21(AC-06): 새 소속의 준비는 **항상 false**다. 다른 세 생산자(생성·코드 참가·초대
    // 수락)는 이미 그렇게 커밋하는데 이 경로만 키를 아예 두지 않아, 같은 계정이 추방된 뒤
    // 큐로 돌아오면 computeCanStart의 `isReady === true` 검사만 통과하지 못할 뿐 화면에는
    // "준비 여부를 알 수 없는 참가자"로 남았다. 재입장은 언제나 준비하지 않은 상태다.
    const playersMap = new Map(players.map((p) => [p.uuid, {
        uuid: p.uuid,
        nickname: p.nickname,
        isReady: false,
        membershipId: kickReceiptStore.nextMembershipId(),
    }]))

    const room = { id: roomId, instanceId: crypto.randomUUID(), code: roomCode, hostUuid, players: playersMap }
    gameRooms.set(roomId, room)
    players.forEach((p) => playerRoom.set(p.uuid, roomId))

    // match_found는 **공통 방 payload 그대로**다. 이 화면이 곧 대기방 화면이라, 여기서만
    // 직렬화를 손으로 다시 적으면 membershipId·canStart·설정 같은 값이 한쪽에서만 빠진다
    // (방장이 추방 대상을 지목할 근거를 잃는 것이 그 결과다).
    const payload = buildRoomPayload(room)

    players.forEach(({ socketId }) => {
        const s = io.sockets.sockets.get(socketId)
        if (!s) return
        s.join(roomId)
        // ABA 방지 결합: create_room/join_room_by_code와 동일한 이유(onDisconnect 참고).
        s.data.activeRoomId = roomId
        // 수신자마다 새 복사본을 준다 — 한 참가자가 payload를 변형해도 다른 참가자의 응답이
        // 함께 바뀌지 않는다(buildRoomPayload의 참가자 복사와 같은 이유).
        s.emit('match_found', { ...payload, players: payload.players.map((p) => ({ ...p })) })
    })
}

/**
 * 방이 지금 게임을 시작할 수 있는 상태인지 계산합니다. 결과를 어디에도 저장하지 않고
 * 참가/퇴장/방장변경/준비상태변경 등 인원 구성이 바뀌는 모든 지점에서 매번 다시 호출합니다
 * — 캐시해두면 계산 시점과 알림 시점 사이에 상태가 바뀌었을 때 오래된 값을 내려줄 수 있습니다.
 */
function computeCanStart(room) {
    const players = [...room.players.values()]
    const configuredMinimum = getMinPlayers()
    // 방 정원이 운영 최소 인원보다 작으면 정원을 기준으로 삼는다 — 그렇지 않으면 정원이
    // 운영 최소 인원 미만인 방은 영원히 시작할 수 없는 모순이 생긴다.
    const roomCapacity = room.settings?.maxPlayers ?? configuredMinimum
    const requiredPlayers = Math.min(configuredMinimum, roomCapacity)
    const jokerCount = room.settings?.jokerCount ?? 0

    if (players.length < requiredPlayers) return false
    // 방 생성 시점에는 광대 수가 설정 상한 이하인지만 검증한다. 실제로 그만큼 인원이
    // 모이지 않으면 전원이 광대인 상황이 될 수 있어, 시작 시점에 실제 인원 기준으로
    // 비-광대가 최소 1명은 있는지 다시 검증한다.
    if (players.length <= jokerCount) return false
    // CUSTOM 역할 구성은 정원(maxPlayers) 기준으로 저장돼 있으므로, 지금 인원으로 실제
    // 구성이 성립하는지도 함께 본다(고정 역할 합 > 현재 인원이면 시작할 수 없다).
    // AUTO에서는 바로 위 jokerCount 검사와 동일한 판정이라 기존 동작이 그대로 유지된다.
    if (!resolveRoleComposition(room.settings, players.length).ok) return false
    // F-19(AC-06): 확정되지 않은 초대 입장이 이 방에 하나라도 있으면 시작할 수 없다.
    // 예약만 있는 계정은 room.players에 없어 "전원 준비"를 통과해 버리고, 영수증 미확정
    // publication은 곧 보상으로 제거될 수 있다 — 어느 쪽이든 시작 시점의 참가자 명단이
    // 확정되지 않은 상태다.
    if (hasPendingAdmissionForRoom(room.id)) return false
    return players.every((player) => player.isReady === true)
}

function buildRoomPayload(room) {
    return {
        roomId: room.id,
        roomCode: room.code,
        // F-21(AC-02/AC-04/AC-06): 참가자 항목에는 서버가 발급한 membershipId가 들어 있다.
        // 추방 요청은 "누구를"이 아니라 "지금 이 방의 **이 소속을**" 지목해야 한다 — uuid만
        // 보내면 확인 도중 대상이 나갔다가 다시 들어온 경우 새 소속이 추방된다.
        // 복사본을 만들어 내보낸다(수신자가 변형해도 canonical 참가자 객체가 오염되지 않게).
        players: [...room.players.values()].map((player) => ({ ...player })),
        hostUuid: room.hostUuid,
        // 방 인스턴스와 프로세스 기동. 추방 요청이 "내가 보고 있던 그 방"을 서버가 확인할 수
        // 있게 하는 값이며, 같은 roomId로 다시 만들어진 방의 옛 명령을 거부하는 근거다.
        roomInstanceId: room.instanceId ?? null,
        bootEpoch: BOOT_EPOCH,
        canStart: computeCanStart(room),
        // F-20(AC-03/AC-05/AC-06): 참가자는 여기서만 현재 설정을 본다. 저장된 room.settings를
        // 그대로 내보내지 않고 허용 필드로 다시 조립한다 — 예전 데이터에 관전자 키가 섞여
        // 있어도 이 경계를 지나면 응답·편집 초안 어디에도 나타나지 않는다.
        accessType: room.accessType ?? null,
        settingsVersion: getSettingsVersion(room),
        settings: buildRoomSettingsView(room.settings),
    }
}

// F-13(AC-05): 인증된 uuid의 공개 프로필(사진·테두리)만 조회해 room.players 항목에 심을
// 필드를 만든다. economyServiceRef.getPublicProfileLoadouts는 지갑·소유 목록 등 비공개
// 정보를 절대 포함하지 않으므로(economy.service.js 참고), 이 필드를 그대로 room.players →
// buildRoomPayload → 클라이언트로 공개해도 안전하다. 조회 실패는 여기서 삼키지 않고 그대로
// 던진다 — 호출부(handleCreateRoomAfterReservation/handleJoinRoomByCode)가 방 생성·참가
// 실패로 처리해야, 계정 외형을 확보하지 못한 참가자가 빈 필드로 방에 들어가는 일이 없다.
async function loadRoomParticipantProfile(uuid) {
    const loadouts = await economyServiceRef.getPublicProfileLoadouts([uuid])
    const loadout = loadouts[uuid] ?? { profilePhotoId: null, profileBorderId: null }
    return {
        accountProfilePhotoId: loadout.profilePhotoId,
        accountProfileBorderId: loadout.profileBorderId,
    }
}

/**
 * F-20(AC-04): "이 시작 요청이 근거로 삼은 방 상태가 **지금도** 그대로인가".
 *
 * 방장·참가자 신원·소속·전원 준비·설정 버전을 한 술어로 묶는다. 같은 판정을 두 곳에서
 * 각자 적어 두면 한쪽만 고쳐져 갈라진다 — 실제로 내부(외형 조회 직후)와 바깥(await 복귀
 * 직후)은 **서로 다른 마이크로태스크**라, 그 사이에 끼어든 준비 취소는 내부 검사만으로는
 * 잡히지 않는다. 그래서 바깥 최종 동기 경계에서 이 술어를 다시 부른다.
 *
 * @param {Map<string,object>} playersAtCapture - 요청 시점의 uuid → 참가자 **객체**.
 *   uuid 집합만 비교하면 "나갔다가 같은 방에 다시 들어온" 참가자를 구분할 수 없다.
 */
function isStartRequestStillValid(room, hostUuid, playersAtCapture, settingsVersionAtCapture) {
    if (room.hostUuid !== hostUuid) return false
    if (room.players.size !== playersAtCapture.size) return false
    for (const [u, player] of playersAtCapture) {
        // 같은 계정이라도 **같은 참가자 객체**여야 한다(이탈·재입장은 새 객체를 만든다).
        if (room.players.get(u) !== player) return false
        // 계정→방 매핑도 함께 본다. 참가자 객체가 남아 있어도 소속이 이미 다른 방이면
        // 그 계정은 이 방의 참가자가 아니다.
        if (playerRoom.get(u) !== room.id) return false
        // F-21(AC-05): 서버 소속 식별자도 함께 본다. 객체 동일성이 이미 대부분을 잡지만,
        // 그 검사는 "같은 객체를 제자리에서 갈아 끼우지 않는다"는 관례에 기대고 있다 —
        // 추방·재입장이 그 관례를 깨는 순간 조용히 통과하지 않도록 명시적으로 확인한다.
        if (player.membershipId !== room.players.get(u)?.membershipId) return false
        // 준비는 캡처해 둔 복사본이 아니라 **살아 있는 참가자 객체**에서 읽는다.
        if (player.isReady !== true) return false
    }
    // 외형 조회를 기다리는 동안 방장이 설정을 바꿨다면(전원 준비가 해제됐다가 다시
    // 준비했더라도) 이 시작 요청은 **이전 설정**을 보고 시작된 것이다. 버전이 달라지면
    // 여기서 끝낸다 — 방장이 새로 시작 요청을 보내야 새 설정으로 한 판이 만들어진다.
    if (settingsVersionAtCapture !== undefined && settingsVersionAtCapture !== getSettingsVersion(room)) {
        return false
    }
    return true
}

/**
 * Capture current loadouts into a private session candidate. The public Room is
 * never mutated: prepare, delivery preflight or payload creation may still fail.
 * Only the game serializer may disclose the viewer's own role-specific skin.
 */
async function captureRoomStartProfiles(room, hostUuid, playersAtCapture, settingsVersionAtCapture) {
    const uuids = [...playersAtCapture.keys()]
    const loadouts = await economyServiceRef.getGameStartLoadouts(uuids)

    if (!isStartRequestStillValid(room, hostUuid, playersAtCapture, settingsVersionAtCapture)) {
        return { ok: false, code: 'ROOM_STATE_CHANGED' }
    }

    const players = new Map(uuids.map((uuid) => {
        const loadout = loadouts[uuid] ?? {}
        return [uuid, {
            ...room.players.get(uuid),
            accountProfilePhotoId: loadout.profilePhotoId ?? null,
            accountProfileBorderId: loadout.profileBorderId ?? null,
            accountCardFrameId: loadout.cardFrameId ?? null,
            accountSkinsByJob: { ...(loadout.skinsByJob
                ?? { noble: null, clown: null, guard: null, doctor: null, witchHunter: null }) },
        }]
    }))
    // F-20(AC-05): 세션 후보에는 방금 검사를 통과한 설정의 **중첩 복사본**을 넘긴다. 이후
    // 대기방 설정 객체가 바뀌거나(다음 저장) 같은 객체를 누가 변형해도, 이미 시작된 판의
    // 역할·제한시간이 소급해서 달라지지 않게 하기 위함이다.
    const settings = {
        ...room.settings,
        ...(room.settings?.roleCounts ? { roleCounts: { ...room.settings.roleCounts } } : {}),
        ...(room.settings?.roleNightActionTimes
            ? { roleNightActionTimes: { ...room.settings.roleNightActionTimes } }
            : {}),
    }
    // F-21: 세션이 승계할 프로세스 기동 식별자를 여기서 함께 넘긴다. 방 객체에 상시 두지 않는
    // 이유는 그 값이 방의 속성이 아니라 이 프로세스의 속성이기 때문이다 — 승계 지점 하나에서만
    // 실어 보내면 대기방과 게임이 같은 boot을 말한다는 것이 구조적으로 보장된다.
    return { ok: true, room: { ...room, players, settings, bootEpoch: BOOT_EPOCH } }
}

/** 공개 목록에 노출해도 되는 최소 Room 정보만 반환합니다. */
function buildPublicRoomList() {
    return [...gameRooms.values()]
        // 이번 목록 계약으로 생성된 open/code Room만 대상으로 하며, settings가 없는
        // 구버전 랜덤 매칭 Room은 공개 목록에 섞지 않는다.
        .filter((room) => room.accessType === 'open' || room.accessType === 'code')
        .map((room) => ({
            // roomCode·참가자·방장·소켓 식별자는 목록 표시에 필요 없고 참가 권한 및 개인정보와
            // 연결되므로 제외한다. code 방은 accessType만 내려 자물쇠 상태로 표시한다.
            id: room.id,
            current: room.players.size,
            max: room.settings.maxPlayers,
            title: room.title,
            accessType: room.accessType,
            status: room.players.size >= room.settings.maxPlayers ? 'full' : 'waiting',
            // F-20(AC-03): 목록에도 승인된 설정 요약을 싣는다. **편집 가능한 구성 수치만**
            // 담는다 — roomCode·hostUuid·players·준비 상태·개인별 배정 역할은 여기 없고,
            // 서버가 보존하는 D-12 세 플래그도 목록 요약에는 넣지 않는다(A-05).
            settingsVersion: getSettingsVersion(room),
            settings: buildEditableSettingsView(room.settings),
        }))
}

function emitPublicRoomList(io) {
    if (typeof io?.emit !== 'function') return

    try {
        io.emit('public_rooms_updated', { rooms: buildPublicRoomList() })
    } catch (error) {
        // 목록 알림 실패가 이미 확정된 방 생성·참가 상태를 되돌리면 안 된다.
        console.error('[공개방 목록 알림 실패]', error)
    }
}

function handleGetPublicRooms(callback) {
    if (typeof callback !== 'function') return
    callback({ ok: true, rooms: buildPublicRoomList() })
}

/**
 * 부분 가입된 Socket.IO room에서 안전하게 나갑니다.
 * socket.leave()는 어댑터에 따라 값을 반환하지 않거나 Promise를 반환할 수 있어 .catch()를
 * 직접 체이닝하면 동기 예외를 놓칠 수 있다 — try/catch로 감싸 두 경우를 모두 처리한다.
 * cleanup 실패 상세는 클라이언트에 노출하지 않고 서버 로그에만 남긴다.
 */
async function leaveSocketRoomSafely(socket, roomId, logLabel) {
    try {
        await socket.leave(roomId)
    } catch (cleanupError) {
        console.error(logLabel, cleanupError)
    }
}

/**
 * 인증된 사용자의 방 생성 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * @param {string} uuid - socket.data.user.uuid(인증된 신원). payload의 uuid/hostUuid는 쓰지 않는다.
 * @param {unknown} payload - 클라이언트가 보낸 설정값(신뢰하지 않음, validateCreateRoomPayload로 검증)
 * @param {(response:{ok:true,room:object}|{ok:false,message:string})=>void} callback
 * @returns {void} 반환값 없음, 결과는 callback으로만 전달한다.
 * 실패 조건: 콜백 없음 / 이미 참여 중 / 처리 중 요청 존재 / 매칭 큐 잔여 / 입력 검증 실패 /
 *           사용자 없음 / roomCode 생성 실패 / socket.join 실패 / 예상 못한 예외
 * 변경 Map/Set: 성공 시 gameRooms·playerRoom / 처리 중 pendingRoomTransitions
 * 불변조건: 실패로 끝나면 gameRooms/playerRoom에 어떤 흔적도 남지 않는다.
 */
function handleCreateRoom(io, socket, uuid, payload, callback) {
    // 응답을 받을 수 없는 요청은 어떤 상태도 바꾸지 않는다 — 그래서 다른 검사보다 먼저 확인한다.
    if (typeof callback !== 'function') return

    // 대기방 소속(playerRoom)보다 먼저 본다 — 인게임 소속은 "나가기"로 풀 수 없는 더 근본적인
    // 상태라, 두 조건이 겹칠 때 사용자가 실제로 해결해야 하는 쪽을 사유로 돌려줘야 한다.
    // 이 경로만 응답 채널이 ack callback이므로, 다른 세 경로와 같은 code/message 쌍을 담되
    // 기존 { ok:false, message } 계약 위에 code를 덧붙이는 형태로 내보낸다.
    if (rejectIfInActiveGame(uuid, (error) => callback({ ok: false, ...error }))) return

    if (playerRoom.has(uuid)) {
        callback({ ok: false, message: '이미 참여 중인 방이 있습니다.' })
        return
    }
    if (pendingRoomTransitions.has(uuid)) {
        callback({ ok: false, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    if (matchmakingQueue.has(uuid)) {
        // 큐에 남은 사용자를 여기서 자동으로 빼주지 않는다. 랜덤 매칭이 비활성화된 지금은
        // 큐에 남아 있는 상태 자체가 정상 흐름이 아니므로, 자동 정리 대신 사용자가 먼저
        // 정리하도록 원인을 알려 거부한다(동일 사용자의 큐·수동 방 중복 소속 방지).
        callback({ ok: false, message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return
    }

    const validation = validateCreateRoomPayload(payload)
    if (!validation.ok) {
        callback({ ok: false, message: validation.message })
        return
    }

    // 역할 구성(AUTO/CUSTOM)은 기본 검증을 통과한 maxPlayers/jokerCount와 함께 봐야 하므로
    // 그 뒤에 따로 검증한다. 통과하면 settings에 병합할 canonical 조각(방어적 복사본)만
    // 돌려준다 — 클라이언트 payload의 roleCounts 객체를 그대로 저장하지 않는다.
    const roleComposition = validateCreateRoomRoleComposition(payload, validation.value.settings)
    if (!roleComposition.ok) {
        callback({ ok: false, message: roleComposition.message })
        return
    }
    const validatedValue = {
        accessType: validation.value.accessType,
        settings: { ...validation.value.settings, ...roleComposition.value },
    }

    // await(사용자 조회) 이전, 아직 동기 실행 구간에서 예약한다. JS는 단일 스레드라 이
    // 지점까지는 다른 요청이 끼어들 수 없어, 같은 uuid의 두 번째 create_room/join_room_by_code도
    // 반드시 위의 pendingRoomTransitions.has(uuid) 검사에서 걸러진다(더블클릭/동시 요청 방지).
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        callback({ ok: false, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    // 같은 동기 구간에서 세대를 캡처해 둔다. GameSession 종료 정리가 이 uuid의 세대를
    // 이 요청이 대기하는 동안 증가시키면, 재개된 뒤의 재검사에서 걸러진다.
    const generationAtReservation = getRoomTransitionGeneration(uuid)

    handleCreateRoomAfterReservation(io, socket, uuid, validatedValue, callback, generationAtReservation, transitionToken)
}

async function handleCreateRoomAfterReservation(io, socket, uuid, { accessType, settings }, callback, generationAtReservation, transitionToken) {
    let roomId = null
    let joined = false
    let room = null

    try {
        // F-13(AC-05): 사용자 조회와 함께 인증 uuid의 공개 프로필(사진·테두리)도 확보한다
        // — 실패하면(경제 시스템 조회 오류 등) 기본 외형으로 조용히 넘어가지 않고 아래
        // catch에서 방 생성 실패로 처리한다.
        const [user, accountProfile] = await Promise.all([
            userRepositoryRef.findByUuid(uuid),
            loadRoomParticipantProfile(uuid),
        ])
        if (!user) {
            callback({ ok: false, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }

        // await 도중 다른 요청(코드 참가 등)으로 이미 방에 들어갔을 수 있어 최신 상태로 다시 확인한다.
        if (playerRoom.has(uuid)) {
            callback({ ok: false, message: '이미 참여 중인 방이 있습니다.' })
            return
        }

        // 사용자 조회를 기다리는 동안 GameSession 종료 정리가 이 uuid의 세대를 증가시켰을
        // 수 있다(예: 이 uuid가 활성 세션 참가자였고 그 세션이 종료됨). 세대가 달라졌으면
        // 아직 Socket room에 가입하지 않은 상태이므로 leave 없이 바로 실패로 응답한다.
        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            callback({ ok: false, message: '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.' })
            return
        }

        // 사용자 조회를 기다리는 동안 소켓 연결이 끊겼을 수 있다. 이 시점에 disconnect가
        // 이미 지나갔다면 onDisconnect는 playerRoom에 아무것도 없어 "정리할 것 없음"으로
        // 판단하고 지나갔을 것이다 — 그 뒤에 여기서 방을 커밋하면 아무도 정리하지 않는
        // 고아 방이 남는다. 커밋을 시작하기 전에 반드시 연결 상태를 다시 확인해야 한다.
        if (!socket.connected) {
            callback({ ok: false, message: '연결이 끊어져 방을 생성하지 못했습니다.' })
            return
        }

        roomId = crypto.randomUUID()
        room = {
            id: roomId,
            // F-19(AC-06): 같은 문자열 id/코드가 재사용되더라도 "그때 그 방"인지 구분하는
            // 인스턴스 식별자다. 초대는 이 값과 boot epoch를 함께 저장해, 방이 사라졌다가
            // 우연히 같은 식별자로 다시 생겨도 옛 초대로 입장하지 못하게 한다.
            instanceId: crypto.randomUUID(),
            code: null, // Socket room 가입 이후에 확정한다(아래 참고)
            hostUuid: uuid,
            title: `${user.nickname}의 방`,
            accessType,
            // 새로 생성된 방의 방장도 다른 참가자와 동일하게 준비 안 됨 상태로 시작한다
            // (방장이라고 자동으로 준비된 것으로 취급하지 않는다).
            players: new Map([[uuid, { uuid, nickname: user.nickname, isReady: false, ...accountProfile }]]),
            settings,
            // F-20: 이 방 설정의 첫 확정본. 실제 설정 교체(handleUpdateRoomSettings)에서만
            // 증가하며 클라이언트 입력으로는 절대 설정되지 않는다.
            settingsVersion: INITIAL_SETTINGS_VERSION,
        }

        // 공유 Map에 쓰기 전에 실제 Socket.IO room 가입부터 끝낸다. 이렇게 하면 join이
        // 실패해도 gameRooms/playerRoom엔 아무것도 안 남아 별도 롤백 로직이 필요 없어진다.
        await socket.join(roomId)
        joined = true

        // join을 기다리는 동안에도 연결이 끊겼을 수 있어 Map 커밋 직전에 한 번 더 확인한다.
        if (!socket.connected) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '연결이 끊어져 방을 생성하지 못했습니다.' })
            return
        }

        // socket.join을 기다리는 동안에도 GameSession 종료 정리가 세대를 증가시켰을 수
        // 있다 — Map 커밋 직전 마지막 재검사다. 이미 Socket room에는 가입했으므로 커밋하지
        // 않고 leave까지 마친 뒤 기존 실패 계약으로 응답한다.
        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.' })
            return
        }

        // roomCode는 join을 기다린 뒤, 그 시점의 최신 gameRooms를 기준으로 생성한다 —
        // join을 기다리는 짧은 시간 동안 다른 요청이 방을 먼저 커밋했을 수 있기 때문이다.
        const code = generateUniqueRoomCode(gameRooms)
        if (!code) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '방 코드를 생성하지 못했습니다. 다시 시도해주세요.' })
            return
        }
        room.code = code

        // 코드 확정과 Map 커밋 사이에는 await를 두지 않는다 — 그 틈에 다른 요청이 같은
        // 코드를 먼저 가져가면 두 방이 같은 코드를 공유하는 상태가 될 수 있기 때문이다.
        //
        // F-21(AC-06): 방장 소속 식별자도 **이 마지막 동기 구간에서** 발급한다. 위에서 방
        // 객체를 조립할 때 미리 발급하면, 연결 끊김·세대 변경·코드 생성 실패로 커밋되지
        // 않은 시도가 만든 식별자가 클라이언트에 먼저 새어 나갈 수 있다.
        room.players.get(uuid).membershipId = kickReceiptStore.nextMembershipId()
        gameRooms.set(roomId, room)
        playerRoom.set(uuid, roomId)
        // ABA 방지 결합: 이 Socket이 지금 이 Room의 정당한 소유자임을 표시해 둔다
        // (onDisconnect가 참조 — 다른 Socket의 지연 disconnect가 이 Room을 잘못 정리하지
        // 않도록 하는 근거가 된다).
        socket.data.activeRoomId = roomId
        emitPublicRoomList(io)
    } catch (err) {
        // repository/adapter 등 내부 오류의 상세 내용은 클라이언트에 노출하지 않고 서버에만 남긴다.
        console.error('[방 생성 에러]', err)
        if (joined && roomId) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
        }
        callback({ ok: false, message: '방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    } finally {
        // 성공/실패/예외 어떤 경로로 끝나든 반드시 해제해야 한다. 여기서 빠지면 이 사용자는
        // 이후 create_room/join_room_by_code를 영원히 "처리 중"으로 거부당하게 된다.
        // 자기 token일 때만 푼다 — 늦게 끝난 이 요청이 그 사이 시작된 새 요청을 풀지 않는다.
        releaseRoomTransition(uuid, transitionToken)
    }

    // 성공 callback은 Map 커밋을 감싼 try/catch 밖에서 호출한다. 그 안에 두면 callback
    // 자체가 던지는 예외(예: ack 직렬화 문제)를 "생성 실패"로 오인해, 이미 커밋된 Map은
    // 그대로 둔 채 Socket room만 정리하고 실패 콜백을 한 번 더 보내는 이중 응답이 생길 수
    // 있다. Map 커밋이 끝난 뒤에는 그 사실 자체를 되돌리지 않고, ack 전달 실패는 로그로만 남긴다.
    try {
        callback({ ok: true, room: buildRoomPayload(room) })
    } catch (ackError) {
        console.error('[방 생성 ack 실패]', ackError)
    }
}

async function handleJoinPublicRoom(io, socket, uuid, payload) {
    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    // null/문자열/배열 등 예상 밖 형태는 구조분해 예외 없이 명시적으로 거부한다.
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        return
    }
    const { roomId } = payload
    if (typeof roomId !== 'string' || !roomId) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        return
    }

    // 방 조회보다 앞에 둔다. 아래 handleJoinRoomByCode 위임에도 같은 게이트가 있지만, 그
    // 위임까지 가려면 방이 실제로 존재하고 공개 방이어야 한다 — 그 전에 걸리면 사용자는
    // 자신이 인게임이라 거부됐다는 사실 대신 ROOM_NOT_FOUND를 보게 된다. 사유를 안정적으로
    // 만들기 위해 여기서 먼저 판정한다. 차단되면 위임 자체를 하지 않으므로 실패가 두 번
    // 나가지 않는다.
    const room = gameRooms.get(roomId)
    if (!room) {
        // 목록을 본 뒤 누르기까지의 짧은 사이에 그 방이 게임을 시작했을 수 있다. 그때는
        // "없는 방"이 아니라 "이미 시작된 방"이라고 알려주는 편이 사용자에게 정확하다.
        if (isStartedRoomMark(`id:${roomId}`)) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.')
            return
        }
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
        return
    }
    // 클라이언트의 버튼 상태는 권한 경계가 아니다. 조작된 roomId 요청으로 코드 방에
    // 우회 입장하지 못하도록 서버가 실제 Room의 공개 여부를 반드시 다시 확인한다.
    // 코드 방이라는 사실 자체는 공개 목록의 자물쇠 표시로 이미 드러나므로 숨기지 않고,
    // 대신 "코드가 필요하다"는 사유를 코드 불일치로 분류해 돌려준다.
    if (room.accessType !== 'open') {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '이 방은 입장 코드가 필요합니다.')
        return
    }

    // 공개 목록에는 비밀 코드가 포함되지 않는다. 서버 내부에서 확인한 공개 Room의 코드만
    // 기존 코드 참가 경로에 전달해 동일한 잠금·정원·연결 종료 검사를 재사용한다.
    // 이때 지금 이 시점의 roomId/accessType을 함께 넘겨, handleJoinRoomByCode가 사용자
    // 조회 등으로 대기하는 동안 이 방이 삭제되고 우연히 같은 코드를 가진 다른(비공개일
    // 수도 있는) 방이 새로 생기더라도 커밋 직전에 "원래 선택한 그 방이 맞는지"를 다시
    // 검증할 수 있게 한다.
    await handleJoinRoomByCode(io, socket, uuid, room.code, { roomId: room.id, accessType: room.accessType })
}

async function handleJoinRoomByCode(io, socket, uuid, roomCode, expectedRoom = null) {
    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    const normalizedCode = String(roomCode ?? '').trim()
    if (!normalizedCode) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.CODE_REQUIRED, '방 코드를 입력해주세요.')
        return
    }

    // 진입 시점 동기 확인 — 여기서 걸러지는 요청은 예약(pendingRoomTransitions)조차 하지 않는다.
    // 인게임 소속을 대기방 소속보다 먼저 본다(handleCreateRoom과 같은 이유).
    if (playerRoom.has(uuid)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
        return
    }
    if (pendingRoomTransitions.has(uuid)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, '이미 처리 중인 요청이 있습니다.')
        return
    }
    if (matchmakingQueue.has(uuid)) {
        emitRoomJoinFailed(
            socket,
            ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE,
            '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.',
        )
        return
    }

    // create_room과 같은 잠금을 공유한다 — await 이전 동기 구간에서 예약해야 동시 요청을 막을 수 있다.
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, '이미 처리 중인 요청이 있습니다.')
        return
    }
    // create_room과 같은 이유로 같은 동기 구간에서 세대를 캡처한다.
    const generationAtReservation = getRoomTransitionGeneration(uuid)

    // catch 블록에서 "join은 됐는데 커밋 전에 실패했는지"를 구분해 Socket room을 정리해야
    // 하므로, try 안의 지역 변수가 아니라 바깥 스코프에 둔다.
    let joinedRoomId = null
    let committed = false

    /**
     * F-23(AC-04): **채널 가입부터 Map 커밋까지**의 전달 제외를 소유하는 토큰.
     *
     * 이 경로도 초대 수락과 같은 모양의 구간을 갖는다 — socket.join을 먼저 끝내고(1617행)
     * 그 **뒤에** 방 인스턴스·전이 세대·정원·소속을 다시 검사한다. 그 재검사 구간의 입장자는
     * 아직 참가자가 아닌데, 예전에는 아무 제외도 없어 join 완료 직후부터 그 방의 방송이
     * 그대로 전달됐다(재검사에서 거부돼 결국 들어가지 못한 요청도 마찬가지다).
     *
     * 토큰을 쓰는 이유는 같은 (채널, 소켓)에 대해 **다른** 흐름이 자기 제외를 들고 있을 수
     * 있기 때문이다 — 그쪽이 먼저 끝나도 이 커밋 전 제외는 남아야 한다.
     */
    const joinExclusionOwner = channelMembership.createChannelExclusionOwner('join-by-code')
    let joinExclusionChannelId = null
    const releaseJoinExclusion = () => {
        if (joinExclusionChannelId === null) return
        channelMembership.releaseChannelExclusion(joinExclusionChannelId, socket.id, joinExclusionOwner)
        joinExclusionChannelId = null
    }
    /**
     * 커밋 전 실패 경로의 채널 정리.
     *
     * raw leave(leaveSocketRoomSafely)는 실패를 로그로만 남기고 삼킨다 — 그러면 떼지 못한
     * 소켓이 **아무 제외 없이** 채널에 남아 그 방의 방송을 계속 받는다. 공통 경계는 완료·
     * 실패를 조정하고, 끝내 떼지 못하면 **자기 토큰으로** 전달에서 빼 둔다(fail-closed).
     * 그 토큰은 이 계정이 그 채널을 정당하게 다시 소유하면 공통 경계가 스스로 푼다.
     */
    const detachJoinedRoomChannel = (channelId) => {
        detachSocketFromChannel(socket, channelId, '[코드 참가 정리 실패]', { uuid }, {
            ownsChannel: () =>
                isAccountSeatedInRoom(uuid, channelId)
                && isCanonicalSocketForAccount(io, uuid, socket, channelId),
            keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
        })
    }

    try {
        // F-13(AC-05): handleCreateRoomAfterReservation과 같은 이유로 사용자 조회와 함께
        // 공개 프로필도 확보한다.
        const [user, accountProfile] = await Promise.all([
            userRepositoryRef.findByUuid(uuid),
            loadRoomParticipantProfile(uuid),
        ])
        if (!user) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, '사용자 정보를 찾을 수 없습니다.')
            return
        }

        // await 이후 재검사 — 조회하는 동안 다른 요청으로 이미 방에 들어갔을 수 있다.
        if (playerRoom.has(uuid)) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
            return
        }

        // 사용자 조회를 기다리는 동안 GameSession 종료 정리가 이 uuid의 세대를 증가시켰을
        // 수 있다. 아직 Socket room에 가입하지 않았으므로 leave 없이 바로 실패로 응답한다.
        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            emitRoomJoinFailed(
                socket,
                ROOM_JOIN_ERROR_CODES.SESSION_ENDED,
                '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.',
            )
            return
        }

        // 목록에서 특정 비밀방을 선택한 요청은 roomId로 방을 먼저 고정한 뒤 코드를
        // 비교한다. 그래야 "그 방이 사라짐"과 "그 방의 코드가 틀림"을 안정적으로
        // 구분할 수 있다. 툴바의 일반 코드 참가(선택 roomId 없음)는 기존처럼 코드로 찾는다.
        let room
        if (expectedRoom?.accessType === 'code') {
            room = gameRooms.get(expectedRoom.roomId)
            if (!room) {
                if (isStartedRoomMark(`id:${expectedRoom.roomId}`)) {
                    emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.')
                } else {
                    emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '방을 찾을 수 없습니다.')
                }
                return
            }
            if (room.accessType !== 'code') {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '비밀 방을 찾을 수 없습니다.')
                return
            }
            if (room.code !== normalizedCode) {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '입장 코드가 올바르지 않습니다.')
                return
            }
        } else {
            room = [...gameRooms.values()].find((candidate) => candidate.code === normalizedCode)
        }
        if (!room) {
            // 세 사유를 여기서 갈라낸다.
            //  - 그 코드의 방이 방금 게임을 시작했다면 "이미 시작됨"
            //  - roomId를 지목해 들어온 요청(공개방 목록 경유)이면 그 방이 사라진 것이므로 "방 없음"
            //  - 사용자가 직접 코드를 입력한 요청이면 입력한 코드가 어느 방과도 맞지 않는 것이므로 "코드 불일치"
            if (isStartedRoomMark(`code:${normalizedCode}`)) {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.')
                return
            }
            if (expectedRoom) {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
                return
            }
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '입장 코드와 일치하는 방이 없습니다.')
            return
        }

        // Map 커밋 전에 실제 Socket.IO room 가입부터 끝낸다(create_room과 동일한 이유).
        // F-23(AC-04): 가입을 **시작하기 전에** 전달에서 뺀다 — join 완료 → 재검사 → 커밋
        // 직전까지 이 제외가 유지되므로, 확정되지 않은 입장자에게는 어떤 방송도 닿지 않는다.
        joinExclusionChannelId = room.id
        channelMembership.excludeSocketFromChannel(room.id, socket.id, joinExclusionOwner)
        await socket.join(room.id)
        joinedRoomId = room.id

        // create_room과 같은 이유로, join을 기다리는 동안 연결이 끊겼을 가능성을 확인한다.
        if (!socket.connected) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.DISCONNECTED, '연결이 끊어져 방에 참여하지 못했습니다.')
            return
        }

        // join 대기 중 방이 삭제됐거나(예: 방장이 delete_room) 같은 id로 다른 객체가
        // 들어섰을 가능성을 점검한다 — playerRoom 매핑만으로는 이 변화를 알 수 없다.
        if (gameRooms.get(room.id) !== room) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            // 코드로 찾을 때는 분명히 있던 방이 지금은 없거나 다른 객체로 바뀐 상황이다 —
            // "입력한 코드가 틀렸다"가 아니라 "그 방이 사라졌다"가 정확한 사유다.
            if (isStartedRoomMark(`id:${room.id}`)) {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.')
                return
            }
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '방을 찾을 수 없습니다.')
            return
        }

        // 공개방 목록에서 특정 roomId를 선택해 들어온 요청이라면, 코드로 다시 찾은 이 방이
        // 정말 그 방이 맞는지(그리고 여전히 공개 방인지) 커밋 직전에 재검증한다. 대기하는
        // 동안 원래 선택한 방이 삭제되고 우연히 같은 코드를 가진 다른 방(비공개일 수도
        // 있음)이 새로 생겼다면, 위의 id 동일성 검사만으로는 걸러지지 않는다 — 그 다른
        // 방도 새로 찾은 room 참조와 gameRooms의 참조가 일치해 정상 방처럼 보이기 때문이다.
        if (expectedRoom && (room.id !== expectedRoom.roomId || room.accessType !== expectedRoom.accessType)) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
            return
        }

        // join 대기 중 다른 경로로 이미 다른 방에 들어갔을 수 있어 다시 확인한다.
        if (playerRoom.has(uuid)) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
            return
        }

        // socket.join을 기다리는 동안에도 GameSession 종료 정리가 세대를 증가시켰을 수
        // 있다 — Map 커밋 직전 마지막 재검사다. 이미 Socket room에는 가입했으므로 leave까지
        // 마친 뒤 기존 실패 계약으로 응답한다.
        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(
                socket,
                ROOM_JOIN_ERROR_CODES.SESSION_ENDED,
                '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.',
            )
            return
        }

        // settings가 없는 방은 랜덤 매칭이 만든 구버전 방이다(이번 작업이 그 경로를 건드리지
        // 않기 때문). 두 종류의 방이 이 정원 검사를 공유하므로 임시 fallback을 둔다 —
        // 향후 모든 방 구조가 settings로 통일되면 이 fallback은 제거할 수 있다.
        const maxRoomSize = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        // join 이후의 최신 인원 수로 마지막 한 자리를 다시 검사한다 — 여러 명이 동시에
        // 마지막 자리를 두고 경쟁할 때 정원을 넘기지 않기 위한 마지막 방어선이다.
        //
        // F-19(AC-06): 확정 참가자뿐 아니라 **유효한 초대 입장 예약**도 자리를 차지한다.
        // 예약을 세지 않으면 초대 수락과 마지막 자리 일반 입장이 동시에 통과해 정원을 넘긴다.
        if (countRoomOccupancy(room, uuid) >= maxRoomSize) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_FULL, '방이 가득 찼습니다.')
            return
        }

        // 마지막 검사와 Map 커밋 사이에는 await를 두지 않는다 — 그 틈에 다른 요청이
        // 끼어들면 방금 한 정원 검사가 무의미해지기 때문이다.
        // 새로 참가하는 사용자도 항상 준비 안 됨 상태로 시작한다(이전 방 참여 이력과 무관).
        //
        // F-21(AC-06): 새 소속 식별자도 이 동기 커밋 구간에서 발급한다. 추방됐던 계정이 같은
        // 방에 다시 들어와도 **다른** membershipId를 받으므로, 뒤늦게 도착한 옛 추방 명령·
        // 이탈 방송이 이 새 소속을 자기 대상으로 오인할 수 없다(A-04). 단순 재연결은 이
        // 경로를 지나지 않으므로 기존 식별자를 그대로 유지한다.
        const player = {
            uuid,
            nickname: user.nickname,
            isReady: false,
            membershipId: kickReceiptStore.nextMembershipId(),
            ...accountProfile,
        }
        room.players.set(uuid, player)
        playerRoom.set(uuid, room.id)
        committed = true
        // ABA 방지 결합: create_room과 동일한 이유(onDisconnect 참고).
        socket.data.activeRoomId = room.id

        // F-23(AC-04): 여기서부터만 확정 참가자다 — 이제 전달 제외를 푼다. 아래
        // player_joined_room부터 정상 수신이 시작되고, 그 이전의 어떤 방송도 닿지 않았다.
        releaseJoinExclusion()

        socket.emit('room_joined', buildRoomPayload(room))
        // 전달 제외 경계를 지난다(player_ready_changed와 같은 이유) — 떼지 못한 옛 소속이
        // 이 채널에 남아 있으면 새 참가자의 명단이 그 연결로 흘러간다.
        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...player }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
        emitPublicRoomList(io)
    } catch (err) {
        console.error('[코드 참가 에러]', err)
        // 위의 명시적 실패 경로들은 각자 leave까지 마쳤다. 여기 도달했다는 건 예상 못한
        // 예외라는 뜻이므로, join은 됐지만(joinedRoomId 존재) 아직 커밋 전이라면 Socket
        // room에 남아있는 상태다 — 커밋 여부와 무관하게 정리를 놓치지 않도록 확인한다.
        if (joinedRoomId && !committed) {
            detachJoinedRoomChannel(joinedRoomId)
        }
        emitRoomJoinFailed(
            socket,
            ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR,
            '방에 참여하지 못했습니다. 잠시 후 다시 시도해주세요.',
        )
    } finally {
        releaseRoomTransition(uuid, transitionToken)
        /**
         * F-23(AC-04): 이 시도의 **커밋 전 제외**는 여기서 끝난다.
         *
         * 실패 경로는 이미 채널 정리를 마쳤고, 그 정리가 끝내 실패한 경우의 fail-closed는
         * detachSocketFromChannel이 **자기 토큰으로** 따로 들고 있다. 그러므로 이 토큰을
         * 남길 이유가 없고, 남기면 같은 계정·같은 소켓의 다음 정상 입장이 그 방의 방송을
         * 영영 받지 못한다(폐기된 옛 토큰의 영구 잔류).
         */
        releaseJoinExclusion()
    }
}

/**
 * 현재 사용자가 속한 방 정보를 조회합니다(읽기 전용, 어떤 상태도 바꾸지 않음).
 * create_room의 ack가 유실/타임아웃됐을 때 클라이언트가 실제 생성 여부를 확인하는 용도로 쓰인다.
 * @returns {void} callback({ok:true, room:object|null, pending?:true})
 */
function handleGetCurrentRoom(uuid, callback) {
    if (typeof callback !== 'function') return

    // F-19(AC-06): 미확정 초대 입장 시도를 **Map 조회보다 먼저** 본다. 예전 구현은
    // playerRoom에 값이 있으면 곧바로 방을 돌려줬는데, phase='published'인 시도는 두 Map에는
    // 들어갔지만 durable 영수증이 아직 없다 — 그 상태를 "정상 소속"으로 답하면 화면이
    // 확정되지 않은 입장을 확정된 것으로 표시하고, 뒤이은 보상 제거와 어긋난다.
    const attempt = getAdmissionAttempt(uuid)
    if (attempt) {
        callback({ ok: true, room: null, pending: true })
        return
    }

    const roomId = playerRoom.get(uuid)

    if (!roomId) {
        // 방은 아직 없지만 같은 사용자의 create_room/join_room_by_code가 아직 처리
        // 중일 수 있다. 이 경우를 "방 없음"으로 단정해 버리면 ack를 놓친 클라이언트가
        // 서버가 실제로는 곧 방을 만들 예정인데도 성급하게 실패로 안내할 수 있어
        // pending 신호를 따로 내려주고, 최종 판단은 클라이언트의 재조회에 맡긴다.
        if (pendingRoomTransitions.has(uuid)) {
            callback({ ok: true, room: null, pending: true })
            return
        }
        callback({ ok: true, room: null })
        return
    }

    const room = gameRooms.get(roomId)

    // 역방향 매핑(playerRoom)만 믿고 응답하지 않는다. 방이 이미 삭제됐거나 실제로는 그
    // 방의 참가자 목록에 없는(매핑이 깨진) 상태라면, 실제 참가자가 아닌 사람에게
    // roomCode 등 초대 정보를 돌려주는 사고로 이어질 수 있다.
    if (!room || !room.players.has(uuid)) {
        playerRoom.delete(uuid) // 깨진 매핑은 정리해 다음 조회부터 일관되게 "없음"으로 응답한다
        cancelRoomRetention(uuid) // 매핑이 사라졌으니 유예 예약도 함께 버린다
        callback({ ok: true, room: null })
        return
    }

    // 여기까지 왔다는 것은 이 사용자가 지금 이 방의 실제 참가자임을 서버가 확인했다는 뜻이다.
    // 새로고침 직후의 재조회도 이 경로로 들어오므로, 이 확인을 유예 취소 신호로 쓴다.
    markRoomPresenceConfirmed(uuid)
    cancelRoomRetention(uuid)

    callback({ ok: true, room: buildRoomPayload(room) })
}

function handleLeaveMatchmaking(uuid) {
    matchmakingQueue.delete(uuid)
}

function handleDeleteRoom(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return

    channelMembership.emitToChannel(io, roomId, 'room_deleted', {})

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
    // F-19(AC-06): 삭제된 방을 향한 미확정 입장 시도와 PENDING 초대를 함께 끝낸다.
    invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_DELETED')
    // F-20(A-07): 설정 변경 결과 기록의 수명은 그 대기방의 수명을 넘지 않는다.
    forgetSettingsUpdateResultsForRoom(roomId)
    cancelInvitesForRoomAsync(roomId, 'ROOM_DELETED')
    emitPublicRoomList(io)
}

/**
 * 사라진 방의 PENDING 초대를 뒤늦게 종료한다(fire-and-forget).
 * 실패해도 입장이 열리지 않는다 — 입장 검사는 언제나 현재 방 상태를 다시 본다.
 */
function cancelInvitesForRoomAsync(roomId, reason) {
    Promise.resolve()
        .then(() => gameInviteService.cancelPendingInvitesForRoom(roomId, reason))
        .catch((err) => console.error('[방 소멸 초대 정리 실패]', err))
}

/**
 * 인증된 사용자 본인의 준비 상태를 변경합니다(Socket.IO acknowledgement 방식).
 * payload에 대상 uuid를 받지 않는다 — 본인 외의 참가자 상태를 바꿀 방법 자체를 이벤트
 * 설계에서 없앤 것이다(신뢰 경계는 socket.data.user.uuid, 즉 이 함수의 uuid 인자 하나뿐).
 * @param {unknown} payload - { isReady: boolean, roomId: string, expectedSettingsVersion: number }
 *   형태만 허용(신뢰하지 않음, 상태 변경 전에 검증). 세 필드는 모두 필수다 — F-20(AC-04).
 * @param {(response:{ok:true,isReady:boolean,canStart:boolean}|{ok:false,message:string})=>void} callback
 */
function handleSetReady(io, socket, uuid, payload, callback) {
    // 응답을 받을 수 없는 요청은 어떤 상태도 바꾸지 않는다 — 다른 검사보다 먼저 확인한다.
    if (typeof callback !== 'function') return

    // payload 형식은 반드시 상태를 바꾸기 전에 검사한다. 검증을 통과하기 전에 Map을
    // 먼저 건드리면, 잘못된 형식의 요청 하나가 되돌릴 수 없는 부분 반영을 남길 수 있다.
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        callback({ ok: false, message: '잘못된 요청입니다.' })
        return
    }
    const { isReady, roomId: expectedRoomId, expectedSettingsVersion } = payload
    if (typeof isReady !== 'boolean') {
        callback({ ok: false, message: '잘못된 요청입니다.' })
        return
    }
    // F-20(AC-04): 방·설정 버전은 **필수**다. 선택으로 두면 그 값을 싣지 않은 요청만으로
    // 늦은 준비가 새 설정의 전원 해제를 되돌릴 수 있어, 아래 대조 자체가 우회된다. 빠졌거나
    // 형태가 틀린 요청은 상태를 보기도 전에 거부한다 — 서버가 현재 값으로 채워 주지 않는다
    // (채우면 "요청자가 무엇을 보고 눌렀는가"라는 이 필드의 유일한 의미가 사라진다).
    if (typeof expectedRoomId !== 'string' || expectedRoomId.length === 0) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isSafeInteger(expectedSettingsVersion) || expectedSettingsVersion < 1) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }

    // F-19(AC-06): 자기 입장이 아직 확정되지 않았으면 준비 상태를 바꿀 수 없다. 예약만 있는
    // 계정은 애초에 room.players에 없어 아래에서 걸리지만, 영수증 미확정 publication은
    // room.players에 있으므로 여기서 따로 막아야 한다.
    if (getAdmissionAttempt(uuid)) {
        callback({ ok: false, message: '입장 처리가 아직 끝나지 않았습니다. 잠시 후 다시 시도해주세요.' })
        return
    }

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    const player = room?.players.get(uuid)
    if (!room || !player) {
        callback({ ok: false, message: '참여 중인 방이 없습니다.' })
        return
    }

    // F-20(AC-04): 저장 이전에 발행됐으나 늦게 도착한 준비 요청을 **새 설정에 적용하지
    // 않는다**. 설정이 바뀌면 서버가 전원 준비를 해제하는데, 그 해제 직전에 떠난 "준비 완료"
    // 요청이 뒤늦게 반영되면 해제 스냅샷이 조용히 되돌아간다. 요청자가 어느 방·어느 설정
    // 버전을 보고 눌렀는지 함께 보냈을 때만 대조할 수 있으므로, 보냈다면 반드시 맞아야 한다.
    if (expectedRoomId !== roomId || expectedSettingsVersion !== getSettingsVersion(room)) {
        callback({
            ok: false,
            code: ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT,
            roomId,
            settingsVersion: getSettingsVersion(room),
            message: '방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요.',
        })
        return
    }

    // 요청한 값이 이미 현재 값과 같으면 상태 변경도 방송도 하지 않는다(멱등 계약) — 같은
    // 요청이 여러 번 와도 결과가 달라지지 않고, 불필요한 알림으로 다른 참가자 화면이
    // 깜빡이는 것도 막는다.
    if (player.isReady === isReady) {
        callback({
            ok: true,
            isReady: player.isReady,
            canStart: computeCanStart(room),
            roomId,
            settingsVersion: getSettingsVersion(room),
            readyRevision: Number.isInteger(player.readyRevision) ? player.readyRevision : 0,
        })
        return
    }

    player.isReady = isReady
    // F-16(AC-01/AC-04): 실제 상태가 바뀐 이 순간에만 사건 번호를 올린다. 위의 멱등 분기
    // (같은 값 재요청)는 여기 도달하지 않으므로 재시도에 새 사건이 생기지 않는다.
    //
    // uuid + boolean만으로 키를 만들면 false→true→false→true의 두 번째 true가 첫 번째와
    // 같은 키가 되어 "중복"으로 묻힌다. 그 둘은 서로 다른 실제 변경이므로 방마다·참가자마다
    // 단조 증가하는 revision을 ID에 포함한다.
    player.readyRevision = (Number.isInteger(player.readyRevision) ? player.readyRevision : 0) + 1
    const canStart = computeCanStart(room)
    // 방송과 ACK가 같은 ID를 공유한다 — 요청자는 ACK로, 나머지는 방송으로 같은 사건 하나를
    // 받는다(각자 자기 계정 범위에서 1회).
    const sfxEvent = {
        eventId: `room:${roomId}:ready:${uuid}:${player.readyRevision}`,
        roomId,
        origin: 'live',
    }
    // F-20(AC-04/AC-05): 준비 사건에도 방·설정 버전·준비 revision을 함께 싣는다. 수신자는
    // 이 값으로 "지금 내가 보고 있는 설정에서 일어난 준비 변경인지"를 판정할 수 있고,
    // 오래된 준비 응답이 새 해제 스냅샷을 되돌리는 일을 막는다.
    const readyEnvelope = {
        roomId,
        settingsVersion: getSettingsVersion(room),
        readyRevision: player.readyRevision,
    }
    // F-21(AC-05/AC-06): 방 채널 방송도 전달 제외 경계를 지난다. senderSocket을 주므로 정상
    // 경로(제외 없음)에서는 기존 `socket.to(roomId).emit`과 **완전히 같은** 한 번의 방송이고,
    // 떼지 못한 옛 소속이 이 채널에 남아 있을 때만 그 소켓을 빼고 보낸다 — 그러지 않으면
    // 추방된 계정이 자기가 쫓겨난 방의 준비 상태를 계속 받는다.
    channelMembership.emitToChannel(
        io, roomId, 'player_ready_changed',
        { uuid, isReady, canStart, sfxEvent, ...readyEnvelope },
        { senderSocket: socket },
    )
    callback({ ok: true, isReady, canStart, sfxEvent, ...readyEnvelope })
}

// ── F-20 AC-01~AC-06: 대기방 설정 변경 ───────────────────────────────────────

/**
 * 설정 변경 사건 하나를 **확정 참가자에게만** 전달한다.
 *
 * io.to(roomId)를 쓰지 않는 이유: Socket.IO 채널 가입은 소속의 근거가 아니다. 초대 수락의
 * 미확정 입장(phase='published')은 채널에 들어와 있지만 아직 영수증이 없고, 늦게 성공한
 * join이 남긴 유령 청취자도 같은 채널에 있을 수 있다. 참가자 전체 명단·준비 상태가 담긴
 * 응답을 그런 연결에 흘리지 않도록, room.players의 확정 참가자 + 이 방 채널에 실제로
 * 들어와 있는 현재 소켓만 골라 개별 전달한다.
 *
 * 전달을 놓친 정상 참가자는 get_current_room 재조회로 회복한다 — 전달 실패가 이미 커밋된
 * 설정을 되돌리지는 않는다.
 */
function emitRoomSettingsUpdated(io, room) {
    const confirmedUuids = [...room.players.keys()].filter((playerUuid) => !getAdmissionAttempt(playerUuid))
    let sockets
    try {
        sockets = resolveParticipantSockets(io, confirmedUuids, room.id)
    } catch (err) {
        console.error('[설정 변경 수신자 조회 실패]', err)
        return
    }

    const payload = {
        roomId: room.id,
        settingsVersion: getSettingsVersion(room),
        accessType: room.accessType ?? null,
        settings: buildRoomSettingsView(room.settings),
        hostUuid: room.hostUuid,
        // 같은 버전의 참가자 준비 상태·canStart를 함께 싣는다 — 설정 변경이 전원 준비를
        // 해제하므로, 설정만 내려보내면 화면의 준비 표시가 한 박자 어긋난다.
        players: [...room.players.values()],
        canStart: computeCanStart(room),
    }

    for (const uuid of confirmedUuids) {
        for (const s of sockets.get(uuid) ?? []) {
            try {
                s.emit(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED, payload)
            } catch (err) {
                console.error('[설정 변경 전달 실패]', err)
            }
        }
    }
}

/**
 * 방장의 대기방 설정 변경을 검증하고 커밋합니다(Socket.IO acknowledgement 방식).
 *
 * 절차는 "형태 검증 → 재시도 판정 → 권한·현재 상태 검사 → 커밋 → 방송 → ack"이고,
 * **권한 검사부터 커밋·결과 기록까지 어떤 await도 두지 않는다**. 그래야 검사 시점과 커밋
 * 시점 사이에 다른 요청(입장·시작·이탈)이 끼어들 수 없어, 통과한 조건 그대로 저장된다.
 *
 * @param {string} uuid - 서버가 캡처한 인증 신원. payload의 어떤 값도 신원으로 쓰지 않는다.
 * @param {(uuid:string)=>string|null} [getCurrentSocketId] - 이 계정의 현재(canonical) socket.id
 *   접근자. 세션 재검증 await 사이에 같은 계정의 새 로그인이 소켓을 교체했다면 이 요청은
 *   더 이상 그 계정의 현재 연결이 아니므로 아무 상태도 바꾸지 않는다.
 */
function handleUpdateRoomSettings(io, socket, uuid, payload, callback, getCurrentSocketId) {
    // 응답을 받을 수 없는 요청은 어떤 상태도 바꾸지 않는다 — 다른 검사보다 먼저 확인한다.
    if (typeof callback !== 'function') return

    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            // 이미 커밋한 결과를 ACK 실패로 되돌리거나 실패로 다시 기록하지 않는다.
            console.error('[설정 변경 ack 실패]', ackErr)
        }
    }
    const reject = (code, message, extra = {}) => respond({ ok: false, code, message, ...extra })

    // 0) 형태 검증 — 상태를 보기 전에 끝낸다. 허용 목록 밖 필드(관전자 키 포함)는 여기서 걸린다.
    const validated = validateUpdateRoomSettingsPayload(payload)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const { roomId, requestId, expectedSettingsVersion, accessType, settings } = validated.value
    // 재시도 판정용 지문에는 기대 버전까지 들어간다 — 같은 requestId로 **다른 버전**을 보고
    // 누른 요청은 같은 요청이 아니다(아래 2번 분기가 그 차이를 REQUEST_ID_REUSED로 끝낸다).
    const fingerprint = fingerprintUpdateRequest(expectedSettingsVersion, accessType, settings)
    // changed 판정은 버전과 무관한 "설정 값이 달라지는가"라서 별도의 설정 지문을 쓴다.
    const settingsFingerprint = fingerprintUpdateSettings(accessType, settings)

    // 1) 이 소켓이 지금도 이 계정의 현재 연결인가. 세션 가드의 await 동안 같은 계정의 새
    // 로그인이 소켓을 교체했을 수 있다 — 교체된 옛 소켓의 요청은 여기서 끝난다.
    //
    // 이 검사는 **기록 재생보다 반드시 먼저** 온다. 재생도 "지금 이 연결에게 저장 결과를
    // 알려준다"는 응답이므로, 끊기거나 교체된 소켓이 ok:true를 받으면 인증되지 않은 연결이
    // 서버 상태를 읽은 것이 된다. 재생이 상태를 바꾸지 않는다는 사실은 그 응답을 받을 자격과
    // 무관하다 — 유효한 같은 계정의 멱등 재시도는 아래에서 그대로 살아 있다.
    if (socket?.data?.user?.uuid !== uuid || socket?.connected === false) {
        reject(ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }
    if (typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        reject(ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }

    // 2) 같은 (계정·방·requestId) 키의 기록이 있으면 **재커밋하지 않는다**. 같은 입력이면
    // 기록된 결과를 그대로 돌려주고(ACK 유실 재시도), 다른 입력이면 키 재사용으로 거부한다
    // — 같은 키로 서로 다른 두 저장이 일어나면 결과 조회가 어느 쪽을 말하는지 알 수 없다.
    pruneSettingsUpdateResults()
    const resultKey = settingsUpdateResultKey(uuid, roomId, requestId)
    const recorded = roomSettingsUpdateResults.get(resultKey)
    if (recorded) {
        if (recorded.fingerprint !== fingerprint) {
            reject(ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED, '이미 사용한 요청 식별자입니다.')
            return
        }
        respond({
            ok: true,
            replayed: true,
            changed: recorded.changed,
            roomId,
            requestId,
            settingsVersion: recorded.settingsVersion,
        })
        return
    }

    // 3) 활성 세션 참가자는 대기방 설정을 바꿀 수 없다(애초에 대기 상태가 아니다).
    if (rejectIfInActiveGame(uuid, ({ message }) =>
        reject(ROOM_SETTINGS_ERROR_CODES.ALREADY_IN_GAME, message)
    )) return

    // 4) 자기 입장이 아직 확정되지 않았으면 방장일 수 없다. 다른 사람의 예약은 여기서 막지
    // 않는다 — 그건 아래 정원 하한(AC-02)이 다룰 사실이지 편집 권한의 문제가 아니다.
    if (getAdmissionAttempt(uuid)) {
        reject(ROOM_SETTINGS_ERROR_CODES.ADMISSION_PENDING, '입장 처리가 아직 끝나지 않았습니다.')
        return
    }

    // 5) 소속·방 객체·방장 — playerRoom의 현재 값을 유일한 근거로 삼고, payload의 roomId는
    // "요청자가 어느 방을 보고 눌렀는가"를 확인하는 용도로만 쓴다.
    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) {
        reject(ROOM_SETTINGS_ERROR_CODES.NOT_IN_ROOM, '참여 중인 방이 없습니다.')
        return
    }
    if (currentRoomId !== roomId) {
        reject(ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    const room = gameRooms.get(roomId)
    if (!room || !room.players.has(uuid)) {
        reject(ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    if (room.hostUuid !== uuid) {
        reject(ROOM_SETTINGS_ERROR_CODES.NOT_HOST, '방장만 설정을 변경할 수 있습니다.')
        return
    }

    // 6) 기대 버전. 값이 우연히 현재와 같아지더라도 버전이 다르면 충돌이다 — 방장이 보지
    // 못한 변경이 그 사이에 있었다는 사실 자체가 바뀌지 않기 때문이다.
    const currentVersion = getSettingsVersion(room)
    if (expectedSettingsVersion !== currentVersion) {
        reject(
            ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT,
            '설정이 이미 변경되었습니다. 최신 설정을 불러온 뒤 다시 시도해주세요.',
            { room: buildRoomPayload(room) },
        )
        return
    }

    // 7) AC-02: 정원은 지금 이 방이 차지한 자리 수(확정 참가자 + 유효한 reserved 예약)보다
    // 작을 수 없다. 반대로 "현재 인원으로 역할 구성이 성립하는가"는 여기서 보지 않는다 —
    // 저장은 정원 기준으로 검증하고, 실제 인원 기준 재검증은 시작 시점의 몫이다(A-03).
    const occupancy = countRoomOccupancy(room)
    if (settings.maxPlayers < occupancy) {
        reject(
            ROOM_SETTINGS_ERROR_CODES.MAX_PLAYERS_BELOW_OCCUPANCY,
            `현재 인원(${occupancy}명)보다 적은 정원으로는 변경할 수 없습니다.`,
            { occupancy, room: buildRoomPayload(room) },
        )
        return
    }

    // 8) 실제로 달라지는 것이 없으면 버전도 준비 상태도 건드리지 않고 방송도 하지 않는다.
    // 같은 설정을 다른 requestId로 다시 저장해도 준비가 풀리면 안 되기 때문이다(A-02).
    const currentFingerprint = fingerprintUpdateSettings(
        room.accessType, buildEditableSettingsView(room.settings),
    )
    const changed = currentFingerprint !== settingsFingerprint

    if (!changed) {
        // AC-06: 값이 그대로여도 **저장값에 남은 허용 목록 밖 키**(예전 데이터의 관전자 필드)는
        // 이 저장 경계에서 걷어낸다. 아래 커밋 경로는 새 객체를 만들어 이미 그렇게 하지만,
        // 여기서 그냥 돌아가면 관전자 키가 저장값에 계속 살아남는다.
        //
        // 편집 가능한 값과 accessType은 정의상 지금과 같고(changed=false), D-12 세 값은
        // buildRoomSettingsView가 그대로 옮긴다 — 그래서 이 교체는 버전·준비 상태·방송 어느
        // 것도 건드리지 않는다. 오염이 없는 방은 아예 교체하지 않는다.
        if (settingsContainNonAllowlistedKeys(room.settings)) {
            room.settings = buildRoomSettingsView(room.settings)
        }
        recordSettingsUpdateResult(resultKey, {
            roomId, fingerprint, changed: false, settingsVersion: currentVersion,
            expiresAt: Date.now() + SETTINGS_UPDATE_RESULT_TTL_MS,
        })
        respond({ ok: true, changed: false, roomId, requestId, settingsVersion: currentVersion })
        return
    }

    // 9) 커밋. 여기부터 결과 기록까지 await가 없다.
    //
    // 기존 room.settings를 통째로 spread하지 않는다 — 그러면 예전 데이터에 남은 관전자 키나
    // 알 수 없는 필드가 계속 살아남는다. 승인된 편집 필드의 새 복사본에, 서버가 보존하는
    // D-12 세 값만 골라 얹어 새 객체를 만든다(AC-06 / A-06).
    const nextSettings = { ...settings }
    for (const key of PRESERVED_ROOM_SETTING_KEYS) {
        if (room.settings?.[key] !== undefined) nextSettings[key] = room.settings[key]
    }
    room.settings = nextSettings
    room.accessType = accessType

    // AC-04: 방장을 포함한 전원의 준비를 해제한다. 실제로 준비가 바뀐 참가자만 revision을
    // 올린다 — 이미 준비하지 않은 참가자에게 "변경됐다"는 사건 번호를 새로 발급하면
    // 준비 효과음이 전원 해제용으로 중복 발생한다.
    for (const player of room.players.values()) {
        if (player.isReady !== true) continue
        player.isReady = false
        player.readyRevision = (Number.isInteger(player.readyRevision) ? player.readyRevision : 0) + 1
    }

    room.settingsVersion = currentVersion + 1
    recordSettingsUpdateResult(resultKey, {
        roomId,
        fingerprint,
        changed: true,
        settingsVersion: room.settingsVersion,
        expiresAt: Date.now() + SETTINGS_UPDATE_RESULT_TTL_MS,
    })

    // 10) 방송 — 이미 커밋된 뒤라 전달 실패가 저장을 되돌리지 않는다.
    emitRoomSettingsUpdated(io, room)
    emitPublicRoomList(io)

    respond({ ok: true, changed: true, roomId, requestId, settingsVersion: room.settingsVersion })
}

/**
 * ACK를 놓친 **원 요청자**가 자기 설정 변경이 반영됐는지 확인합니다. 새 저장을 만들지 않고
 * 기록만 읽으며, 기록이 없으면 성공/실패를 추측하지 않고 UNKNOWN을 돌려줍니다(A-07).
 *
 * 기록은 (계정·방·requestId)에 묶여 있어 다른 계정은 같은 requestId로도 조회할 수 없다.
 * 조회 성공 자체가 현재 방 소속 권한을 주지도 않는다 — room은 지금 이 계정이 실제로 그 방의
 * 확정 참가자일 때만 덧붙는다.
 */
function handleGetRoomSettingsUpdateResult(uuid, payload, callback, socket, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            console.error('[설정 변경 결과 조회 ack 실패]', ackErr)
        }
    }

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    const { roomId, requestId } = payload
    // 저장 요청과 **같은 술어**로 검사한다. 조회만 느슨하면(길이 상한 없음·공백만 허용)
    // 저장이 만들 수 없는 키를 묻는 요청이 정상 응답(UNKNOWN)을 받고, 임의 길이 문자열이
    // 조회 경로로 그대로 흘러든다. 통과한 값은 보정 없이 그대로 키가 된다.
    if (!isRoomSettingsIdentifier(roomId) || !isRoomSettingsIdentifier(requestId)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }

    // 저장 경로와 같은 현재 소켓 검사를 적용한다 — 교체된 옛 소켓은 결과도 읽지 못한다.
    if (socket && (socket.data?.user?.uuid !== uuid || socket.connected === false)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, message: '연결이 만료되었습니다.' })
        return
    }
    if (socket && typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, message: '연결이 만료되었습니다.' })
        return
    }

    pruneSettingsUpdateResults()
    const recorded = roomSettingsUpdateResults.get(settingsUpdateResultKey(uuid, roomId, requestId))

    // 현재 방 상태는 결과 기록과 **별개로** 검증한다. 기록이 있다는 사실이 지금도 그 방의
    // 참가자라는 뜻은 아니다(그 사이 이탈·시작·삭제가 있을 수 있다).
    const currentRoomId = playerRoom.get(uuid)
    const currentRoom = currentRoomId ? gameRooms.get(currentRoomId) : null
    const isConfirmedMember = !getAdmissionAttempt(uuid)
        && currentRoomId === roomId
        && !!currentRoom
        && currentRoom.players.has(uuid)

    if (!recorded) {
        // 기록 만료·삭제·서버 재시작 뒤다. 자동으로 새 requestId를 만들어 재저장하지 않는다.
        respond({
            ok: true,
            status: 'UNKNOWN',
            roomId,
            requestId,
            room: isConfirmedMember ? buildRoomPayload(currentRoom) : null,
        })
        return
    }

    respond({
        ok: true,
        status: recorded.changed ? 'APPLIED' : 'NO_CHANGE',
        changed: recorded.changed,
        settingsVersion: recorded.settingsVersion,
        roomId,
        requestId,
        room: isConfirmedMember ? buildRoomPayload(currentRoom) : null,
    })
}

/**
 * 방장의 게임 시작 요청을 검증하고, 전부 통과하면 GameSession으로 전환합니다(Socket.IO
 * acknowledgement 방식). 전환 절차는 prepare → delivery target preflight → payload 사전 생성
 * → commit → notify → ack의 6단계로 나뉜다:
 *   1) prepare: game-core에 역할 배정을 포함한 세션 후보를 요청한다(아직 어떤 상태도 안 바뀜).
 *   2) delivery target preflight: 참가자 전원이 connected===true이고 이 Room의 Socket.IO
 *      channel(roomId)에 실제로 join되어 있는 소켓을 최소 1개 가진지 확인한다. 하나라도
 *      없으면 commit 전에 전체를 거부해 stranded 참가자(Room에서는 빠졌는데 game_started를
 *      못 받는 상태)를 만들지 않는다.
 *   3) payload 사전 생성: 참가자별 개인화된 game_started payload를 commit 전에 전부 만들어
 *      둔다 — 이 단계가 실패해도 아직 상태 불변이다.
 *   4) commit: game-core registry에 세션을 커밋하고 Room을 정리한다. preflight 완료 후
 *      여기까지 어떤 await도 없어(Node 이벤트 루프상 disconnect 등 다른 콜백이 끼어들 수
 *      없음) 서버 메모리 상태 전환은 원자적이다 — 다만 이후 실제 네트워크 전달까지 원자적으로
 *      보장한다는 뜻은 아니다. commit 시작 이후의 예외는 상태가 부분 반영됐을 수 있다는
 *      뜻이므로 "실패 ack + Room 유지"를 주장하지 않는다.
 *   5) notify: 이미 만들어진 payload를 preflight에서 확보한 소켓에 개별 전달한다(공용
 *      방송 없음 — 참가자별 payload가 다르므로).
 *   6) ack: 요청한 host에게만 성공 여부를 응답한다.
 * callback은 어떤 경로로도 정확히 한 번만 호출된다.
 *
 * F-20(AC-04): payload의 roomId·expectedSettingsVersion은 **필수**다. "방장이 어느 방의 어느
 * 설정을 보고 시작을 눌렀는가"를 서버가 알아야, 저장 직전에 발행됐다가 늦게 도착한 시작
 * 요청이 새 설정으로 한 판을 열어버리는 일을 막을 수 있다. 서버가 현재 값으로 채워 주지
 * 않는다 — 채우면 이 필드는 언제나 일치해 검사 자체가 무의미해진다.
 *
 * @param {{roomId:string, expectedSettingsVersion:number}} payload
 * @param {(response:{ok:boolean,code?:string,gameId?:string,message?:string})=>void} callback
 */
async function handleStartGame(io, socket, uuid, payload, callback, getCurrentSocketId) {
    // 응답을 받을 수 없는 요청은 다른 검사보다 먼저 확인한다 — 어떤 상태도 바꾸지 않는다.
    if (typeof callback !== 'function') return

    /**
     * F-20(AC-04): 이 소켓이 지금도 이 계정의 현재(canonical) 연결인가.
     *
     * socket.connected만으로는 부족하다 — 같은 계정의 새 로그인이 canonical 소켓을 교체해도
     * 옛 소켓은 한동안 connected===true로 남을 수 있고, 그 연결이 비동기 선행 작업 뒤에
     * 깨어나 한 판을 커밋하면 이미 다른 연결이 소유한 계정의 게임이 시작된다.
     * 접근자를 주지 않은 호출부(기존 테스트·다른 경로)에서는 판정하지 않는다.
     */
    const isCanonicalSocket = () =>
        typeof getCurrentSocketId !== 'function' || getCurrentSocketId(uuid) === socket?.id
    if (!isCanonicalSocket()) {
        callback({
            ok: false,
            code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET,
            message: '연결이 만료되었습니다. 다시 시도해주세요.',
        })
        return
    }

    // 형태 검증은 상태를 보기 전에 끝낸다(handleSetReady와 같은 순서·같은 이유).
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    const { roomId: expectedRoomId, expectedSettingsVersion } = payload
    if (typeof expectedRoomId !== 'string' || expectedRoomId.length === 0) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isSafeInteger(expectedSettingsVersion) || expectedSettingsVersion < 1) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    if (!room) {
        callback({ ok: false, code: 'ROOM_NOT_FOUND', message: '참여 중인 방을 찾을 수 없습니다.' })
        return
    }
    // 요청자가 보고 있던 방과 지금의 소속이 다르면 이 시작 요청은 지난 화면의 것이다.
    if (expectedRoomId !== roomId) {
        callback({ ok: false, code: 'ROOM_NOT_FOUND', message: '참여 중인 방을 찾을 수 없습니다.' })
        return
    }
    if (room.hostUuid !== uuid) {
        callback({ ok: false, code: 'NOT_HOST', message: '방장만 게임을 시작할 수 있습니다.' })
        return
    }
    // 비동기 선행 작업(외형 조회)에 들어가기 **전**에 한 번, 복귀한 **뒤**에 다시 한 번
    // 대조한다. 여기서 먼저 걸러야 이미 지난 설정을 근거로 한 요청이 조회 비용조차 쓰지 않는다.
    if (expectedSettingsVersion !== getSettingsVersion(room)) {
        callback({
            ok: false,
            code: 'ROOM_STATE_CHANGED',
            roomId,
            settingsVersion: getSettingsVersion(room),
            message: '방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요.',
        })
        return
    }

    const players = [...room.players.values()]
    const configuredMinimum = getMinPlayers()
    const roomCapacity = room.settings?.maxPlayers ?? configuredMinimum
    const requiredPlayers = Math.min(configuredMinimum, roomCapacity)
    const jokerCount = room.settings?.jokerCount ?? 0

    // 인원 조건(정원을 고려한 최소 인원 + 비-광대 최소 1명)을 준비 여부보다 먼저 검사한다
    // — 인원 자체가 부족한데 "누가 준비 안 됐는지"부터 알려주는 건 사용자에게 혼란스럽다.
    if (players.length < requiredPlayers || players.length <= jokerCount) {
        callback({
            ok: false,
            code: 'MIN_PLAYERS_NOT_MET',
            message: '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.',
        })
        return
    }
    // 방 생성 시점의 역할 구성 검증은 정원(maxPlayers) 기준이다. 실제로는 정원보다 적은
    // 인원으로 시작할 수 있으므로, 시작 시점에 "지금 이 인원"으로 구성이 성립하는지 다시
    // 확인한다(CUSTOM: 고정 역할 합 ≤ 실제 인원, JOKER < 실제 인원). 실패해도 이 시점까지
    // gameRooms/playerRoom/game-core registry는 전부 불변이다 — 방은 그대로 유지되고
    // 방장은 인원을 더 모으거나(설정은 생성 후 수정 불가) 방을 다시 만들면 된다.
    if (!resolveRoleComposition(room.settings, players.length).ok) {
        callback({
            ok: false,
            code: 'INVALID_ROLE_COMPOSITION',
            message: '설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요.',
        })
        return
    }
    if (!players.every((player) => player.isReady === true)) {
        callback({
            ok: false,
            code: 'PLAYERS_NOT_READY',
            message: '아직 준비하지 않은 참가자가 있습니다.',
        })
        return
    }
    // F-19(AC-06): 확정되지 않은 초대 입장이 있으면 시작하지 않는다. 이 시점까지 어떤
    // 상태도 바뀌지 않았다 — 방장은 입장이 끝난 뒤 다시 시작하면 된다.
    if (hasPendingAdmissionForRoom(roomId)) {
        callback({
            ok: false,
            code: 'ADMISSION_IN_PROGRESS',
            message: '입장 처리 중인 참가자가 있습니다. 잠시 후 다시 시도해주세요.',
        })
        return
    }

    // 0) 계정 외형 스냅샷(F-13 AC-05) — 시작 직전 참가자들의 서버 loadout을 다시 확보해
    // 공개 room과 분리한 세션 후보에 반영한다(계정 프로필은 참가 시점이 아니라
    // 시작 시점 값이어야 한다). 조회는 비동기라 그 사이 방 상태가 바뀔 수 있으므로,
    // captureRoomStartProfiles가 위에서 이미 통과시킨 조건(방장·인원 구성·준비 상태)을
    // 다시 확인한다 — 깨졌으면 room.players를 건드리지 않고 그대로 실패로 응답한다.
    // F-20(AC-04): "이 시작 요청이 근거로 삼은 설정"의 버전은 요청자가 보낸 값 그 자체다
    // (여기서 다시 읽은 값이 아니다 — 다시 읽으면 요청과 이 지점 사이의 변경을 놓친다).
    // 위 동기 구간에서 이미 현재 버전과 일치함을 확인했고, 복귀 후 이 값으로 재검사한다.
    const settingsVersionAtRequest = expectedSettingsVersion
    // F-20(AC-04): 참가자 **신원**을 uuid가 아니라 그 순간의 참가자 객체로 캡처한다.
    // 누군가 나갔다가 같은 방에 다시 들어와 다시 준비하면 uuid 집합·인원·준비 상태가 전부
    // 복구되지만, 그 사람의 소속은 이 요청이 검사한 그 소속이 아니다.
    const playersAtCapture = new Map(players.map((player) => [player.uuid, player]))
    let captured
    try {
        captured = await captureRoomStartProfiles(room, uuid, playersAtCapture, settingsVersionAtRequest)
    } catch (err) {
        console.error('[게임 시작 계정 외형 조회 에러]', err)
        callback({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }
    if (!captured.ok) {
        callback({ ok: false, code: captured.code, message: '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.' })
        return
    }
    // F-20(AC-04): 외형 조회 사이에 방이 삭제·시작되거나 요청자의 소속·연결이 바뀌었을 수
    // 있다. captureRoomStartProfiles는 캡처해 둔 room 객체만 보므로, 그 객체가 아직 이
    // registry의 현재 방인지와 요청자의 현재 소속·연결을 여기서 함께 대조한다 — 늦게 깨어난
    // 옛 요청이 사라진 방이나 새 방을 시작시키지 못하게 하는 마지막 관문이다.
    if (gameRooms.get(roomId) !== room || playerRoom.get(uuid) !== roomId || socket?.connected === false) {
        callback({ ok: false, code: 'ROOM_STATE_CHANGED', message: '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.' })
        return
    }
    // 조회를 기다리는 동안 이 계정의 canonical 소켓이 교체됐을 수 있다. 옛 소켓이 아직
    // 연결돼 있어도(위 connected 검사를 통과해도) 그 연결은 더 이상 이 계정의 현재 연결이
    // 아니므로 커밋시키지 않는다 — 여기서 끝내도 아직 어떤 상태도 바뀌지 않았다.
    if (!isCanonicalSocket()) {
        callback({
            ok: false,
            code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET,
            message: '연결이 만료되었습니다. 다시 시도해주세요.',
        })
        return
    }
    // 설정 버전 재검사(비동기 선행 작업 **이후**). captureRoomStartProfiles가 캡처한 room
    // 객체로 이미 같은 판정을 하지만, 그 함수가 어떤 이유로 통과시켜도 이 경계에서 registry의
    // 현재 방을 기준으로 한 번 더 확인한다 — 커밋 직전의 마지막 관문은 여기다.
    if (expectedSettingsVersion !== getSettingsVersion(room)) {
        callback({
            ok: false,
            code: 'ROOM_STATE_CHANGED',
            roomId,
            settingsVersion: getSettingsVersion(room),
            message: '방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요.',
        })
        return
    }
    // F-20(AC-04): 방장·참가자 신원·소속·**전원 준비**의 최종 재검사.
    //
    // captureRoomStartProfiles의 내부 검사는 그 함수가 반환하기 전의 사실이고, 여기(바깥
    // await의 재개)는 **그 다음 마이크로태스크**다. 그 사이에 실행된 준비 취소는 내부 검사를
    // 지나간 뒤에 일어나므로, captured.room에 복사된 isReady=true는 이미 과거의 값이다.
    // 그래서 복사본이 아니라 registry의 살아 있는 참가자 객체로 다시 판정한다.
    // 이 지점부터 커밋까지는 await가 없어, 여기서 통과한 조건이 그대로 커밋된다.
    if (!isStartRequestStillValid(room, uuid, playersAtCapture, expectedSettingsVersion)) {
        callback({ ok: false, code: 'ROOM_STATE_CHANGED', message: '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.' })
        return
    }
    // 프로필 캡처(await) 동안 초대 수락이 예약에 진입했을 수 있다 — commit 직전에 다시 본다.
    // 여기서 거부해도 아직 어떤 상태도 바뀌지 않았다.
    if (hasPendingAdmissionForRoom(roomId)) {
        callback({
            ok: false,
            code: 'ADMISSION_IN_PROGRESS',
            message: '입장 처리 중인 참가자가 있습니다. 잠시 후 다시 시도해주세요.',
        })
        return
    }

    // callback이 정확히 한 번만 호출되도록 보호한다. ack 자체가 던지는 예외는 로그만 남긴다
    // (handleCreateRoomAfterReservation의 기존 ack try/catch 관례와 동일).
    let callbackCalled = false
    const respond = (payload) => {
        if (callbackCalled) return
        callbackCalled = true
        try {
            callback(payload)
        } catch (ackErr) {
            console.error('[게임 시작 ack 실패]', ackErr)
        }
    }

    // 1) prepare
    let prepared
    try {
        prepared = gameSession.prepareGameSession(captured.room)
    } catch (err) {
        console.error('[GameSession prepare 에러]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }
    if (!prepared.ok) {
        // DUPLICATE_ROOM_SESSION / PLAYER_ALREADY_IN_SESSION / INVALID_SESSION_INPUT — 이 시점까지
        // gameRooms/playerRoom/game-core registry/공개 목록/game_started 전부 불변이다.
        respond({ ok: false, code: prepared.code, message: '게임을 시작할 수 없습니다.' })
        return
    }

    // 2) delivery target preflight — 아직 commit 전이므로 실패해도 모든 상태 불변.
    let uuidToSockets
    try {
        uuidToSockets = resolveParticipantSockets(io, prepared.session.players.keys(), roomId)
    } catch (err) {
        console.error('[게임 시작 소켓 조회 에러]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }
    const missingUuid = [...prepared.session.players.keys()].find((u) => !uuidToSockets.get(u)?.length)
    if (missingUuid) {
        respond({ ok: false, code: 'PARTICIPANT_UNAVAILABLE', message: '일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.' })
        return
    }

    // 3) payload 사전 생성 — commit 전에 전부 만들어 둔다. 이 단계도 실패하면 상태 불변.
    let payloadsByUuid
    try {
        payloadsByUuid = new Map()
        for (const u of prepared.session.players.keys()) {
            payloadsByUuid.set(u, gameSession.buildGameStartedPayload(prepared.session, u))
        }
    } catch (err) {
        console.error('[game_started payload 생성 에러]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }

    // 4) commit — preflight 완료 시점부터 여기까지 어떤 await도 없다. commit 시작 이후의
    // 예외는 이미 상태가 부분 반영됐을 수 있다는 뜻이므로 "실패 ack + Room 유지"를
    // 주장하지 않는다.
    try {
        gameSession.commitGameSession(prepared.session)
        room.players.forEach((_, u) => playerRoom.delete(u))
        gameRooms.delete(roomId)
        // 방이 게임으로 전환됐으므로 이 방을 향한 미확정 시도·PENDING 초대를 끝낸다.
        invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_STARTED')
        // 방이 게임으로 전환됐으므로 이후 설정 저장은 거부된다 — 그 방의 결과 기록도 함께 끝난다.
        forgetSettingsUpdateResultsForRoom(roomId)
        cancelInvitesForRoomAsync(roomId, 'ROOM_STARTED')
        // 방을 지우기 전에 알고 있던 코드/roomId만 표식으로 남긴다 — 뒤늦게 이 방에
        // 들어오려는 요청에 "없는 방"이 아니라 "이미 시작됨"으로 답하기 위한 근거다.
        // 이 표식은 참가를 허용하지 않는다(살아있는 방을 못 찾았을 때만 읽힌다).
        rememberStartedRoom(room)
    } catch (err) {
        console.error('[GameSession commit 에러 — 상태가 부분 반영됐을 수 있음]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임 시작 처리 중 오류가 발생했습니다.' })
        return
    }

    // GameSession 종료(disconnect) ABA 방지용 결합: 이 세션의 canonical gameId를 참가자
    // Socket에 심어 둔다(backend/socket/gameSession.js의 onDisconnect가 읽음). 알림 전달
    // 성공 여부와 무관하게 항상 수행한다 — Socket 신원 자체는 전달 실패와 관계없는
    // 사실이기 때문이다. 명시적 이탈이 이 세션을 끝내도 이 결합은 지워지지 않고 그대로
    // 남아, 같은 Socket이 이후 새 세션을 시작할 때만 새 gameId로 덮어써진다.
    for (const sockets of uuidToSockets.values()) {
        for (const s of sockets) {
            s.data.activeGameId = prepared.session.id
        }
    }

    // 5) notify — 이미 만들어진 payload를 preflight에서 확보한 소켓에 전달만 한다(재스캔하지
    // 않음 — 재스캔하면 그 사이 상태가 또 바뀔 수 있어 preflight의 의미가 없어진다). 동일
    // uuid의 복수 소켓(연결 전환 중 짧은 구간) 전부에게 같은 payload를 보낸다 — 같은
    // 사용자의 다른 탭에 자기 역할이 중복 전달되는 것은 유출이 아니며, 오래된 소켓만
    // 골랐다가 실제 활성 탭이 못 받는 것보다 안전하다. 정상 흐름에서는 force_disconnect
    // 정책(handleConnection)으로 uuid당 소켓이 하나뿐이다.
    prepared.session.players.forEach((_, u) => {
        const payload = payloadsByUuid.get(u)
        for (const s of uuidToSockets.get(u) ?? []) {
            try {
                s.emit('game_started', payload)
            } catch (err) {
                console.error('[game_started 전달 실패]', err)
            }
        }
    })
    emitPublicRoomList(io)

    // 6) ack
    respond({ ok: true, gameId: prepared.session.id })
}

// delivery target: 인증 uuid가 일치하고, connected===true이고, Room의 기존 Socket.IO
// channel(roomId)에 실제로 join되어 있는(socket.rooms.has(roomId)) 소켓만 인정한다.
// Socket.IO 의존이라 game-core가 아니라 이 파일(소켓 계층)에 둔다.
//
// ── F-23(AC-04): 채널 가입만으로는 수신 자격이 되지 못한다 ────────────────────
//
// 위 세 조건은 "그 채널에 물리적으로 들어와 있는가"만 묻는다. 그런데 채널 가입은 **확정
// 소속보다 먼저** 일어나고(초대 수락·코드 참가 모두 join → 재검사 → 커밋 순서다), 떼지
// 못한 옛 구독도 한동안 남는다. 그 두 구간이 곧 "참가자가 아닌 연결이 방 상태를 구독하는"
// 자리라 두 축을 더 묻는다:
//
//   · **확정 소속** — playerRoom과 room.players가 모두 그 방을 가리켜야 한다. 아직 durable
//     영수증이 없는 미확정 입장(phase='published')과 깨진 매핑이 여기서 걸러진다.
//   · **전달 제외** — 커밋 전 입장·떼지 못한 옛 구독이 자기 토큰으로 걸어 둔 제외.
//   · **canonical 소켓** — 단, registry가 주입된 환경에서만 묻는다. 주입되지 않았다는 것은
//     "그 축을 알 수 없다"는 뜻이지 "자격 없음"이 아니다 — 여기서 fail-closed하면 같은 계정의
//     정상 소켓이 서로를 배제해 **아무도** 시작·설정 사건을 받지 못한다(A-03의 반증 조건).
//     같은 계정의 다른 탭은 참가자 본인이므로 이 축이 없을 때의 복수 전달은 유출이 아니다.
//
// alive·활성 세션 유무는 묻지 않는다 — 이 경계는 **대기방** 전달용이고, 세션 커밋 **전**의
// 정상 start_game 수신자를 "아직 게임이 없다"는 이유로 거부하면 시작 자체가 전달되지 않는다.
function resolveParticipantSockets(io, uuids, roomId) {
    const targets = new Set(uuids)
    const map = new Map()
    for (const s of io.sockets.sockets.values()) {
        const u = s.data?.user?.uuid
        if (!u || !targets.has(u)) continue
        if (s.connected !== true) continue
        if (!s.rooms?.has(roomId)) continue
        if (!isAccountSeatedInRoom(u, roomId)) continue
        if (typeof s.id === 'string'
            && channelMembership.isSocketExcludedFromChannel(roomId, s.id)) continue
        if (onlineUsersRegistry instanceof Map
            && !isCanonicalSocketForAccount(io, u, s, roomId)) continue
        if (!map.has(u)) map.set(u, [])
        map.get(u).push(s)
    }
    return map
}

/**
 * F-21(공통 커밋·통지 경계): 대기방 이탈의 **상태 변경만** 수행하는 동기 구간이다.
 *
 * 예전에는 Map 삭제와 socket.leave·emit이 한 함수에 섞여 있어, 통지 하나가 던지면 이미
 * 끝난 제거까지 실패처럼 보였다(호출자는 어디까지 반영됐는지 알 수 없다). 이 함수는 어떤
 * 소켓도 건드리지 않고 어떤 방송도 하지 않으며, await도 두지 않는다 — 여기를 지나면 서버
 * 상태는 확정이고, 전달 실패는 관측 가능한 오류로만 남는다.
 *
 * @returns {{removed:boolean, roomId?:string, room?:object, removedPlayer?:object,
 *            roomDeleted?:boolean, hostChanged?:boolean}}
 */
function commitRoomDeparture(io, socket, uuid, reason) {
    // 실제 제거가 일어나는 유일한 지점이므로, 유예 중인 예약은 여기서 항상 정리한다
    // (명시적 leave_room·방 삭제·세션 종료 정리로 먼저 빠지는 경우도 모두 여기를 지난다).
    cancelRoomRetention(uuid)

    // F-19(AC-06): 자기 미확정 시도도 playerRoom 유무와 무관하게 조기 return **이전에**
    // 무효화한다(예약 단계에서는 아직 playerRoom이 없다).
    const ownAttempt = invalidateAdmissionAttempt(uuid, reason)
    if (ownAttempt) {
        removePublishedAdmission(io, socket, ownAttempt)
        compensateInvalidatedAttempt(ownAttempt, reason)
    }

    const roomId = playerRoom.get(uuid)
    if (!roomId) return { removed: false }

    const room = gameRooms.get(roomId)
    if (!room) return { removed: false }

    const removedPlayer = room.players.get(uuid)
    room.players.delete(uuid)
    playerRoom.delete(uuid)

    if (room.players.size === 0) {
        gameRooms.delete(roomId)
        // 방이 사라졌으므로 이 방을 향한 미확정 시도와 PENDING 초대를 모두 끝낸다.
        //
        // F-21(A-08): 추방 영수증은 여기서 지우지 않는다. 설정 변경 기록과 달리 추방 결과는
        // "그 방이 아직 있는가"와 무관하게 원 요청자가 확인할 수 있어야 한다 — 마지막 참가자를
        // 추방해 방이 사라진 경우가 바로 재조회가 가장 필요한 상황이다.
        invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_GONE')
        forgetSettingsUpdateResultsForRoom(roomId)
        cancelInvitesForRoomAsync(roomId, 'ROOM_GONE')
        return { removed: true, uuid, roomId, room, removedPlayer, roomDeleted: true, hostChanged: false }
    }

    let hostChanged = false
    if (room.hostUuid === uuid) {
        // 방장이 바뀌어도 남은 참가자들의 isReady는 손대지 않는다 — 방장 권한 이전과
        // 준비 상태는 서로 독립적인 개념이라, 새 방장도 이전에 준비했던 상태 그대로 유지된다.
        room.hostUuid = room.players.keys().next().value
        hostChanged = true
    }
    return { removed: true, uuid, roomId, room, removedPlayer, roomDeleted: false, hostChanged }
}

/**
 * F-21(공통 커밋·통지 경계): 제거된 소켓을 방송 채널에서 뗀다.
 *
 * 실제 구현은 socket/channelMembership.js가 소유한다 — 진행 중 세션(socket/gameSession.js)과
 * **같은** 계약이어야 하고, 비동기 완료 후 재검사·제한된 재시도·전달 제외처럼 틀리기 쉬운
 * 부분이 두 벌로 갈라지면 한쪽만 고쳐진다. 이 파일은 "무엇이 소유권인가"만 정한다.
 */
function detachSocketFromChannel(socket, channelId, logLabel, ownership = null) {
    channelMembership.detachSocketFromChannel(socket, channelId, logLabel, { channelId }, ownership)
}

/**
 * F-21(AC-05/AC-06): 그 소켓이 **지금** 이 계정의 canonical 연결인가.
 *
 * 계정이 그 방에 앉아 있다는 사실만으로는 "떠나는 이 소켓이 아직 그 소속의 주인"임을 말하지
 * 못한다 — 같은 계정의 새 로그인이 소켓을 교체한 뒤 같은 방에 다시 앉으면 계정 단위 검사는
 * 전부 통과하고, 그 결과 **옛 소켓**의 채널 가입이 되돌려진다(유령 청취자가 된다).
 *
 * onlineUsers registry가 주입돼 있으면 그것이 유일한 근거다. 주입 전(순수 단위 시험 등)에는
 * 같은 계정의 다른 살아 있는 소켓이 그 방을 이미 소유했는지로 대신 판정한다.
 */
function isCanonicalSocketForAccount(io, uuid, socket, roomId) {
    if (!socket) return false
    const canonicalId = onlineUsersRegistry?.get?.(uuid)
    if (typeof canonicalId === 'string') return canonicalId === socket.id
    return !isRoomOwnedByAnotherSocket(io, roomId, uuid, socket)
}

/**
 * F-21(AC-05/AC-06): 그 계정이 **지금** 그 방의 확정 참가자인가.
 *
 * 옛 입장 시도·옛 이탈의 늦은 정리가 "같은 계정"이라는 이유로 새 소속의 채널을 떼거나 그
 * 연결을 끊지 못하게 하는 공통 술어다. 제거는 이미 끝난 뒤이므로, 여기서 참가자 항목이
 * 보인다는 것은 그 사이 **새로 앉았다**는 뜻이다(재입장은 항상 새 membershipId를 받는다).
 */
function isAccountSeatedInRoom(uuid, roomId) {
    if (playerRoom.get(uuid) !== roomId) return false
    return gameRooms.get(roomId)?.players.has(uuid) === true
}

/**
 * F-21(AC-05/AC-06): 그 계정이 지금 **어느** 방의 확정 참가자이기는 한가.
 *
 * 옛 채널 정리의 늦은 실패로 연결을 끊어도 되는지 판정할 때 쓴다(socket/gameSession.js도 같은
 * 이유로 이 값을 묻는다) — 추방된 대상이 로비로 돌아가 다른 방에 들어간 뒤 옛 거부가 도착하면,
 * 끊는 순간 그 새 소속이 방송을 받지 못한다.
 */
function hasRoomMembership(uuid) {
    const roomId = playerRoom.get(uuid)
    return typeof roomId === 'string' ? isAccountSeatedInRoom(uuid, roomId) : false
}

/** 그 계정이 지금 배제되지 않은 활성 세션에 속해 있는가(rejectIfInActiveGame과 같은 판정). */
function hasLiveGameMembership(uuid) {
    const routing = gameSession.getActiveSessionRoutingInfo(uuid)
    return !!routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)
}

/**
 * F-21(공통 커밋·통지 경계): 커밋이 끝난 뒤의 채널 정리와 방송이다.
 *
 * 통지마다 예외를 격리한다 — 하나가 던져도 나머지 통지가 멈추지 않아야, 서버가 확정한 상태와
 * 클라이언트가 보는 상태의 어긋남이 한 곳에 몰리지 않는다. 어떤 실패도 커밋 결과를 되돌리지
 * 않는다.
 *
 * @param {object[]} [departingSockets] - 방 채널에서 내보낼 소켓들(추방은 대상의 소켓이라
 *   요청자의 socket과 다르다). 채널 이탈에 실패한 연결은 제거된 뒤에도 방송을 계속 받으므로
 *   그 연결을 끊어 정리한다 — 재접속은 서버의 소속 검사가 다시 막는다.
 */
function notifyRoomDeparture(io, outcome, departingSockets = []) {
    if (!outcome.removed) return
    const { roomId, room, roomDeleted, hostChanged } = outcome

    for (const departing of departingSockets) {
        detachSocketFromChannel(
            departing, roomId, '[대기방 채널 이탈 실패]',
            // 이탈 정리가 늦게 끝나는 사이 같은 계정이 그 방에 **새 소속으로** 다시 앉았다면
            // 그 채널은 더 이상 이 이탈의 잔여물이 아니다. 다른 방·새 판으로 옮겨 갔더라도
            // 그 연결을 끊지는 않는다.
            //
            // 계정 소속만으로는 부족하다 — 그 새 소속을 만든 것이 **이 소켓**이라는 증거가
            // 있어야 한다. 새 로그인이 canonical 소켓을 가져갔다면 이 옛 소켓의 가입을
            // 되돌리는 것은 유령 청취자를 만드는 일이다.
            {
                ownsChannel: () =>
                    isAccountSeatedInRoom(outcome.uuid, roomId)
                    && isCanonicalSocketForAccount(io, outcome.uuid, departing, roomId),
                keepsConnection: () =>
                    hasRoomMembership(outcome.uuid) || hasLiveGameMembership(outcome.uuid),
            },
        )
    }

    if (roomDeleted) {
        try { emitPublicRoomList(io) } catch (err) { console.error('[공개 방 목록 갱신 실패]', err) }
        return
    }

    if (hostChanged) {
        try {
            channelMembership.emitToChannel(io, roomId, 'host_changed', {
                hostUuid: room.hostUuid,
                canStart: computeCanStart(room),
                roomId,
                // F-21(AC-02/AC-05): 잔류자 사건도 **어느 방 인스턴스의 어느 기동**에서 난
                // 것인지 함께 싣는다. roomId만으로는 같은 식별자로 다시 만들어진 방에서
                // 늦게 도착한 옛 사건을 구별할 수 없다. 기존 settingsVersion은 그대로 둔다
                // (F-20 설정 사건 호환).
                roomInstanceId: room.instanceId ?? null,
                bootEpoch: BOOT_EPOCH,
                settingsVersion: getSettingsVersion(room),
            })
        } catch (err) {
            console.error('[방장 변경 방송 실패]', err)
        }
    }

    try {
        channelMembership.emitToChannel(io, roomId, 'player_left_room', {
            uuid: outcome.uuid,
            // F-21(AC-02/AC-05): 어느 **소속**이 빠졌는지 함께 싣는다. uuid만 보내면 같은
            // 계정이 곧바로 다시 들어온 경우 잔류자 화면이 새 참가자를 지워 버린다.
            membershipId: outcome.removedPlayer?.membershipId ?? null,
            roomId,
            roomInstanceId: room.instanceId ?? null,
            bootEpoch: BOOT_EPOCH,
            canStart: computeCanStart(room),
        })
    } catch (err) {
        console.error('[참가자 이탈 방송 실패]', err)
    }

    try { emitPublicRoomList(io) } catch (err) { console.error('[공개 방 목록 갱신 실패]', err) }
}

function removeFromRoom(io, socket, uuid) {
    const outcome = commitRoomDeparture(io, socket, uuid, 'LEFT_ROOM')
    notifyRoomDeparture(io, outcome, socket ? [socket] : [])
}

/**
 * F-21(AC-01/AC-02/AC-04/AC-05): 방장의 **대기방** 추방 요청.
 *
 * 신원은 인증 경계가 넘겨준 uuid 하나뿐이다 — payload의 requesterMembershipId는 "방장이
 * 어느 소속으로 보고 눌렀는가"를 확인하는 근거일 뿐 권한의 원천이 아니다. 검사 순서에는
 * 이유가 있다:
 *
 *   형태 → canonical 소켓 → **영수증** → boot → 본인 → 입장 확정 → 방/방장/소속 → 대상 →
 *   용량 → 커밋 → 영수증 확정 → 통지
 *
 * 영수증을 권한 검사 **뒤**, 현재 상태 검사 **앞**에 두는 것이 핵심이다. 역사적 결과는 지금
 * 방장인지·방이 아직 있는지와 무관하게 같은 답이어야 하고(A-08), 동시에 끊기거나 교체된
 * 소켓이 그 답을 읽어서는 안 된다(설정 변경 결과 조회와 같은 이유).
 *
 * 용량 확인은 **상태를 바꾸기 직전**에 온다 — 자리가 없는데 소속을 먼저 제거하면 실제로는
 * 추방됐는데 결과를 영영 알 수 없는 요청이 생긴다.
 */
function handleKickRoomPlayer(io, socket, uuid, payload, callback, getCurrentSocketId) {
    // 응답을 받을 수 없는 요청은 어떤 상태도 바꾸지 않는다 — 다른 검사보다 먼저 확인한다.
    if (typeof callback !== 'function') return

    const CODES = kickReceiptStore.KICK_ERROR_CODES
    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            // 이미 커밋한 결과를 ACK 실패로 되돌리거나 실패로 다시 기록하지 않는다.
            console.error('[추방 ack 실패]', ackErr)
        }
    }
    const reject = (code, message, extra = {}) => respond({ ok: false, code, message, ...extra })

    const validated = kickReceiptStore.validateKickPayload(payload, kickReceiptStore.KICK_COMMANDS.ROOM)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const input = validated.value
    const fingerprint = kickReceiptStore.fingerprintKickRequest(kickReceiptStore.KICK_COMMANDS.ROOM, input)

    if (socket?.data?.user?.uuid !== uuid || socket?.connected === false) {
        reject(CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }
    if (typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        reject(CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }

    const receiptKey = kickReceiptStore.kickReceiptKey(input.bootEpoch, uuid, input.requestId)
    const recorded = kickReceiptStore.lookupKickReceipt(receiptKey)
    if (recorded) {
        if (recorded.fingerprint !== fingerprint) {
            reject(CODES.REQUEST_ID_REUSED, '이미 사용한 요청 식별자입니다.')
            return
        }
        // 같은 입력의 재전달은 **재방송하지 않는다**. 역사적 결과만 돌려준다.
        respond({ ...recorded.result, replayed: true })
        return
    }

    // 옛 boot의 명령은 새 상태에 실행하지 않는다. 위 영수증 조회보다 뒤에 두는 이유는, 옛
    // boot의 기록은 애초에 이 프로세스에 없어 여기까지 오면 언제나 실행 거부이기 때문이다.
    if (input.bootEpoch !== BOOT_EPOCH) {
        reject(CODES.STALE_BOOT, '서버가 재시작되었습니다. 방 정보를 다시 불러와주세요.')
        return
    }
    // ── 여기부터의 거부는 **결정**이다 ───────────────────────────────────────────
    //
    // 형태·연결·boot 실패와 달리 아래 검사들은 "이 요청은 실행되지 않는다"를 서버가 확정한
    // 것이다. 기록하지 않으면 같은 requestId의 재전달이 **그때의 현재 상태**로 다시 판정된다 —
    // NOT_HOST로 거부된 요청이 방장 승계 뒤에 그대로 실행되는 것이 그 결과다(AC-04). 영수증의
    // 계약은 "현재 방장 여부·방 존속을 이유로 과거 결과를 바꾸지 않는다"이고, 그것은 성공만이
    // 아니라 거부에도 똑같이 적용된다.
    //
    // 기록할 자리가 없으면 **결정하지 않는다.** 보존되지 않는 확정 거부를 돌려주면 그 답은
    // 즉시 거짓이 된다 — 같은 requestId가 방장 승계 뒤에 다시 판정돼 실행될 수 있고, 10분
    // 안의 재조회도 UNKNOWN이다. 그 경우에는 명시적으로 **미결정**인 용량 결과를 돌려준다
    // (결정된 결과를 다른 코드로 바꾸는 것이 아니라, 아직 결정하지 않았다고 답하는 것이다).
    // 거부 기록에는 더 낮은 수위를 쓴다: 무효한 요청을 연달아 보내 표를 채워 **실제 추방**을
    // 막을 수 없게 한다. 유효 기록은 어떤 경우에도 축출하지 않는다.
    const decideReject = (code, message) => {
        if (!kickReceiptStore.hasKickRejectionCapacity()) {
            reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
            return
        }
        kickReceiptStore.recordKickReceipt(receiptKey, {
            command: kickReceiptStore.KICK_COMMANDS.ROOM,
            fingerprint,
            result: { ok: false, code, message },
        })
        reject(code, message)
    }

    if (input.targetUuid === uuid) {
        decideReject(CODES.SELF_KICK, '자신을 추방할 수 없습니다.')
        return
    }
    if (getAdmissionAttempt(uuid)) {
        decideReject(CODES.ADMISSION_PENDING, '입장 처리가 아직 끝나지 않았습니다.')
        return
    }
    // 시작 커밋이 먼저 끝난 방의 옛 대기방 추방은 게임 추방으로 해석하지 않는다(AC-05).
    if (rejectIfInActiveGame(uuid, ({ message }) => decideReject(CODES.ALREADY_IN_GAME, message))) return

    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) {
        decideReject(CODES.NOT_IN_ROOM, '참여 중인 방이 없습니다.')
        return
    }
    if (currentRoomId !== input.roomId) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    const room = gameRooms.get(input.roomId)
    if (!room) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    // 같은 문자열 roomId로 다시 만들어진 방의 옛 명령을 여기서 끝낸다(A-04).
    if ((room.instanceId ?? room.id) !== input.roomInstanceId) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    const requester = room.players.get(uuid)
    if (!requester) {
        decideReject(CODES.NOT_IN_ROOM, '참여 중인 방이 없습니다.')
        return
    }
    if (requester.membershipId !== input.requesterMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '방 정보가 변경되었습니다. 다시 불러와주세요.')
        return
    }
    if (room.hostUuid !== uuid) {
        decideReject(CODES.NOT_HOST, '방장만 추방할 수 있습니다.')
        return
    }

    const target = room.players.get(input.targetUuid)
    if (!target || playerRoom.get(input.targetUuid) !== room.id) {
        // 신규 kick은 일반 leave와 달리 멱등 성공으로 답하지 않는다 — "이미 없는 대상"을
        // 성공으로 답하면 방장이 자기 명령이 실제로 누군가를 내보냈다고 믿게 된다(AC-04).
        decideReject(CODES.ALREADY_LEFT, '이미 방에서 나간 참가자입니다.')
        return
    }
    if (target.membershipId !== input.targetMembershipId) {
        // 확인하는 사이 대상이 나갔다가 다시 들어왔다. 새 소속을 옛 확인으로 추방하지 않는다.
        decideReject(CODES.STALE_MEMBERSHIP, '대상이 변경되었습니다. 다시 확인해주세요.')
        return
    }
    if (getAdmissionAttempt(input.targetUuid)) {
        decideReject(CODES.ADMISSION_PENDING, '상대의 입장 처리가 아직 끝나지 않았습니다.')
        return
    }

    if (!kickReceiptStore.hasKickReceiptCapacity()) {
        reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
        return
    }

    // ── 커밋 — 여기부터 영수증 확정까지 await·외부 callback·emit이 없다 ──────────
    //
    // 개인 사건에 실을 값은 **제거 전에** 캡처한다. 제거한 뒤에 room에서 읽으면 이미 사라진
    // 참가자의 소속 식별자를 다시 만들 수 없다.
    const kickedEvent = {
        roomId: room.id,
        roomInstanceId: room.instanceId ?? room.id,
        bootEpoch: BOOT_EPOCH,
        targetUuid: input.targetUuid,
        targetMembershipId: target.membershipId,
        hostUuid: uuid,
        requestId: input.requestId,
    }
    const targetSockets = resolveParticipantSockets(io, [input.targetUuid], room.id).get(input.targetUuid) ?? []
    const outcome = commitRoomDeparture(io, null, input.targetUuid, 'KICKED_FROM_ROOM')
    const result = {
        ok: true,
        status: 'KICKED',
        roomId: input.roomId,
        requestId: input.requestId,
        targetUuid: input.targetUuid,
        targetMembershipId: input.targetMembershipId,
    }
    kickReceiptStore.recordKickReceipt(receiptKey, {
        command: kickReceiptStore.KICK_COMMANDS.ROOM,
        fingerprint,
        result,
    })

    // ── 통지 — 각각 독립적으로 시도한다. 하나의 throw가 나머지를 멈추지 않는다 ────
    respond(result)
    for (const targetSocket of targetSockets) {
        try {
            targetSocket.emit(kickReceiptStore.KICK_EVENTS.ROOM_KICKED, kickedEvent)
        } catch (err) {
            console.error('[추방 개인 통지 실패]', { code: 'KICK_NOTIFY_ERROR', roomId: room.id })
        }
    }
    notifyRoomDeparture(io, outcome, targetSockets)
}

/**
 * GameSession 종료 core(backend/game-core/gameSession.js의 endGameSessionForPlayer)가 성공한
 * 직후, 참가자 전원의 현재 matchmaking 소유 상태(gameRooms/playerRoom/matchmakingQueue)를
 * 정리한다. 게임 시작 시 기존 Room 매핑은 이미 삭제되므로(handleStartGame 4단계 commit),
 * 여기서 정리되는 Room은 세션이 진행되는 동안 참가자가 새로 만들거나 들어간 Room뿐이다
 * (rejectIfInActiveGame 게이트가 활성 세션 참가자의 create_room·코드/공개방 join·queue
 * 진입을 막으므로 이제 그런 Room은 유예 만료로 배제된 참가자의 것뿐이다 — 게이트가
 * forfeited를 활성 소속으로 보지 않기 때문이다. 정리 자체는 그대로 남겨둔다: 게이트가
 * 판정 시점 이후에 시작된 세션까지 막아주지는 않는다. 아래
 * onDisconnect의 ABA 가드와 달리 이 함수는 "지금 이 순간의" playerRoom을 그대로 신뢰한다.
 * 호출자가 종료 core 호출과 동일한 동기 구간에서 반드시 호출해야 하므로, 이 함수가
 * 실행되는 동안 다른 요청이 끼어들어 gameRooms/playerRoom을 바꿀 수 없기 때문이다).
 * pendingRoomTransitions는 건드리지 않는다 — 세션 종료와 무관한 진행 중인 요청이다.
 *
 * 참가자 여러 명이 우연히 같은 Room에 있을 수 있는 경우(드묾)에도 host 이전이 한 번만
 * 정확히 일어나도록, 먼저 참가자 전원을 registry(room.players/playerRoom)에서 전부 제거한
 * 뒤에야 Room별로 leave·host 이전·emit을 수행한다 — 그렇지 않으면 곧 함께 제거될 다른
 * 세션 참가자에게 host가 잠깐 넘어갔다가 다시 넘어가는 잘못된 중간 상태가 방송될 수 있다.
 *
 * 참가자 한 명의 Socket leave 실패나 Room 하나의 host 이전/emit 실패가 다른 참가자·Room·
 * registry 정리를 막지 않도록 각각 독립된 try/catch로 격리한다.
 */
function cleanupRoomStateForSessionParticipants(io, uuids) {
    // 참가자 전원의 방 전환 세대를 먼저 증가시킨다 — 지금 playerRoom에 없는(아직 커밋되지
    // 않고 사용자 조회/socket.join을 기다리는 중인) 참가자도 포함해, 이 종료 정리와 같은
    // 동기 구간 이전에 시작된 create_room/코드·공개방 참가/join_matchmaking 요청이 나중에
    // 재개돼도 커밋되지 않도록 무효화한다.
    for (const uuid of uuids) {
        bumpRoomTransitionGeneration(uuid)
        // F-19(AC-06): 세대 증가와 **같은 동기 구간에서** 미확정 입장 시도까지 무효화한다.
        // playerRoom이 없어도(아직 예약 단계) 반드시 지운다 — SQL 보상이나 room mutex를
        // 기다리지 않는다.
        const attempt = invalidateAdmissionAttempt(uuid, 'SESSION_ENDED')
        if (attempt) {
            removePublishedAdmission(io, null, attempt)
            compensateInvalidatedAttempt(attempt, 'SESSION_ENDED')
        }
    }

    const affected = []
    for (const uuid of uuids) {
        matchmakingQueue.delete(uuid)

        const roomId = playerRoom.get(uuid)
        if (!roomId) continue
        const room = gameRooms.get(roomId)
        if (!room || !room.players.has(uuid)) {
            playerRoom.delete(uuid)
            continue
        }

        const ownedSockets = []
        for (const s of io.sockets.sockets.values()) {
            if (s.data?.user?.uuid !== uuid) continue
            if (!s.rooms?.has(roomId)) continue
            ownedSockets.push(s)
        }

        affected.push({ uuid, roomId, room, ownedSockets })
    }

    // 참가자 전원을 registry에서 먼저 전부 제거한다(아래 Room별 host 이전보다 앞서야 함).
    for (const entry of affected) {
        entry.room.players.delete(entry.uuid)
        playerRoom.delete(entry.uuid)
    }

    for (const entry of affected) {
        for (const s of entry.ownedSockets) {
            try {
                s.leave(entry.roomId)
            } catch (err) {
                console.error('[세션 종료 Room 소켓 정리 실패]', err)
            }
        }
    }

    const removedUuidsByRoomId = new Map()
    for (const entry of affected) {
        if (!removedUuidsByRoomId.has(entry.roomId)) removedUuidsByRoomId.set(entry.roomId, [])
        removedUuidsByRoomId.get(entry.roomId).push(entry.uuid)
    }

    const processedRoomIds = new Set()
    for (const entry of affected) {
        if (processedRoomIds.has(entry.roomId)) continue
        processedRoomIds.add(entry.roomId)

        const room = entry.room
        try {
            if (room.players.size === 0) {
                gameRooms.delete(entry.roomId)
                forgetSettingsUpdateResultsForRoom(entry.roomId)
                emitPublicRoomList(io)
                continue
            }
            if (!room.players.has(room.hostUuid)) {
                room.hostUuid = room.players.keys().next().value
                channelMembership.emitToChannel(io, entry.roomId, 'host_changed', {
                    hostUuid: room.hostUuid,
                    canStart: computeCanStart(room),
                    roomId: entry.roomId,
                    roomInstanceId: room.instanceId ?? null,
                    bootEpoch: BOOT_EPOCH,
                    settingsVersion: getSettingsVersion(room),
                })
            }
        } catch (err) {
            console.error('[세션 종료 Room 정리 실패]', err)
        }

        // 같은 Room에서 세션 참가자가 여럿 제거됐을 수 있으므로(드묾), 제거된 UUID
        // 전원에 대해 개별적으로 player_left_room을 방송한다 — 한 참가자의 emit
        // 실패가 나머지 참가자의 알림을 막지 않도록 각각 독립된 try/catch로 격리한다.
        for (const removedUuid of removedUuidsByRoomId.get(entry.roomId) ?? []) {
            try {
                channelMembership.emitToChannel(io, entry.roomId, 'player_left_room', {
                    uuid: removedUuid,
                    canStart: computeCanStart(room),
                    roomId: entry.roomId,
                    roomInstanceId: room.instanceId ?? null,
                    bootEpoch: BOOT_EPOCH,
                })
            } catch (err) {
                console.error('[세션 종료 Room 정리 실패]', err)
            }
        }

        emitPublicRoomList(io)
    }
}

// ── F-19 AC-06: 초대 수락 → 실제 입장 ────────────────────────────────────────

/**
 * gameInvite.service에 canonical registry 접근자를 주입한다.
 *
 * 새 registry를 만들지 않는다 — 서비스는 여기 있는 gameRooms/playerRoom을 읽기 전용으로만
 * 본다. 이 방향(matchmaking → service)만 있으므로 require 순환이 없다.
 */
gameInviteModule.__setRoomAccessForRuntime({
    bootEpoch: BOOT_EPOCH,

    getRoomIdForUser: (uuid) => playerRoom.get(uuid) ?? null,

    describeRoomForInvite: (roomId) => {
        const room = gameRooms.get(roomId)
        if (!room) return null
        const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        return {
            roomId: room.id,
            // 구버전 랜덤 매칭 방에는 instanceId가 없을 수 있다 — 그때는 방 id를 인스턴스로
            // 쓴다(같은 프로세스 안에서 room id는 재사용되지 않는다).
            roomInstanceId: room.instanceId ?? room.id,
            hostUuid: room.hostUuid,
            occupancy: countRoomOccupancy(room),
            maxPlayers,
            isFull: countRoomOccupancy(room) >= maxPlayers,
        }
    },

    /** 수신자가 지금 초대를 받을 수 있는 상태인가. 이유 코드는 발송자에게 노출하지 않는다. */
    describeReceiverAvailability: (uuid) => {
        const routing = gameSession.getActiveSessionRoutingInfo(uuid)
        if (routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)) {
            return { available: false, code: 'RECEIVER_IN_GAME' }
        }
        if (playerRoom.has(uuid)) return { available: false, code: 'RECEIVER_IN_ROOM' }
        if (matchmakingQueue.has(uuid)) return { available: false, code: 'RECEIVER_IN_QUEUE' }
        if (pendingRoomTransitions.has(uuid)) return { available: false, code: 'RECEIVER_TRANSITIONING' }
        if (getAdmissionAttempt(uuid)) return { available: false, code: 'RECEIVER_TRANSITIONING' }
        return { available: true, code: null }
    },
})

/**
 * 애플리케이션 응답 대기 상한을 건다.
 *
 * 이 시간은 **우리 코드가 기다리는 시간**의 상한이지, 원격 SQL 잠금이 그 안에 풀린다는
 * 보장이 아니다. timeout이 나면 소유권을 동기 회수하고, 늦게 끝난 SQL은 이후 역사적 결과
 * 조회(get_game_invite_result)로만 다룬다.
 */
function withAdmissionTimeout(promise, ms, code) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error(code), { admissionTimeout: code })), ms)
        if (typeof timer.unref === 'function') timer.unref()
        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (error) => { clearTimeout(timer); reject(error) },
        )
    })
}

/**
 * 초대 수락 → 실제 대기방 입장.
 *
 * 두 트랜잭션으로 나뉜다(A-10):
 *   1) recordAcceptDecision  — 역사적 수락 결정을 선형화한다. 아직 어떤 Map에도 없다.
 *   2) finalizeAcceptedEntry — 같은 잠금을 다시 잡고, 그 안의 **동기 구간**에서 두 Map과
 *      메모리 영수증을 함께 기록한 뒤 durable 영수증(PUBLISHED)을 쓴다.
 *
 * 성공 ACK는 확정 영수증과 현재 소속이 **둘 다** 맞을 때만 room payload를 담는다.
 * room_joined는 발행하지 않는다 — 초대 입장의 navigation 소유자는 클라이언트의 한 경계
 * (App 전역 useFriendSocketEvents)뿐이다.
 */
async function handleAcceptGameInvite(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    let answered = false
    const respond = (result) => {
        if (answered) return
        answered = true
        try { callback(result) } catch (ackError) { console.error('[초대 수락 ack 실패]', ackError) }
    }

    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        respond({ ok: false, code: 'INVALID_REQUEST', message: '잘못된 요청입니다.' })
        return
    }

    // 진입 동기 검사 — 여기서 걸리면 예약도 만들지 않는다.
    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) => respond({ ok: false, code, message, gameId }))) return
    if (playerRoom.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, message: '이미 참여 중인 방이 있습니다.' })
        return
    }
    if (matchmakingQueue.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE, message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return
    }
    if (getAdmissionAttempt(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }

    const generationAtRequest = getRoomTransitionGeneration(uuid)
    const attemptId = nextAttemptId()
    const startedAt = Date.now()
    const remaining = () => Math.max(0, ADMISSION_TOTAL_TIMEOUT_MS - (Date.now() - startedAt))
    const step = (promise, code) => withAdmissionTimeout(
        promise, Math.min(ADMISSION_STEP_TIMEOUT_MS, remaining() || 1), code,
    )

    let attempt = null
    let joinedRoomId = null
    /**
     * F-23(AC-04): **채널 가입부터 durable 확정까지**의 전달 제외를 소유하는 토큰.
     *
     * 이 흐름은 socket.join을 publish·영수증보다 **먼저** 한다. 그 구간의 입장자는 아직 확정
     * 참가자가 아니므로 그 방의 방송을 받으면 안 되는데, 예전에는 아무 제외도 없어 join 완료
     * 직후부터 설정 변경·준비·시작 같은 사건이 그대로 전달됐다.
     *
     * 토큰을 쓰는 이유는 같은 (채널, 소켓)에 대해 **다른** 흐름(옛 이탈 정리)이 자기 제외를
     * 들고 있을 수 있기 때문이다 — 그쪽이 먼저 끝나도 이 확정 전 제외는 남아야 한다.
     */
    const admissionExclusionOwner = channelMembership.createChannelExclusionOwner('admission')
    let admissionExclusionChannelId = null
    const releaseAdmissionExclusion = () => {
        if (admissionExclusionChannelId === null) return
        channelMembership.releaseChannelExclusion(
            admissionExclusionChannelId, socket.id, admissionExclusionOwner,
        )
        admissionExclusionChannelId = null
    }

    try {
        // 초대가 가리키는 방을 먼저 확인한다. 이 읽기는 **식별용**이고 권한 근거가 아니다 —
        // 권한은 아래 두 트랜잭션의 잠금 안에서만 판정한다.
        const peek = await step(
            gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId }), 'PEEK_TIMEOUT',
        )
        if (!peek.known) {
            respond({ ok: false, code: 'INVITE_NOT_FOUND', message: '초대를 찾을 수 없습니다.' })
            return
        }
        if (peek.bootEpoch !== BOOT_EPOCH) {
            respond({ ok: false, code: 'SERVER_RESTARTED', message: '초대가 더 이상 유효하지 않습니다.' })
            return
        }

        // ── 예약(동기 구간) — 여기서 자리를 잡는다 ────────────────────────────
        const room = gameRooms.get(peek.roomId)
        if (!room || (room.instanceId ?? room.id) !== peek.roomInstanceId) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, message: '방을 찾을 수 없습니다.' })
            return
        }
        const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        if (countRoomOccupancy(room, uuid) >= maxPlayers) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_FULL, message: '방이 가득 찼습니다.' })
            return
        }
        attempt = {
            attemptId,
            accountUuid: uuid,
            inviteId,
            roomId: room.id,
            room,
            roomInstanceId: room.instanceId ?? room.id,
            bootEpoch: BOOT_EPOCH,
            generation: generationAtRequest,
            socketId: socket.id,
            phase: 'reserved',
            expiresAt: startedAt + ADMISSION_TOTAL_TIMEOUT_MS,
        }
        roomAdmissionAttempts.set(uuid, attempt)

        // ── 1) 역사적 수락 결정 ───────────────────────────────────────────────
        //
        // 제한 시간이 지나도 이 트랜잭션 자체는 계속 살아 있을 수 있다(원격 잠금 대기).
        // 늦게 끝난 결정을 정직하게 정착시키려면 그 완료를 놓치지 않아야 하므로 시도에
        // 매달아 둔다 — compensateInvalidatedAttempt가 이것을 기다렸다가 보상한다(review5 #2).
        attempt.decisionPromise = Promise.resolve(
            gameInviteService.recordAcceptDecision({ receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH }),
        ).then(
            (value) => { attempt.decisionSettled = true; return value },
            (error) => { attempt.decisionSettled = true; throw error },
        )
        // 이 시도가 timeout으로 끝나면 아래 await는 사라지므로, 거부가 처리되지 않은 채
        // 남지 않도록 별도 소비자를 붙여 둔다(보상 경로가 실제 판단을 한다).
        attempt.decisionPromise.catch(() => {})
        await step(attempt.decisionPromise, 'DECISION_TIMEOUT')
        if (getAdmissionAttempt(uuid) !== attempt) {
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        // 참가자 payload에 필요한 계정 외형은 join 이전에 확보한다(동기 publish 안에서는
        // 어떤 await도 할 수 없기 때문).
        const [user, accountProfile] = await step(Promise.all([
            userRepositoryRef.findByUuid(uuid),
            loadRoomParticipantProfile(uuid),
        ]), 'PROFILE_TIMEOUT')
        if (!user) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }
        if (getAdmissionAttempt(uuid) !== attempt || !socket.connected) {
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        // ── 확정 commit 이후에만 실제 방송 채널에 가입한다 ────────────────────
        //
        // socket.join은 어댑터에 따라 비동기다. 제한 시간 안에 끝나지 않으면 이 시도는
        // 실패로 끝나지만 **가입 자체는 나중에 성공할 수 있다** — 그대로 두면 두 Map에는
        // 없는데 실제 방송 room에는 남아 다른 참가자의 사건을 계속 받는다. 늦은 완료에
        // 정리를 걸어 두되, 그 시점에 소유권을 다시 확인해 더 새로운 정상 소속은 건드리지
        // 않는다.
        // 가입을 **시작하기 전에** 전달에서 뺀다. join 완료 → publish 전 → publish 후 영수증
        // 대기까지 이 제외가 유지되므로, durable 확정 이전에는 어떤 방송도 이 소켓에 닿지 않는다.
        admissionExclusionChannelId = room.id
        channelMembership.excludeSocketFromChannel(room.id, socket.id, admissionExclusionOwner)
        const joinPromise = Promise.resolve(socket.join(room.id))
        try {
            await step(joinPromise, 'JOIN_TIMEOUT')
            joinedRoomId = room.id
        } catch (joinError) {
            scheduleLateJoinCleanup(io, socket, room.id, uuid, attempt, joinPromise)
            throw joinError
        }

        const player = { uuid, nickname: user.nickname, isReady: false, ...accountProfile }

        // ── 2) finalization — 아래 publish는 **동기**여야 한다 ────────────────
        const publish = () => {
            if (getAdmissionAttempt(uuid) !== attempt) return { ok: false, code: 'INTERRUPTED' }
            if (getRoomTransitionGeneration(uuid) !== generationAtRequest) return { ok: false, code: 'SESSION_ENDED' }
            if (!socket.connected || attempt.socketId !== socket.id) return { ok: false, code: 'DISCONNECTED' }
            if (socket.rooms && !socket.rooms.has(room.id)) return { ok: false, code: 'CHANNEL_LOST' }
            const current = gameRooms.get(attempt.roomId)
            if (current !== room || (current.instanceId ?? current.id) !== attempt.roomInstanceId) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND }
            }
            if (playerRoom.has(uuid)) return { ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM }
            const routing = gameSession.getActiveSessionRoutingInfo(uuid)
            if (routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME }
            }
            if (countRoomOccupancy(current, uuid) >= (current.settings?.maxPlayers ?? getSupportedRoomSizes()[0])) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_FULL }
            }
            // await 없는 한 구간에서 두 Map과 메모리 영수증을 함께 기록한다.
            //
            // F-21(AC-06): 소속 식별자는 이 최종 동기 publish에서 발급한다 — 위에서 player
            // 객체를 만들 때 미리 발급하면 publish에 실패한 시도의 식별자가 남는다. attempt에
            // 함께 보관해, 늦은 실패·채널 정리가 "내가 넣은 그 소속"만 되돌릴 수 있게 한다.
            player.membershipId = kickReceiptStore.nextMembershipId()
            attempt.publicationMembershipId = player.membershipId
            current.players.set(uuid, player)
            playerRoom.set(uuid, current.id)
            attempt.phase = 'published'
            // 이 미확정 소속의 주인이 누구인지 함께 남긴다 — 늦게 깨어난 옛 시도가 남의
            // 소속을 되돌리지 못하게 하는 유일한 근거다(review5 #1).
            publishedAdmissions.set(uuid, attempt)
            socket.data.activeRoomId = current.id
            return { ok: true }
        }
        const unpublish = () => removePublishedAdmission(io, socket, attempt)

        const finalized = await withAdmissionTimeout(
            gameInviteService.finalizeAcceptedEntry({
                receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH, publish, unpublish,
            }),
            Math.max(1, remaining()),
            'RECEIPT_TIMEOUT',
        )

        if (!finalized.ok) {
            // publish까지 갔다면 unpublish가 이미 두 Map을 되돌렸다.
            if (attempt.phase === 'published') removePublishedAdmission(io, socket, attempt)
            roomAdmissionAttempts.delete(uuid)
            if (joinedRoomId) {
                // F-21(AC-05/AC-06): removePublishedAdmission은 publication 소유권을 보고
                // 채널을 뗐는데, 이 정리는 그 판단을 건너뛰고 무조건 나갔다 — 옛 시도가 실패로
                // 끝나는 사이 같은 계정·같은 소켓이 그 방에 **정상 입장**했다면 방금 성립한
                // 소속의 방송 경로를 이 정리가 끊는다. 같은 술어로 소유권을 먼저 묻는다.
                if (!isAccountSeatedInRoom(uuid, joinedRoomId)) {
                    // F-23(AC-04): raw leave 대신 공통 경계를 쓴다 — 비동기 거부까지 조정하고,
                    // 끝내 떼지 못하면 **자기 토큰으로** 전달에서 뺀 채 끝낸다(fail-closed).
                    detachSocketFromChannel(socket, joinedRoomId, '[초대 입장 정리 실패]', { uuid }, {
                        ownsChannel: () =>
                            isAccountSeatedInRoom(uuid, joinedRoomId)
                            && isCanonicalSocketForAccount(io, uuid, socket, joinedRoomId),
                        keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                    })
                }
                joinedRoomId = null
            }
            respond({
                ok: false,
                code: finalized.code,
                unknown: finalized.unknown === true,
                message: finalized.unknown === true
                    ? '입장 결과를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.'
                    : '방에 입장하지 못했습니다.',
            })
            return
        }

        // 영수증이 durable해졌다 — 이제부터 정상 소속이다. 더 이상 "미확정 publication"이
        // 아니므로 소유자 등록부에서도 물러난다.
        roomAdmissionAttempts.delete(uuid)
        releasePublishedAdmission(attempt)
        const current = gameRooms.get(attempt.roomId)
        const seated = room.players.get(uuid)
        // F-21(AC-06): 소속 식별자까지 대조한다. 방 참조·계정→방 매핑·참가자 존재는 **같은
        // 계정이 그 사이 다시 들어온 경우에도 전부 통과한다** — 이 시도의 publication이 이미
        // 제거된 뒤 같은 방에 정상 재입장했다면, 여기서 성공을 주장하는 것은 옛 초대가 만든
        // 결과라고 거짓말하는 것이고 방송하는 player도 이미 사라진 소속이다.
        if (current !== room || playerRoom.get(uuid) !== room.id || !seated
            || (attempt.publicationMembershipId !== undefined
                && seated.membershipId !== attempt.publicationMembershipId)) {
            // 확정 영수증은 있지만 현재 소속이 없다 — 성공으로 주장하지 않는다(A-10).
            respond({ ok: false, code: 'UNKNOWN', unknown: true, message: '입장 결과를 확인하지 못했습니다.' })
            return
        }

        // 여기서부터만 확정 참가자다 — 이제 전달 제외를 푼다. 아래 player_joined_room부터
        // 정상 수신이 시작되고, 그 이전의 어떤 방송도 이 소켓에 닿지 않았다.
        releaseAdmissionExclusion()

        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...seated }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
        emitPublicRoomList(io)
        respond({ ok: true, room: buildRoomPayload(room), inviteId, attemptId })
    } catch (error) {
        const timedOut = typeof error?.admissionTimeout === 'string'
        if (!timedOut) console.error('[초대 수락 처리 실패]', error)

        // 등록부에 그대로 있으면 내 것이다. 이미 사라졌더라도 **명시적으로 무효화된 것이
        // 아니라면**(기한 경과로 토큰만 버려진 경우) 아무도 보상하지 않으므로 여기서
        // 책임진다 — 그래야 늦게 커밋된 결정이 UNCONFIRMED로 굳지 않는다(review5 #2).
        const registered = roomAdmissionAttempts.get(uuid) === attempt
        const own = registered || (attempt && !attempt.invalidated) ? attempt : null
        if (own) {
            if (registered) roomAdmissionAttempts.delete(uuid)
            if (own.phase === 'published') removePublishedAdmission(io, socket, own)
            compensateInvalidatedAttempt(own, timedOut ? error.admissionTimeout : 'ACCEPT_FAILED')
        }
        if (joinedRoomId) {
            // 위 실패 경로와 같은 이유다 — 늦게 도착한 옛 시도의 실패 정리가 새 소속의 채널을
            // 떼지 못하게 소유권을 먼저 묻는다.
            if (!isAccountSeatedInRoom(uuid, joinedRoomId)) {
                // F-23(AC-04): 위 실패 경로와 같은 이유로 공통 경계를 쓴다(비동기 거부 조정 +
                // 떼지 못하면 자기 토큰으로 전달 제외).
                detachSocketFromChannel(socket, joinedRoomId, '[초대 입장 정리 실패]', { uuid }, {
                    ownsChannel: () =>
                        isAccountSeatedInRoom(uuid, joinedRoomId)
                        && isCanonicalSocketForAccount(io, uuid, socket, joinedRoomId),
                    keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                })
            }
            joinedRoomId = null
        }
        respond({
            ok: false,
            code: timedOut ? 'UNKNOWN' : (error?.code ?? 'INTERNAL_ERROR'),
            unknown: timedOut,
            message: error?.status && error?.message ? error.message : '방에 입장하지 못했습니다.',
        })
    } finally {
        releaseRoomTransition(uuid, transitionToken)
        // 성공/실패 어느 경로로 끝나든 자기 시도는 남기지 않는다.
        if (attempt && roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
        /**
         * F-23(AC-04): 이 시도의 **확정 전 제외**는 여기서 끝난다.
         *
         * 위 실패 경로들이 이미 채널 정리를 마쳤고, 그 정리가 끝내 실패한 경우의 fail-closed는
         * detachSocketFromChannel이 **자기 토큰으로** 따로 들고 있다. 그러므로 이 토큰을 남길
         * 이유가 없고, 남기면 같은 계정·같은 소켓의 다음 정상 입장이 그 방의 방송을 영영 받지
         * 못한다(폐기된 옛 토큰의 영구 잔류).
         */
        releaseAdmissionExclusion()
    }
}

/**
 * 같은 시도의 결과를 다시 묻는다(ACK 유실 재조회).
 *
 * durable 영수증(PUBLISHED)과 **현재 canonical membership**이 함께 맞을 때만 성공이다.
 * 과거 PUBLISHED만 보고 옛 방으로 이동시키지 않는다(A-10).
 */
async function handleGetGameInviteResult(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    const attemptId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.attemptId : undefined
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        callback({ ok: false, code: 'INVALID_REQUEST' })
        return
    }

    // 아직 진행 중인 시도가 있으면 결과를 단정하지 않는다.
    if (getAdmissionAttempt(uuid)) {
        callback({ ok: true, pending: true, entered: false })
        return
    }

    const outcome = await gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId, attemptId })
    if (!outcome.known) {
        callback({ ok: false, code: 'INVITE_NOT_FOUND' })
        return
    }
    if (outcome.staleAttempt) {
        callback({ ok: true, entered: false, invite: outcome.invite, staleAttempt: true })
        return
    }

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    const entered = outcome.entryOutcome === 'PUBLISHED'
        && outcome.bootEpoch === BOOT_EPOCH
        && room !== null && room !== undefined
        && room.id === outcome.roomId
        && (room.instanceId ?? room.id) === outcome.roomInstanceId
        && room.players.has(uuid)

    callback({
        ok: true,
        entered,
        invite: outcome.invite,
        room: entered ? buildRoomPayload(room) : null,
    })
}

/** 테스트 전용: 모듈 내부 상태를 초기화합니다. 런타임 코드에서는 호출하지 마세요. */
function __resetStateForTests() {
    matchmakingQueue.clear()
    gameRooms.clear()
    playerRoom.clear()
    pendingRoomTransitions.clear()
    // F-19(AC-06): 미확정 입장 시도도 함께 비운다 — 남으면 다음 테스트의 인원·ready·start
    // 판정이 이전 테스트의 예약에 오염된다.
    roomAdmissionAttempts.clear()
    // 미확정 publication의 소유자 등록부도 함께 비운다 — 남으면 다음 테스트의 되돌림
    // 판정이 이전 테스트의 시도를 소유자로 인정하거나 거부한다.
    publishedAdmissions.clear()
    startedRoomMarks.clear()
    // F-20: 설정 변경 결과 기록도 비운다 — 남으면 다음 테스트의 재시도 판정이 이전 테스트의
    // requestId를 "이미 처리한 요청"으로 오인한다.
    roomSettingsUpdateResults.clear()
    // F-21: 추방 영수증도 같은 이유로 비운다 — 남으면 다음 테스트의 같은 requestId가
    // "이미 결정된 요청"으로 재생된다.
    kickReceiptStore.__resetKickReceiptsForTests()
    // F-21(AC-05/AC-06): 채널 전달 제외도 비운다 — 남으면 다음 테스트의 정상 방송이 이전
    // 테스트가 남긴 소켓 id 때문에 제외 경로를 탄다.
    channelMembership.__resetChannelExclusionsForTests()
    // 예약된 타이머를 지우지 않으면 다음 테스트가 도는 도중에 이전 테스트의 제거가 끼어든다.
    for (const pending of pendingRoomRemovals.values()) clearTimeout(pending.timer)
    pendingRoomRemovals.clear()
    roomPresenceConfirmedTick.clear()
    roomPresenceTick = 0
}

/**
 * 테스트 전용: 유예 중인 방 제거 예약을 지금 즉시 만료시킵니다(실제 타이머를 기다리지 않기
 * 위함). 만료 판정 로직은 프로덕션 경로와 완전히 같은 함수를 그대로 실행합니다.
 */
function __flushRoomRetentionForTests() {
    for (const pending of [...pendingRoomRemovals.values()]) {
        clearTimeout(pending.timer)
        pending.run()
    }
}

/** 테스트 전용: 지금 유예 중인 uuid 목록입니다. */
function __getPendingRoomRemovalsForTests() {
    return [...pendingRoomRemovals.entries()].map(([uuid, { roomId }]) => [uuid, roomId])
}

/**
 * 테스트 전용: 내부 Map/Set을 라이브 참조가 아닌 복제된 일반 객체로 반환합니다.
 * 테스트가 실제 상태를 직접 들고 있다가 실수로 변형하는 것을 막기 위함입니다.
 */
function __getStateSnapshotForTests() {
    return {
        matchmakingQueue: [...matchmakingQueue.entries()],
        gameRooms: [...gameRooms.entries()].map(([id, room]) => [
            id,
            {
                ...room,
                players: [...room.players.entries()],
                // F-20: settings는 중첩 객체(roleCounts·roleNightActionTimes)를 품으므로 얕게
                // 복제하면 스냅샷이 라이브 값을 계속 가리킨다 — 그러면 "저장 전후가 같다"는
                // 무변경 단언이 실제로는 같은 참조를 비교하며 항상 통과해 버린다.
                settings: room.settings === undefined || room.settings === null
                    ? room.settings
                    : JSON.parse(JSON.stringify(room.settings)),
            },
        ]),
        playerRoom: [...playerRoom.entries()],
        // F-20: 설정 변경 결과 기록. 라이브 참조를 넘기지 않도록 값만 복제한다.
        roomSettingsUpdateResults: [...roomSettingsUpdateResults.entries()].map(([key, entry]) => [key, {
            roomId: entry.roomId,
            changed: entry.changed,
            settingsVersion: entry.settingsVersion,
        }]),
        // Map으로 바뀌었지만 스냅샷 계약(uuid 배열)은 그대로 유지한다.
        pendingRoomTransitions: [...pendingRoomTransitions.keys()],
        // F-19(AC-06): 미확정 입장 시도. 라이브 참조를 넘기지 않도록 필요한 값만 복제한다.
        roomAdmissionAttempts: [...roomAdmissionAttempts.entries()].map(([uuid, attempt]) => [uuid, {
            attemptId: attempt.attemptId,
            inviteId: attempt.inviteId,
            roomId: attempt.roomId,
            roomInstanceId: attempt.roomInstanceId,
            phase: attempt.phase,
            socketId: attempt.socketId,
        }]),
        bootEpoch: BOOT_EPOCH,
    }
}

/** 테스트 전용: matchmakingQueue에 임의 항목을 심습니다(랜덤 매칭 비활성화로 정상 경로로는 채워지지 않기 때문). */
function __seedMatchmakingQueueForTests(uuid, entry) {
    matchmakingQueue.set(uuid, entry)
}

/** 테스트 전용: gameRooms에 임의 room 객체를 직접 넣습니다(예: settings 없는 구버전 방 재현). */
function __seedRoomForTests(room) {
    gameRooms.set(room.id, room)
}

/** 테스트 전용: playerRoom 역방향 매핑만 임의로 심습니다(깨진 매핑 재현용). */
function __seedPlayerRoomForTests(uuid, roomId) {
    playerRoom.set(uuid, roomId)
}

/** 테스트 전용: 방을 (host 처리 없이) 즉시 제거합니다. "join 대기 중 방 삭제" 재현용. */
function __removeRoomForTests(roomId) {
    const room = gameRooms.get(roomId)
    if (room) {
        room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    }
    gameRooms.delete(roomId)
    // 실제 방 소멸 경로와 같은 협조를 한다 — 그렇지 않으면 시험이 만든 "사라진 방"에
    // 예약이 남아 정원·시작 판정을 오염시킨다.
    invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_GONE')
    forgetSettingsUpdateResultsForRoom(roomId)
}

/** 테스트 전용: 이 프로세스의 boot epoch(초대 유효성 판정 기준)입니다. */
function __getBootEpochForTests() {
    return BOOT_EPOCH
}

/** 테스트 전용: 미확정 입장 시도를 직접 심습니다(정원·ready·start 협조 재현용). */
function __seedAdmissionAttemptForTests(uuid, attempt) {
    const seeded = {
        attemptId: attempt.attemptId ?? nextAttemptId(),
        accountUuid: uuid,
        inviteId: attempt.inviteId ?? null,
        roomId: attempt.roomId,
        room: gameRooms.get(attempt.roomId) ?? null,
        roomInstanceId: attempt.roomInstanceId ?? gameRooms.get(attempt.roomId)?.instanceId ?? attempt.roomId,
        bootEpoch: BOOT_EPOCH,
        generation: getRoomTransitionGeneration(uuid),
        socketId: attempt.socketId ?? null,
        phase: attempt.phase ?? 'reserved',
        expiresAt: Date.now() + ADMISSION_TOTAL_TIMEOUT_MS,
    }
    roomAdmissionAttempts.set(uuid, seeded)
    // 프로덕션에서 phase='published'는 **그 시도가 publication 소유자라는 뜻**이다
    // (handleAcceptGameInvite의 publish가 두 값을 같은 동기 구간에서 함께 세운다). 이 seam이
    // 소유자 등록부를 비워 두면 심은 시도는 어떤 되돌림 경로도 자기 것으로 알아보지 못해,
    // "미확정 소속을 되돌린다"는 실제 계약이 시험에서 아예 실행되지 않는다.
    if (seeded.phase === 'published') publishedAdmissions.set(uuid, seeded)
}

/**
 * 테스트 전용: 이 계정의 시도 기한이 **이미 지난 것으로** 만든다(가상 시계 전진).
 *
 * 실제 5초/15초를 기다리지 않고 기한 경과 판정을 결정적으로 돌기 위한 seam이다
 * (__setAdmissionTimeoutsForTests와 같은 이유). 판정 로직은 프로덕션 그대로다.
 *
 * 이 창은 실제로 존재한다: Date.now()가 기한을 넘는 순간은 정확하지만, withAdmissionTimeout의
 * setTimeout은 이벤트 루프가 밀리면 그보다 늦게 실행된다. 그 사이에 도착한 get_current_room·
 * ready·start·인원 판정이 전부 getAdmissionAttempt를 지난다.
 */
function __expireAdmissionAttemptForTests(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt) attempt.expiresAt = Date.now() - 1
}

module.exports = {
    registerMatchmakingHandlers,
    setOnlineUsersRegistry,
    onDisconnect,
    resyncRoomChannelOnReconnect,
    cleanupRoomStateForSessionParticipants,
    // F-21(AC-05/AC-06): 게임 계층의 채널 정리가 "이 소켓에 아직 살아 있는 소속이 있는가"를
    // 묻는 유일한 경계다(socket/gameSession.js::socketHasLiveMembership).
    hasRoomMembership,
    ROOM_RECONNECT_GRACE_MS,
    __resetStateForTests,
    __flushRoomRetentionForTests,
    __getPendingRoomRemovalsForTests,
    __getStateSnapshotForTests,
    __seedMatchmakingQueueForTests,
    __seedRoomForTests,
    __seedPlayerRoomForTests,
    __removeRoomForTests,
    __getBootEpochForTests,
    __seedAdmissionAttemptForTests,
    __expireAdmissionAttemptForTests,
    __setUserRepositoryForTests,
    __setEconomyServiceForTests,
    __setGameInviteServiceForTests,
    __setAdmissionTimeoutsForTests,
    __setRandomMatchmakingEnabledForTests,
    // ALREADY_IN_GAME 응답을 검증하는 테스트가 문구를 복붙하지 않고 이 원본을 그대로
    // 참조하도록 노출합니다(런타임 코드에서는 참조하지 않습니다).
    ALREADY_IN_GAME_MESSAGE,
    // F-20: 이벤트명·오류 코드는 이 파일이 아니라 검증 모듈이 소유한다. 소켓 계층을 쓰는
    // 호출부·시험이 문자열을 복붙하지 않도록 그대로 다시 내보낸다.
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
    // F-21: 같은 이유로 추방 이벤트·코드도 kickReceiptStore 소유값을 그대로 다시 내보낸다.
    KICK_EVENTS: kickReceiptStore.KICK_EVENTS,
    KICK_ERROR_CODES: kickReceiptStore.KICK_ERROR_CODES,
    // 테스트에서 개별 핸들러를 실제 socket.io 이벤트 배선 없이 직접 호출하기 위한 통로입니다.
    // 런타임 코드(index.js 등)에서는 참조하지 않습니다.
    __testables: {
        handleCreateRoom,
        handleJoinRoomByCode,
        handleGetCurrentRoom,
        handleGetPublicRooms,
        handleJoinPublicRoom,
        handleJoinMatchmaking,
        handleDeleteRoom,
        handleStartGame,
        handleSetReady,
        handleUpdateRoomSettings,
        handleGetRoomSettingsUpdateResult,
        leaveSocketRoomSafely,
        handleAcceptGameInvite,
        handleGetGameInviteResult,
        countRoomOccupancy,
        hasPendingAdmissionForRoom,
        // leave_room 이벤트가 그대로 부르는 실제 이탈 경로다(방 소멸 경계 검증용).
        removeFromRoom,
        // F-21: kick_room_player 이벤트가 그대로 부르는 실제 추방 경로와, 그 커밋/통지 경계.
        handleKickRoomPlayer,
        commitRoomDeparture,
        notifyRoomDeparture,
    },
}
