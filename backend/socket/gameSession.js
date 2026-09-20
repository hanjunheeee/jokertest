const { randomUUID } = require('node:crypto')
const gameSessionCore = require('../game-core/gameSession')
const matchmaking = require('./matchmaking')
const gameResultRepository = require('../repositories/gameResult.repositories')
const voteParticipationRepository = require('../repositories/voteParticipation.repositories')
const achievementService = require('../services/achievementService')
// F-21: 추방 입력 검증·프로세스 기동 식별·영수증의 단일 소유자(matchmaking.js와 공유한다).
const kickReceiptStore = require('./kickReceiptStore')
// F-21(AC-05/AC-06): 채널 이탈·되돌리기·전달 제외의 단일 소유자(socket/matchmaking.js와 공유).
const channelMembership = require('./channelMembership')

// F-11: handleSubmitDayVote가 실제로 호출하는 참조입니다. __setRecordVoteParticipationForTests로만
// 바꿀 수 있고, 런타임 코드 경로는 항상 이 변수를 통해서만 저장소를 호출합니다(직접
// voteParticipationRepository.recordValidDayVoteParticipation을 참조하지 않습니다) — 순수
// 단위 테스트가 실제 DB 없이도 ack 타이밍을 검증할 수 있게 합니다.
let recordVoteParticipationImpl = voteParticipationRepository.recordValidDayVoteParticipation

// F-12: persistTerminalSession(게임 종료)과 handleSubmitDayVote(낮 투표)가 실제로 호출하는
// 참조입니다. __setEvaluateAchievementsForTests로만 바꿀 수 있고, 런타임 코드 경로는 항상
// 이 변수를 통해서만 호출합니다 — recordVoteParticipationImpl과 같은 이유(순수 단위
// 테스트가 실제 DB 없이도 ack/방송 타이밍을 검증할 수 있게 함)입니다.
let evaluateAchievementsImpl = achievementService.evaluateAndGrantForUser

/**
 * userIds 각각에 대해 업적을 재평가·지급합니다. 게임 진행/ack를 절대 막지 않도록 항상
 * fire-and-forget으로 호출됩니다(persistTerminalSession의 "저장은 게임 진행을 막지
 * 않는다"는 기존 규칙과 동일) — 한 계정의 평가 실패가 나머지 계정 평가를 막지 않게 각각
 * 독립적으로 catch합니다.
 */
function evaluateAchievementsForUsers(userIds, gameId) {
    const settled = []
    for (const userId of userIds) {
        if (typeof userId !== 'string' || !userId) continue
        settled.push(
            Promise.resolve(evaluateAchievementsImpl(userId))
                .catch(() => {
                    console.error('[업적 평가 실패]', { code: 'ACHIEVEMENT_EVAL_ERROR', gameId, userId })
                }),
        )
    }
    // F-21(AC-03): 호출부가 "평가가 끝났다"는 시점을 알 수 있어야 경제·업적 캐시 무효화를 그
    // 뒤에 붙일 수 있다. 개별 실패는 위에서 이미 삼켰으므로 이 Promise는 거부되지 않는다 —
    // fire-and-forget 계약(게임 진행을 막지 않는다)은 그대로다.
    return Promise.all(settled)
}

// game-core가 내부 진단용으로만 반환하는 코드다(registry 불일치 등, 정상 경로에서는
// 발생하지 않아야 함). 클라이언트에는 내부 상태를 노출하지 않고 항상 INTERNAL_ERROR로
// 정규화해 응답한다.
const INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT'])

// JOKER 채팅 전용 internal-only 코드. 기존 INTERNAL_ONLY_CODES(모든 handleX가 공유하는
// registry-불일치 코드)와 의미가 섞이지 않도록 별도 상수로 둔다 — INVALID_CLOCK_VALUE는
// 기존 두 핸들러가 반환하지 않는 코드다.
const JOKER_CHAT_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'INVALID_CLOCK_VALUE'])

// submit_game_chat_message(공개 DAY) 전용 internal-only 코드. JOKER 채팅의 3개에
// INVALID_CHAT_CHANNEL을 더한다 — 채널은 서버가 canonical 상태에서만 유도하므로, 알 수 없는
// 채널이 나왔다는 것은 클라이언트 입력이 아니라 서버 내부 상태 손상 신호다. 메시지 ID 생성
// 실패(ID_GENERATION_ERROR/INVALID_MESSAGE_ID)도 같은 이유로 내부 신호다 — 클라이언트 입력이
// 닿지 않는 서버 자체의 ID 생성기 문제이므로 코드를 그대로 노출하지 않는다.
const GAME_CHAT_INTERNAL_ONLY_CODES = new Set([
    'SESSION_NOT_FOUND',
    'NOT_A_PARTICIPANT',
    'INVALID_CLOCK_VALUE',
    'INVALID_CHAT_CHANNEL',
    'ID_GENERATION_ERROR',
    'INVALID_MESSAGE_ID',
])

// commitGameChatMessage 실패 시 클라이언트에 그대로 알려도 되는 코드. commit은 prepare가 방금
// 통과시킨 요청을 canonical 상태에서 처음부터 다시 검증하므로, 정상 경로에서 실패하는 유일한
// 이유는 "그 사이 게임이 끝났다"뿐이다 — UI가 이 상황에는 반응해야 하므로 그대로 전달한다.
// 그 외 모든 commit 실패(세션 동일성·멤버십·채널 라우팅·타임스탬프 재검증 실패)는 경쟁 상태이거나
// prepared 데이터 변조 신호이므로 내부 코드를 노출하지 않고 INTERNAL_ERROR로 정규화한다.
const GAME_CHAT_COMMIT_PUBLIC_CODES = new Set(['GAME_ALREADY_ENDED'])

// 채널 → 수신 이벤트명. 클라이언트가 고른 값이 아니라 game-core가 유도한 채널로만 인덱싱된다.
const CHAT_EVENT_BY_CHANNEL = Object.freeze({
    DAY: 'day_chat_message_received',
    DEAD: 'dead_chat_message_received',
})

// resolve_night 전용 internal-only 코드. 기존 두 상수와 마찬가지로 의미가 다른 내부 코드
// 집합을 공용 INTERNAL_ONLY_CODES와 섞지 않기 위해 별도로 둔다 — TARGET_NOT_A_PARTICIPANT는
// 다른 핸들러가 반환하지 않는 이 이벤트만의 코드다.
const RESOLVE_NIGHT_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TARGET_NOT_A_PARTICIPANT'])

// resolve_day_vote 전용 internal-only 코드. RESOLVE_NIGHT_INTERNAL_ONLY_CODES와 동일한 3개
// registry-불일치 코드를 쓴다(별도 상수로 두는 이유도 동일 — 의미가 다른 내부 코드 집합을
// 공용 INTERNAL_ONLY_CODES와 섞지 않기 위함).
const RESOLVE_DAY_VOTE_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TARGET_NOT_A_PARTICIPANT'])

// cast_tribunal_vote 전용 internal-only 코드. 앞의 세 상수와 동일한 이유로 별도 상수로 둔다 —
// TRIBUNAL_STATE_NOT_FOUND/TRIBUNAL_CONTEXT_MISMATCH/TRIBUNAL_RESOLUTION_MISMATCH는 서버 내부
// 상태 손상(DAY 판정↔session.tribunal 불일치)에서만 발생하고 클라이언트 입력만으로는 도달할 수
// 없다 — 다른 핸들러가 반환하지 않는 이 이벤트만의 코드다.
const CAST_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES = new Set([
    'SESSION_NOT_FOUND',
    'NOT_A_PARTICIPANT',
    'TRIBUNAL_STATE_NOT_FOUND',
    'TRIBUNAL_CONTEXT_MISMATCH',
    'TRIBUNAL_RESOLUTION_MISMATCH',
])

// resolve_tribunal_vote 전용 internal-only 코드. TRIBUNAL_ALREADY_RESOLVED·
// TRIBUNAL_RESOLUTION_MISMATCH·TRIBUNAL_VOTES_INCOMPLETE는 클라이언트가 정상적으로 마주칠 수
// 있는 안정된 공개 코드라 여기서 제외한다(각각 "이미 판정됨", "재검증 실패", "미완료 투표"를
// 그대로 알려줘야 UI가 반응할 수 있다) — SESSION_NOT_FOUND/NOT_A_PARTICIPANT/
// TRIBUNAL_STATE_NOT_FOUND만 서버 내부 상태 손상 신호다.
const RESOLVE_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TRIBUNAL_STATE_NOT_FOUND'])

// uuid → 현재 canonical socket.id를 담는 socket.js의 onlineUsers Map을 그대로 참조한다(복제하지
// 않음). setOnlineUsersRegistry로 모듈 초기화 시 한 번 주입되며, 그 전까지는 null이라
// isCurrentSocketForUuid가 fail-closed로 항상 false를 반환한다. 이 파일은 이 Map을 절대 쓰지
// 않는다(읽기 전용) — 쓰기는 socket.js(연결/해제 처리)의 책임이다.
let onlineUsersRegistry = null

/**
 * F-23(AC-04): registry **주입 세대**.
 *
 * 등록 당시의 연결 소유권(아래)이 어느 registry를 근거로 검증됐는지 구분하는 유일한 값이다.
 * registry가 교체되면(런타임 재초기화·시험 간 주입) 그 이전에 기록된 소유권은 더 이상 어떤
 * 사실도 증명하지 못한다 — 다른 시험 또는 다른 등록부의 기록이 재사용되면, 지금은 존재하지도
 * 않는 연결이 "등록된 소유자"로 통과한다.
 */
let registryGeneration = 0

/**
 * F-23(AC-04): **등록 시점에 검증한** 서버 내부 연결 소유권.
 *
 * 왜 필요한가: 실제 Socket.IO의 `_onclose`는 `disconnecting` → `_cleanup` → **namespace에서
 * 제거** → `connected=false` → `disconnect` 순서다. 그래서 정상적인 새로고침·탭 종료의
 * disconnect는 "namespace에서 조회하면 없는 소켓"으로 도착한다. 활성 요청과 같은 기준
 * (namespace에 있고 그 객체가 바로 나)을 그대로 적용하면 **모든 정상 disconnect가 stale**이 돼
 * 유예도 종료도 일어나지 않는다.
 *
 * 그렇다고 "namespace에 없으면 통과"로 두면 그것이 곧 우회로다. 그래서 제거 **전에** 이미
 * 검증해 둔 사실만 근거로 쓴다 — registerGameHandlers가 연결 시점에 (인증 uuid · socket 객체 ·
 * socket.id · 그때의 registry 참조와 주입 세대 · namespace 등록)을 전부 확인해 기록한다.
 * 클라이언트 payload나 socket.data의 클라이언트 입력은 이 기록의 입력이 아니다.
 *
 * 두 표를 **따로** 둔다: 소켓 객체별 기록(그 객체가 무엇을 등록했는가)과 uuid별 **최신** 기록
 * (그 계정의 현재 소유자는 누구인가). 같은 id의 다른 객체가 등록되면 최신 소유권은 새 객체로
 * 교체되고, 옛 기록은 되살아나지 않는다.
 *
 * 이 증거는 **활성 요청 권한으로 절대 재사용하지 않는다** — 제거된 소켓의 snapshot·행동 요청은
 * 언제나 STALE_SOCKET이다.
 */
const connectionOwnershipBySocket = new WeakMap()
const connectionOwnershipByUuid = new Map()

/** 런타임 진입점(socket.js의 모듈 초기화)에서 onlineUsers registry를 주입한다. */
function setOnlineUsersRegistry(registry) {
    onlineUsersRegistry = registry
    // 세대를 올려 이전 등록부로 검증된 소유권을 전부 무효화한다(위 registryGeneration 참고).
    registryGeneration += 1
    connectionOwnershipByUuid.clear()
}

/**
 * 이 소켓이 속한 namespace의 socket registry(실제 Socket.IO의 `socket.nsp.sockets`).
 *
 * io를 받은 소비처는 그 registry와 대조하고, io 인자가 없는 경계(resyncSessionRouting·요청
 * 핸들러)는 소켓 자신의 namespace를 쓴다. **둘 다 없으면 null**이다 — 그때 "id만 비교"로
 * 물러나면 어느 namespace에도 없는 위조 소켓이 그대로 canonical이 된다.
 */
function namespaceRegistryFor(socket, io = null) {
    const fromIo = io?.sockets?.sockets
    if (fromIo && typeof fromIo.get === 'function') return fromIo
    const fromSocket = socket?.nsp?.sockets
    if (fromSocket && typeof fromSocket.get === 'function') return fromSocket
    return null
}

/**
 * 연결 소유권을 기록한다(registerGameHandlers 전용). 검증에 실패하면 아무것도 기록하지 않는다.
 *
 * @returns {object|null} 기록한 소유권(없으면 null).
 */
function recordConnectionOwnership(io, socket, uuid) {
    if (!socket || typeof socket.id !== 'string' || socket.id.length === 0) return null
    if (typeof uuid !== 'string' || uuid.length === 0) return null
    // 인증된 신원만 근거다 — 클라이언트가 채운 값이 아니라 소켓 인증이 심은 값이다.
    if (socket.data?.user?.uuid !== uuid) return null
    if (!(onlineUsersRegistry instanceof Map)) return null
    if (onlineUsersRegistry.get(uuid) !== socket.id) return null
    const namespace = namespaceRegistryFor(socket, io)
    if (!namespace || namespace.get(socket.id) !== socket) return null

    const record = {
        socket,
        socketId: socket.id,
        uuid,
        registry: onlineUsersRegistry,
        generation: registryGeneration,
    }
    connectionOwnershipBySocket.set(socket, record)
    connectionOwnershipByUuid.set(uuid, record)
    return record
}

/**
 * F-23(AC-04): **disconnect 처리 권한**. 활성 요청 권한(isCurrentSocketForUuid)과 다르다.
 *
 *   · namespace에 아직 그 id의 객체가 있다 → 정확히 **이 객체**여야 하고 registry도 이 id를
 *     가리켜야 한다. connected===true는 요구하지 않는다(정리 순서상 이미 false일 수 있다).
 *   · namespace에서 제거됐다 → 등록 시 검증해 둔 소유권만이 근거다. 같은 socket 객체·같은
 *     등록 id·같은 uuid·같은 registry와 세대여야 하고, 그 계정의 **최신** 소유권이 여전히 이
 *     기록이어야 하며, connected===false이고 registry가 아직 그 등록 id를 가리켜야 한다.
 *     부재만으로는 절대 허용하지 않는다.
 */
function canProcessDisconnectFor(io, socket, uuid) {
    if (!socket || typeof socket.id !== 'string' || socket.id.length === 0) return false
    if (typeof uuid !== 'string' || uuid.length === 0) return false
    if (socket.data?.user?.uuid !== uuid) return false
    if (!(onlineUsersRegistry instanceof Map)) return false

    const namespace = namespaceRegistryFor(socket, io)
    const present = namespace ? namespace.get(socket.id) : undefined
    if (present !== undefined) {
        return present === socket && onlineUsersRegistry.get(uuid) === socket.id
    }

    const owned = connectionOwnershipBySocket.get(socket)
    if (!owned) return false
    if (owned.socket !== socket || owned.socketId !== socket.id || owned.uuid !== uuid) return false
    if (owned.registry !== onlineUsersRegistry || owned.generation !== registryGeneration) return false
    // 같은 계정에 **새 등록**이 생겼으면 이 옛 기록은 더 이상 그 계정의 소유권이 아니다.
    if (connectionOwnershipByUuid.get(uuid) !== owned) return false
    if (socket.connected !== false) return false
    if (onlineUsersRegistry.get(uuid) !== owned.socketId) return false
    return true
}

/** 종료 처리에 진입하며 **자기 기록만** 소비한다(새 연결의 기록은 건드리지 않는다). */
function consumeConnectionOwnership(socket, uuid) {
    const owned = connectionOwnershipBySocket.get(socket)
    if (!owned) return
    connectionOwnershipBySocket.delete(socket)
    if (connectionOwnershipByUuid.get(uuid) === owned) connectionOwnershipByUuid.delete(uuid)
}

/**
 * F-21(A-10): 개인 전송기(socket.js의 emitToUser)도 registry와 **같은 방향으로** 주입받는다.
 *
 * 여기서 `require('./socket')`을 지연 호출하지 않는 이유가 있다. socket.js는 이 모듈을
 * require하는 쪽이고, 그 모듈 초기화가 `setOnlineUsersRegistry(onlineUsers)`를 부른다 —
 * 지연 require가 처음 실행되는 순간 그 초기화가 함께 일어나, 시험이 주입해 둔 registry를
 * 조용히 덮어쓴다. 주입 방향을 한쪽으로 고정하면 그런 일이 구조적으로 생기지 않는다.
 *
 * 주입 전에는 null이라 전송이 조용히 생략된다(순수 단위 시험에서 소켓 계층을 요구하지 않는다).
 */
let emitToUserImpl = null

/** 런타임 진입점(socket.js의 모듈 초기화)에서 개인 전송기를 주입한다. */
function setEmitToUser(emit) {
    emitToUserImpl = typeof emit === 'function' ? emit : null
}

/**
 * mutation·disconnect 권한을 판정하는 유일한 canonical predicate다. registry에 uuid가
 * 매핑돼 있고 그 값이 정확히 이 socket의 id와 같을 때만 true다 — registry가 아직 주입되지
 * 않았거나(null) Map이 아니거나 socket이 undefined여도 절대 throw하지 않고 항상 false로
 * fail-closed한다. forcedLogout 플래그는 이 predicate의 입력이 아니다(socket.js의
 * handleDisconnect 자체 presence/logout 정리에서만 쓰인다).
 */
function isCurrentSocketForUuid(uuid, socket, io = null) {
    if (!socket || typeof socket.id !== 'string' || socket.id.length === 0) return false
    if (typeof uuid !== 'string' || uuid.length === 0) return false
    // 인증이 심은 신원과 다른 계정을 자처하는 소켓은 어떤 축도 통과하지 못한다.
    if (socket.data?.user?.uuid !== undefined && socket.data.user.uuid !== uuid) return false
    if (!(onlineUsersRegistry instanceof Map)) return false
    if (onlineUsersRegistry.get(uuid) !== socket.id) return false
    if (socket.connected !== true) return false
    /**
     * F-23(AC-04): **id 일치만으로는 부족하다.**
     *
     * registry는 id만 들고 있다. 같은 id를 가진 **다른 객체**(교체된 연결의 잔재, 시험이
     * 임의로 만든 소켓, 관례적 id를 돌려주는 registry 대역)는 그 비교를 그대로 통과한다.
     * namespace에서 그 id로 조회한 객체가 **바로 이 소켓**일 때만 현재 연결이다. namespace를
     * 전혀 알 수 없으면 false다 — 여기서 id 비교로 물러나는 것이 곧 우회로다.
     */
    const namespace = namespaceRegistryFor(socket, io)
    if (!namespace) return false
    return namespace.get(socket.id) === socket
}

/**
 * F-21(AC-05/AC-06): 제거·배제된 소켓을 세션 채널에서 뗀다. **실패하면 그 연결을 끊는다.**
 *
 * socket.leave는 adapter에 따라 Promise를 돌려주고 그 거부는 try/catch에 잡히지 않는다 —
 * 동기 throw만 처리하면 비동기 adapter에서 이미 배제된 계정이 그 경기의 방송을 계속 받는
 * 채널에 조용히 남는다. 두 실패 모양을 같은 정리로 잇는다: 연결을 끊고, 재접속은
 * resyncSessionRouting의 forfeited 검사가 다시 막는다.
 *
 * 절대 던지지 않는다 — 이미 확정된 커밋 뒤의 best-effort 정리이고, 여기서 새는 예외는
 * 뒤따르는 다른 통지를 멈춘다.
 *
 * ── 늦은 완료·늦은 거부의 소유권(AC-05/AC-06) ────────────────────────────────
 * leave가 비동기면 그 결과는 **이 정리가 시작된 순간의 사실이 아니다.** 기다리는 사이 같은
 * 소켓이 새 소속으로 그 채널에 정상 입장할 수 있다(같은 방에서 시작된 새 판은 channelId가
 * 같다). 그 상태에서
 *   - 늦은 거부에 무조건 disconnect하면 **새 소속의 연결**을 끊고,
 *   - 늦은 완료를 그대로 두면 옛 이탈이 **새 소속의 채널 가입**을 대신 지운다.
 * 그래서 두 경우 모두 완료 시점에 소유권을 다시 묻는다. 끊기의 기준(keepsConnection)은 채널
 * 소유권보다 넓다 — 그 소켓이 **다른** 새 소속(새 판·새 대기방)을 가졌더라도 이 옛 정리가 그
 * 연결을 끊어서는 안 되기 때문이다. 채널 되돌리기(ownsChannel)는 바로 그 채널일 때만 한다.
 *
 * @param {object} [ownership]
 * @param {() => boolean} [ownership.ownsChannel] - "이 소켓이 지금 **그 채널**의 정상 소속인가".
 * @param {() => boolean} [ownership.keepsConnection] - "이 소켓이 지금 살아 있는 소속을 가졌는가"
 *   (기본값: ownsChannel). 참이면 실패해도 연결을 끊지 않는다.
 *
 * ── 떼지 못한 채널(AC-06) ────────────────────────────────────────────────────
 * 끊지 않기로 한 실패를 그대로 두면 배제된 계정이 옛 판의 방송을 계속 받는다. 공통 경계가
 * 제한된 횟수만 다시 떼고, 그래도 실패하면 그 (채널, 소켓)을 전달 제외 목록에 넣는다 —
 * emitToGameChannel이 그 소켓을 빼고 보낸다. 새 소속의 연결은 그대로 산다.
 */
function detachSocketFromChannel(socket, channelId, logLabel, logFields = {}, ownership = null) {
    channelMembership.detachSocketFromChannel(socket, channelId, logLabel, logFields, ownership)
}

/**
 * F-21(AC-06): 세션 채널 방송의 유일한 경계. 전달 제외가 없으면 기존 io.to(channelId).emit과
 * 완전히 같다 — 정상 경로의 동작은 바뀌지 않는다.
 */
/**
 * F-23(AC-04): **지금 이 소켓이 그 판의 공개 상태를 받을 자격이 있는가.**
 *
 * 다섯 가지를 모두 물어야 한다. 하나라도 빼면 그 자리가 곧 "게임 참가자가 아닌 사용자가
 * 공개 상태를 구독하는" 통로가 된다:
 *
 *   1. **참여 중인가**(core). roster에 남아 있다는 것만으로는 부족하다 — 사망자의 roster는
 *      결과·재접속을 위해 보존되므로, 방금 이탈을 커밋한 계정도 여전히 players에 있다.
 *      isParticipatingInSession은 roster·isParticipating·forfeiture를 보고 **alive는 보지
 *      않는다** — 그래서 "관전 중인 사망 참가자"는 그대로 통과한다(AC-05).
 *   2. 연결돼 있는가.
 *   3. 그 계정의 **canonical 소켓**인가. 같은 계정의 옛 소켓이 채널에 남아 있어도 받지 못한다.
 *      registry가 아직 주입되지 않은 환경에서는 이 축을 묻지 않는다(그 축이 없다는 뜻이지
 *      "자격 없음"이라는 뜻이 아니다 — 여기서 fail-closed하면 정상 전달이 전부 끊긴다).
 *   4. 그 판의 채널에 실제로 가입해 있는가.
 *   5. 그 채널의 **전달 제외** 목록에 있지 않은가(떼지 못한 옛 구독·확정 전 입장자).
 */
function isEligibleSessionRecipient(session, socket, uuid, endContext = null) {
    if (!session || !socket) return false
    if (typeof uuid !== 'string' || uuid.length === 0) return false
    if (!gameSessionCore.isParticipatingInSession(session, uuid)) return false
    if (endContext && !isEligibleSessionEndRecipient(session, uuid, endContext)) return false
    if (socket.connected !== true) return false
    if (onlineUsersRegistry instanceof Map && !isCurrentSocketForUuid(uuid, socket)) return false
    if (!socket.rooms?.has?.(session.channelId)) return false
    if (typeof socket.id === 'string'
        && channelMembership.isSocketExcludedFromChannel(session.channelId, socket.id)) {
        return false
    }
    return true
}

/**
 * F-23(AC-04): resolver가 돌려준 목록은 **계산 시점의 사실**이다.
 *
 * 직접 전달(밤/낮/재판 결과·채팅·개인 진행)은 목록을 한 번 만든 뒤 그 위를 순회한다. 그런데
 * 한 수신자의 emit이 다음 수신자를 그 판에서 빼거나(이탈 커밋) 새 소속으로 옮길 수 있다 —
 * 그러면 목록은 이미 과거다. 실제 전송 직전에 같은 자격을 다시 묻는 것이 유일한 방어다.
 */
function stillEligibleForDelivery(session, recipientSocket) {
    return isEligibleSessionRecipient(session, recipientSocket, recipientSocket?.data?.user?.uuid ?? null)
}

/**
 * F-23(AC-04): 그 계정이 **지금** 이 판이 아닌 다른 소속(다른 경기 · 대기방)을 가졌는가.
 *
 * 종료 알림의 수명 판정에만 쓴다. 먼저 나간 계정이 새 방·새 판에 들어간 뒤 옛 종료 알림을
 * 받으면, 클라이언트의 game_ended 소비(useGameSessionSocketEvents → createSessionEndFinalizer)가
 * **지금 보고 있는 새 화면**을 정리하고 로비로 보낸다.
 */
function hasMembershipOutsideSession(session, uuid) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (routing && routing.gameId !== session.id) return true
    try {
        if (matchmaking.hasRoomMembership(uuid) === true) return true
    } catch (err) {
        // 대기방 계층을 물을 수 없으면 그 축은 알 수 없다 — 다른 축으로만 판정한다.
    }
    return false
}

/**
 * game_ended **전용** 수신 자격.
 *
 * 일반 사건은 현재 gameId/channelId routing 일치를 요구하지만, 종료 알림은 그럴 수 없다 —
 * core의 endGameSessionForPlayer가 이미 registry(gameSessions/roomGameSession/playerSession)를
 * 지운 뒤라 routing이 **정상 수신자에게도** 없기 때문이다. 그래서 종료 알림만 명시적 문맥을
 * 근거로 쓰고, 그 문맥에 담긴 후보가 아니면 예외를 적용하지 않는다.
 */
function isEligibleSessionEndRecipient(session, uuid, endContext) {
    if (endContext.gameId !== session.id) return false
    // 이 종료가 풀어 준 계정만이 후보다(cleanupUuids). 없거나 비었으면 후보도 없다 —
    // roster 전체 허용으로 대체하지 않는다.
    if (!endContext.allowed.has(uuid)) return false
    // 정리 **전에** 이미 다른 소속이었다는 사실은 matchmaking 정리가 방 정보를 지워도 되돌리지 않는다.
    if (endContext.preExcluded.has(uuid)) return false
    // 실제 전송 직전의 사실도 다시 묻는다(앞 수신자의 emit이 이 계정을 옮겼을 수 있다).
    if (hasMembershipOutsideSession(session, uuid)) return false
    return true
}

/**
 * F-23(AC-04): 종료 알림 전용 수신 문맥을 **정리 전에** 고정한다.
 *
 * cleanupUuids는 방어 복사한다 — core가 돌려준 배열/Set을 그대로 들고 있으면 뒤이은 정리가
 * 그것을 바꿀 때 수신 후보가 조용히 달라진다. leftUuid(이 종료를 촉발한 이탈자)는 제외하고,
 * 이미 참여를 마쳤거나(detached·forfeited) **정리 전에** 이미 다른 소속이던 계정도 함께 뺀다.
 */
function buildSessionEndContext(session, leftUuid, cleanupUuids) {
    const allowed = new Set()
    const preExcluded = new Set()
    for (const candidate of cleanupUuids ?? []) {
        if (typeof candidate !== 'string' || candidate.length === 0) continue
        if (candidate === leftUuid) continue
        if (!gameSessionCore.isParticipatingInSession(session, candidate)) continue
        if (hasMembershipOutsideSession(session, candidate)) {
            preExcluded.add(candidate)
            continue
        }
        allowed.add(candidate)
    }
    return { gameId: session.id, channelId: session.channelId, allowed, preExcluded }
}

/**
 * 채널에는 물리적으로 가입해 있지만 위 자격을 잃은 소켓들의 id.
 *
 * 채널 가입만으로 방송을 받게 두면, 이탈 커밋 직후 채널 정리(비동기 leave)가 끝나기 전의
 * 첫 공개 사건이 그대로 이탈자에게 간다 — AC-04가 막으려는 바로 그 구간이다.
 */
function collectIneligibleChannelSocketIds(io, session, endContext = null) {
    const ineligible = []
    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.values !== 'function') return ineligible
    for (const s of [...registry.values()]) {
        if (typeof s?.id !== 'string') continue
        if (!s.rooms?.has?.(session.channelId)) continue
        if (isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null, endContext)) continue
        ineligible.push(s.id)
    }
    return ineligible
}

/**
 * 게임 방송의 유일한 경계.
 *
 * **session 객체만** 받는다. channelId 문자열만 받던 옛 호출 형태는 더 이상 허용하지 않는다 —
 * 그 경로에는 세션 문맥이 없어 어떤 자격도 계산하지 못하고, 그대로 두면 "제외를 계산할 수 없는
 * 무검증 방송"이 AC-04의 우회로로 남는다.
 *
 * @param {object|null} [endContext] - game_ended 전용 수신 문맥(buildSessionEndContext).
 *   주면 한 번의 방송 대신 **수신자별 전송 직전 재검사**를 거치는 개별 전달 경계를 소비한다.
 */
function emitToGameChannel(io, session, event, payload, endContext = null) {
    if (!session || typeof session !== 'object') {
        console.error('[게임 방송 폐기 · 세션 문맥 없음]', { code: 'GAME_EMIT_NO_SESSION_CONTEXT', event })
        return
    }
    const channelId = session.channelId
    if (typeof channelId !== 'string' || channelId.length === 0) return
    const exceptSocketIds = collectIneligibleChannelSocketIds(io, session, endContext)
    const options = {}
    if (exceptSocketIds.length > 0) options.exceptSocketIds = exceptSocketIds
    if (endContext) {
        // 한 수신자의 emit이 다음 수신자의 소속을 바꿀 수 있다 — 위에서 한 번 계산한 제외
        // 목록만으로는 그 전이를 막지 못한다. 개별 전달 경계가 매 전송 직전에 다시 묻는다.
        options.recipientFilter = (s) =>
            isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null, endContext)
    }
    channelMembership.emitToChannel(
        io, channelId, event, payload,
        Object.keys(options).length > 0 ? options : null,
    )
}

/**
 * F-21(AC-05/AC-06): 이 소켓이 **지금** 그 채널의 정상 소속인가.
 *
 * 옛 정리(채널 이탈)의 늦은 완료·거부가 새 소속을 건드리지 않게 하는 유일한 근거다. 계정의
 * 현재 canonical 연결이고, 그 계정이 지금 라우팅되는 판의 채널이 바로 그 채널이며, 그 판에서
 * 배제되지 않았을 때만 참이다. 셋 중 하나라도 어긋나면 이 소켓은 그 채널의 주인이 아니다.
 */
function ownsSessionChannelNow(socket, uuid, channelId) {
    const routing = liveSessionRoutingFor(socket, uuid)
    return routing !== null && routing.channelId === channelId
}

/** 이 소켓·이 계정의 현재 살아 있는 세션 라우팅(배제된 판은 제외). 없으면 null. */
function liveSessionRoutingFor(socket, uuid) {
    if (!isCurrentSocketForUuid(uuid, socket)) return null
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return null
    return gameSessionCore.isForfeitedFromSession(routing.gameId, uuid) ? null : routing
}

/**
 * F-21(AC-05/AC-06): 이 소켓이 **지금** 살아 있는 소속을 하나라도 가졌는가(판이든 대기방이든).
 *
 * 옛 채널 정리의 늦은 실패로 연결을 끊어도 되는지를 판정하는 유일한 기준이다. 끊기는 "그
 * 채널에서 뗄 수 없었다"의 최후 수단인데, 그 사이 이 소켓이 새 판이나 새 대기방에 정상
 * 입장했다면 끊는 순간 **그 새 소속**이 방송 경로를 잃는다. 채널이 같은지는 따지지 않는다 —
 * 새 소속이 다른 채널이어도 끊기의 피해는 똑같기 때문이다.
 */
function socketHasLiveMembership(socket, uuid) {
    if (liveSessionRoutingFor(socket, uuid) !== null) return true
    if (!isCurrentSocketForUuid(uuid, socket)) return false
    try {
        return matchmaking.hasRoomMembership(uuid) === true
    } catch (err) {
        return false
    }
}

/**
 * F-26(AC-03/AC-06): **같은 범위의 재가입은 한 번만 시작한다.**
 *
 * 연결 등록 경로(socket.js::registerConnectionHandlers)와 재접속 조회 경로
 * (handleGetSessionSnapshot의 SESSION_ROUTING_PENDING)가 같은 소켓에 대해 동시에 재동기화를
 * 요구한다. 그 둘이 각자 join을 걸면 같은 채널에 두 번 들어가고, 한쪽의 늦은 되돌리기가
 * 다른 쪽의 정당한 가입을 지운다. 그래서 (게임·채널·계정·소켓 id·소속) 다섯 축이 같은 작업은
 * 하나의 Promise와 하나의 토큰을 공유한다 — 축이 하나라도 다르면 그것은 다른 작업이다.
 *
 * 실패·완료는 **자기 토큰만** 해제한다. 그래서 다음 적격 재조회가 새 join을 시작할 수 있고,
 * 이미 다른 범위의 작업이 진행 중이면 그 작업의 해제를 옛 작업이 가로채지 않는다.
 */
let sessionRoutingWorkSeq = 0
const sessionRoutingWorkBySocket = new WeakMap()
/** 이 소켓의 activeGameId를 **마지막으로 세운** 재동기화 토큰(되돌리기 소유권 판정 전용). */
const activeGameIdOwnerBySocket = new WeakMap()

/**
 * 연결 시점에 socket.data.activeGameId를 registry 기준으로 재바인딩하고, 활성 세션의 channel에
 * 아직 가입돼 있지 않으면 재가입시킨다. 라우팅 정보만 동기화할 뿐 어떤 권한도 부여하지
 * 않는다 — mutation·disconnect 권한은 오직 isCurrentSocketForUuid만 판정한다. 활성 세션이
 * 없으면 아무 것도 하지 않는다(no-op). 이미 가입된 channel에는 다시 join하지 않으므로
 * 동일 socket에 대해 여러 번 호출해도 멱등하다.
 *
 * F-26(AC-03): 같은 범위의 진행 중 작업이 있으면 그 Promise를 그대로 돌려준다(공유) — 호출부는
 * 여전히 await/catch만 하면 되고, 어느 호출부가 시작했는지에 따라 결과가 갈리지 않는다.
 */
function resyncSessionRouting(socket, uuid) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return Promise.resolve()

    // 유예 만료로 배제된 uuid는 같은 uuid로 다시 접속해도 세션 라우팅을 되돌려받지 못한다 —
    // activeGameId 재바인딩과 channel 재가입이 모두 여기서 막히므로, 그 세션의 어떤 방송도
    // 다시 받지 못한다(관전 복귀 거부). 유예 취소보다 먼저 판정해야 배제된 참가자의 재접속이
    // 이미 끝난 유예를 되살리는 것처럼 보이지 않는다.
    if (gameSessionCore.isForfeitedFromSession(routing.gameId, uuid)) return Promise.resolve()

    // 진입 시점의 범위를 고정한다 — 소속(membershipId)까지 포함해야 같은 판의 이탈→재입장이
    // 같은 작업으로 뭉쳐지지 않는다.
    const membershipId = gameSessionCore.getActiveSessionForDeparture(uuid, routing.gameId)
        ?.players?.get(uuid)?.membershipId ?? null
    const scopeKey = `${routing.gameId} ${routing.channelId} ${uuid} ${socket?.id ?? ''} ${membershipId ?? ''}`

    const inFlight = sessionRoutingWorkBySocket.get(socket)
    if (inFlight && inFlight.scopeKey === scopeKey) return inFlight.promise

    sessionRoutingWorkSeq += 1
    const token = { id: sessionRoutingWorkSeq, scopeKey, socket, uuid, routing, membershipId, ready: false }

    // 작업 본문은 이 함수 안에 그대로 둔다(고정한 범위·토큰만 보고 돈다). 공유를 위해 Promise를
    // **await 이전에** 등록해야 하므로 본문만 즉시 실행 함수로 감싼다.
    const run = async () => {
    // 재접속했으므로 진행 중인 유예를 취소한다 — 이 취소가 없으면 새로고침한 참가자가 유예
    // 만료 시각에 그대로 사망한다. 라우팅 재바인딩보다 먼저 해서, join이 지연되더라도 사망
    // 확정이 그 사이에 끼어들 수 없게 한다.
    cancelDisconnectGrace(routing.gameId, uuid)

    socket.data.activeGameId = routing.gameId
    // 되돌리기는 **이 토큰이 세운 값**만 건드린다(그 사이 다른 경로가 갱신했다면 남의 것이다).
    activeGameIdOwnerBySocket.set(socket, token)
    if (!socket.rooms.has(routing.channelId)) {
        // F-21(AC-05/AC-06): socket.join은 adapter에 따라 비동기다. 그 사이에 이 계정이 그
        // 세션에서 빠질 수 있다(추방·이탈·유예 만료) — 완료 뒤 **다시** 검사하지 않으면,
        // 이미 배제된 계정이 그 경기의 모든 방송을 계속 받는 채널에 남는다.
        await socket.join(routing.channelId)

        const current = gameSessionCore.getActiveSessionRoutingInfo(uuid)
        const stillMine = current !== null
            && current.gameId === routing.gameId
            && current.channelId === routing.channelId
            && !gameSessionCore.isForfeitedFromSession(routing.gameId, uuid)
            // 그 사이 같은 계정의 새 연결이 canonical 소켓을 교체했다면 이 채널 가입은 남의
            // 것을 흉내 내는 셈이다(권한은 여전히 isCurrentSocketForUuid만 판정한다).
            && isCurrentSocketForUuid(uuid, socket)
            // F-26(AC-03): 이 작업이 시작될 때 고정한 소속·소켓 id와도 같아야 한다 — 같은 판의
            // 이탈→재입장으로 소속이 교체된 뒤의 가입은 이 작업의 것이 아니다.
            && socket.id === token.socket?.id
            && (gameSessionCore.getActiveSessionForDeparture(uuid, routing.gameId)
                ?.players?.get(uuid)?.membershipId ?? null) === token.membershipId
        if (stillMine) {
            // 재가입이 실제로 끝났고 모든 축이 그대로다 — 이 범위의 준비 완료다.
            token.ready = true
            return
        }

        // **자신이 방금 남긴 잘못된 가입만** 되돌린다. 그 사이 다른 경로가 이 소켓을 새
        // 세션의 채널에 넣었다면 그 채널은 건드리지 않는다.
        //
        // 이 정리가 실패하면 **연결을 끊는다**(F-21 AC-06). 여기까지 온 소켓은 이미 그 경기에서
        // 빠졌거나 배제된 계정의 것인데, 채널에는 방금 가입한 상태다 — 떼지 못한 채로 두면
        // 배제된 대상이 그 판의 모든 방송을 계속 받는다. 동기 throw와 비동기 거부를 같은
        // 정리로 잇는다.
        detachSocketFromChannel(
            socket, routing.channelId, '\x1b[31m[세션 채널 정리 실패]\x1b[0m', { gameId: routing.gameId },
            // 되돌리기가 늦게 끝나는 사이 이 소켓이 그 채널의 정상 소속이 됐다면(새 판·재입장)
            // 이 정리가 떼어낸 새 가입은 되돌려 놓고, 어떤 새 소속이든 있으면 끊지 않는다.
            {
                ownsChannel: () => ownsSessionChannelNow(socket, uuid, routing.channelId),
                keepsConnection: () => socketHasLiveMembership(socket, uuid),
            },
        )
        // activeGameId도 그 사이 갱신되지 않은 경우에만 되돌린다 — 값이 같아도 **다른 토큰이
        // 다시 세운 값**이면 그것은 이 정리의 것이 아니다(F-26 AC-03).
        if (socket.data.activeGameId === routing.gameId && activeGameIdOwnerBySocket.get(socket) === token) {
            socket.data.activeGameId = current !== null ? current.gameId : null
            activeGameIdOwnerBySocket.delete(socket)
        }
        return
    }
    // 이미 그 채널에 들어가 있었다 — 라우팅은 그대로 현재 사실이다.
    token.ready = true
    }

    const promise = run().finally(() => {
        const current = sessionRoutingWorkBySocket.get(socket)
        if (current && current.token === token) sessionRoutingWorkBySocket.delete(socket)
    })
    sessionRoutingWorkBySocket.set(socket, { scopeKey, token, promise })
    return promise
}

/**
 * 테스트 전용: onlineUsersRegistry를 초기 상태(null)로 되돌리고, 진행 중인 밤 턴 시퀀스와 낮
 * 페이즈 타이머를 전부 중단합니다(대기 중인 타이머까지 해제하므로 테스트 간에 타이머가
 * 새어나가지 않습니다). 런타임 코드에서는 호출하지 마세요.
 */
function __resetStateForTests() {
    onlineUsersRegistry = null
    // registry 교체와 같은 이유로 세대를 올린다 — 앞 시험이 기록한 연결 소유권이 다음 시험의
    // 제거된 소켓을 정당화하지 못하게 한다.
    registryGeneration += 1
    connectionOwnershipByUuid.clear()
    emitToUserImpl = null
    // F-21: 추방 영수증도 비운다 — 남으면 다음 테스트의 같은 requestId가 "이미 결정된 요청"으로
    // 재생돼, 실제로는 실행되지 않은 명령이 성공으로 보인다.
    kickReceiptStore.__resetKickReceiptsForTests()
    // F-21(AC-03): 이탈 재평가 표식도 비운다 — 남으면 다음 테스트의 같은 gameId가 이탈이
    // 없었는데도 "분모가 줄어든 라운드"로 판정돼 제출 직후 판정이 일어난다.
    departureResolveMarks.clear()
    // F-25b: 밤 최종화 재진입 표식도 비운다 — 남으면 다음 테스트의 같은 gameId가 "이미 최종화
    // 진행 중"으로 오인돼 밤이 영영 확정되지 않는다.
    nightFinalizeInFlight.clear()
    // F-26b: WeakMap은 비울 수 없으므로 새 것으로 갈아끼운다 — 같은 session 객체를 재사용하는
    // 스위트가 이전 테스트의 완료 수신 기록에 막히지 않게 한다(terminalPersistBySession과 동일
    // 이유).
    nightSuccessReceiptsBySession = new WeakMap()
    for (const gameId of [...nightTurnRuns.keys()]) stopNightTurnSequence(gameId)
    for (const gameId of [...dayPhaseRuns.keys()]) stopDayPhaseTimer(gameId)
    for (const [gameId, pending] of [...disconnectGraceRuns]) {
        for (const [uuid, run] of [...pending]) detachDisconnectGraceRun(gameId, uuid, run)
    }
    // F-21(A-09): 저장 재시도 작업도 함께 끝낸다 — 남기면 다음 테스트가 도는 도중 이전
    // 테스트의 재시도가 깨어나 그 테스트의 저장소 대역을 호출한다.
    for (const run of [...terminalPersistRuns.values()]) {
        if (run.timerId !== null) terminalPersistClearTimeout(run.timerId)
        run.timerId = null
    }
    terminalPersistRuns.clear()
    terminalPersistConfirmed.clear()
    // WeakMap은 비울 수 없으므로 새 것으로 갈아끼운다 — 같은 session 객체를 재사용하는 스위트가
    // 이전 테스트의 표식에 막히지 않게 한다(프로덕션에는 이 경로가 없다).
    terminalPersistBySession = new WeakMap()
    __setTerminalPersistTimersForTests()
}

/**
 * 종료된 한 판을 전적 테이블에 저장합니다 — 세 종결 지점(밤 판정 terminal · 재판 판정
 * terminal · 세션 정리)이 공유하는 유일한 저장 훅입니다.
 *
 * 두 가지를 구조적으로 지킵니다.
 *   1. 중복 호출은 프로세스 메모리가 아니라 game_results PK가 막습니다.
 *   2. 저장은 게임 진행을 절대 막지 않는다 — 레코드 조립은 동기적으로 끝내(세션이 곧 정리돼도
 *      값이 비지 않게) 두고, DB 왕복은 await하지 않으며 실패는 로그로만 남깁니다. 그래서 저장이
 *      실패해도 뒤따르는 방송(game_ended 등)과 registry 정리는 예정대로 진행됩니다.
 *
 * @param {object} session - 종료(또는 중단)된 GameSession
 * @param {boolean} completed - 정상 승패 확정 여부
 * @param {string} [disconnectedUuid] - 중단시킨 이탈자 uuid
 */
function persistTerminalSession(session, { completed, disconnectedUuid } = {}) {
    const gameId = session?.id
    if (typeof gameId !== 'string' || !gameId) return
    // F-21(A-09): 같은 gameId의 두 번째 종결 훅은 **새 작업을 만들지 않는다**. 재시도 타이머가
    // gameId당 정확히 하나여야, 동시 종료(밤 판정 terminal과 세션 정리가 겹치는 등)가 같은
    // 레코드를 향한 타이머를 두 개 만들어 지수적으로 늘어나는 일이 생기지 않는다.
    if (terminalPersistRuns.has(gameId)) return
    // 이미 DB 커밋을 확인한 판이면 **다시 조립하지 않는다.** 확인 뒤 작업 항목은 사라지므로,
    // 뒤늦은 중복 종결 훅(세션 정리 등)이 그 사이 비워진 session으로 새 레코드를 만들어 낼 수
    // 있었다 — 그 레코드는 ended_at·roster·통계 delta가 처음 것과 다르다. DB PK가 그 두 번째
    // 쓰기를 막아 주더라도, "gameId마다 결과 레코드는 하나"라는 계약(A-09)은 조립 시점에서
    // 지켜져야 한다(같은 판의 업적 평가·개인 무효화도 커밋 확인 1회에 묶인다).
    //
    // ── 왜 gameId 집합 하나로는 부족한가 ─────────────────────────────────────
    // 그 집합은 상한(4096)을 넘으면 가장 오래된 항목을 버린다. 늦은 중복 훅이 **살아 있는**
    // session 객체를 그대로 들고 있는데 그 gameId만 축출됐다면, 판정이 통과해 이미 비워진
    // session으로 두 번째 레코드가 조립된다. 그래서 판정의 1차 근거를 **session 객체 자체**에
    // 둔다(아래 WeakMap) — 늦은 콜백이 도달할 수 있는 session이라면 그 표식도 반드시 살아
    // 있고, session이 수거되면 표식도 함께 사라진다(전역 보존을 무한히 키우지 않는다).
    // gameId 집합은 "같은 판을 가리키는 **다른** session 객체"를 위한 보조 경로로 남는다.
    if (terminalPersistBySession.get(session)) return
    if (terminalPersistConfirmed.has(gameId)) return

    // 레코드는 **지금 여기서 한 번만** 조립한다. 재시도마다 다시 만들면 ended_at이 시도
    // 시각으로 밀리고, 그 사이 세션이 정리됐다면 roster·통계 delta까지 달라진다 — 그러면
    // "같은 판을 다시 저장한다"는 말 자체가 성립하지 않는다(A-09).
    //
    // 참가자 uuid도 같은 이유로 지금 배열로 고정한다 — 저장이 성공한 뒤 업적을 평가할 대상은
    // "그 판의 원 참가자"이지 그때까지 남아 있는 사람이 아니다.
    let record
    let participantUuids
    try {
        record = gameSessionCore.buildGameResultRecord(session, { completed, disconnectedUuid })
        participantUuids = session?.players instanceof Map
            ? [...session.players.values()].map((p) => p.uuid)
            : []
    } catch (err) {
        console.error('[전적 저장 실패]', { code: 'RECORD_BUILD_ERROR', gameId })
        return
    }

    // 레코드를 동결한다 — 재시도는 **같은 값**을 다시 쓰는 일이어야 하고, 그 사이 누구도
    // ended_at·roster·통계 delta를 바꿀 수 없어야 한다(A-09).
    const run = { gameId, record: deepFreezeRecord(record), participantUuids, attempt: 0, timerId: null }
    terminalPersistRuns.set(gameId, run)
    // 이 session 객체로 오는 어떤 늦은 훅도 이제부터 위 판정에 걸린다(축출과 무관하다).
    terminalPersistBySession.set(session, run)
    attemptTerminalPersist(run)
}

/**
 * 저장 레코드를 제자리에서 동결한다(중첩 배열·객체까지). 새 객체를 만들지 않으므로 저장소가
 * 받는 값의 모양은 그대로다 — 바꿀 수 없게만 한다.
 */
function deepFreezeRecord(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreezeRecord(nested)
    return value
}

/**
 * F-21(A-09): gameId → 아직 **DB 커밋을 확인하지 못한** 종결 저장 작업.
 *
 * 성공(또는 "이미 같은 gameId로 저장돼 있음")을 확인하기 전에는 이 항목을 지우지 않는다 —
 * 지우면 그 판은 아무도 다시 시도하지 않는 미저장 상태로 남는다. 프로세스가 죽으면 이 표도
 * 함께 사라진다: 그것은 **미저장/미확인**이며, 이번 범위는 새 영속 복구 체계를 만들지 않는다.
 */
const terminalPersistRuns = new Map()

/**
 * F-21(A-09): **이 프로세스에서 DB 커밋을 확인한** gameId들. 확인 이후 도착하는 중복 종결
 * 훅이 같은 판의 레코드를 다시 조립하지 못하게 막는 유일한 근거다.
 *
 * 무한정 쌓지 않는다 — 가장 오래된 것부터 버린다. 버려진 gameId의 아주 늦은 중복 훅은 예전처럼
 * 한 번 더 조립해 보겠지만, 그 쓰기는 game_results PK가 막는다(안전한 쪽으로 퇴화한다).
 */
const terminalPersistConfirmed = new Set()
const TERMINAL_PERSIST_CONFIRMED_MAX = 4096

/**
 * F-21(A-09): session 객체 → 그 판의 종결 저장 작업(진행 중이든 확인 완료든).
 *
 * 위 Set과 나누는 이유는 **생명주기**다. Set은 상한을 넘으면 오래된 gameId를 버리는데, 버려진
 * 그 판의 session을 아직 붙잡고 있는 늦은 콜백이 도착하면 레코드가 다시 조립된다(그때 session은
 * 이미 비워져 있어 ended_at·roster·delta가 다른 **두 번째 레코드**가 된다).
 *
 * WeakMap은 그 상황 자체를 없앤다 — 늦은 콜백이 session에 도달할 수 있다면 표식도 반드시 살아
 * 있고, 아무도 그 session을 참조하지 않게 되면 표식도 함께 수거된다. 축출도 없고 무한히 자라는
 * 전역 보존도 없다. (프로세스가 죽으면 이 표도 함께 사라진다 — 그것은 **미저장/미확인**이며,
 * 이 구조가 프로세스 소실에 대한 durability를 주장하지는 않는다.)
 */
let terminalPersistBySession = new WeakMap()

/** 최초 1회 → 1초 → 5초 → 30초 → 이후 계속 60초. 단일 타이머로만 진행한다. */
const TERMINAL_PERSIST_RETRY_DELAYS_MS = [1_000, 5_000, 30_000]
const TERMINAL_PERSIST_MAX_DELAY_MS = 60_000

let terminalPersistSetTimeout = setTimeout
let terminalPersistClearTimeout = clearTimeout

/** 테스트 전용: 실제 1/5/30/60초를 기다리지 않도록 타이머 구현만 교체한다(판정은 그대로). */
function __setTerminalPersistTimersForTests({ setTimeoutFn, clearTimeoutFn } = {}) {
    terminalPersistSetTimeout = setTimeoutFn ?? setTimeout
    terminalPersistClearTimeout = clearTimeoutFn ?? clearTimeout
}

/**
 * 한 번의 저장 시도. DB 왕복을 await하지 않으므로 방송·정리·게임 진행을 막지 않는다.
 *
 * 성공 판정은 "예외 없이 돌아왔다"이다 — repository는 이미 저장된 판을 `persisted:false`로
 * 돌려주는데, 그것은 실패가 아니라 **확인**이다(다른 프로세스가 먼저 썼거나 이 판의 앞선
 * 시도가 실제로는 성공했던 경우). 어느 쪽이든 그 gameId의 행은 DB에 있다.
 */
function attemptTerminalPersist(run) {
    run.attempt += 1
    let pending
    try {
        pending = Promise.resolve(gameResultRepository.persistGameResultRecord(run.record))
    } catch (err) {
        // 동기적으로 던지는 저장소(테스트 대역 등)도 비동기 실패와 같은 재시도 경로를 탄다.
        pending = Promise.reject(err)
    }
    pending
        .then(() => finishTerminalPersist(run))
        .catch(() => {
            console.error('[전적 저장 실패]', { code: 'PERSIST_ERROR', gameId: run.gameId, attempt: run.attempt })
            scheduleTerminalPersistRetry(run)
        })
}

function scheduleTerminalPersistRetry(run) {
    // 이 작업이 그 사이 다른 경로로 끝났거나(성공) 테스트 정리로 치워졌다면 다시 걸지 않는다.
    if (terminalPersistRuns.get(run.gameId) !== run) return
    const delay = TERMINAL_PERSIST_RETRY_DELAYS_MS[run.attempt - 1] ?? TERMINAL_PERSIST_MAX_DELAY_MS
    run.timerId = terminalPersistSetTimeout(() => {
        run.timerId = null
        if (terminalPersistRuns.get(run.gameId) !== run) return
        attemptTerminalPersist(run)
    }, delay)
    // 저장 재시도가 프로세스를 붙잡아 두지 않게 한다(있는 구현에서만 — 테스트 대역에는 없다).
    if (typeof run.timerId?.unref === 'function') run.timerId.unref()
}

/**
 * DB 커밋을 확인한 뒤의 마무리. **이 순서에만** 의미가 있다:
 *   pending 제거 → 개인 프로필 무효화 → 업적 평가 → 경제·업적 무효화
 *
 * 프로필 무효화를 업적 평가보다 먼저 보내는 이유는, 전적 숫자는 이 시점에 이미 DB에 있고
 * 업적·지급은 아직 진행 중이기 때문이다 — 화면이 두 사실을 각각 확정되는 대로 반영한다.
 */
function finishTerminalPersist(run) {
    if (terminalPersistRuns.get(run.gameId) === run) terminalPersistRuns.delete(run.gameId)
    // 커밋을 확인했다 — 이 판의 레코드는 이제 영원히 이 하나다.
    terminalPersistConfirmed.add(run.gameId)
    if (terminalPersistConfirmed.size > TERMINAL_PERSIST_CONFIRMED_MAX) {
        terminalPersistConfirmed.delete(terminalPersistConfirmed.values().next().value)
    }
    if (run.timerId !== null) {
        terminalPersistClearTimeout(run.timerId)
        run.timerId = null
    }

    invalidateAccountCaches(run.participantUuids, run.gameId, ['profile'])
    Promise.resolve(evaluateAchievementsForUsers(run.participantUuids, run.gameId))
        .then(() => invalidateAccountCaches(run.participantUuids, run.gameId, ['economy', 'achievements']))
        .catch(() => {
            console.error('[업적 평가 실패]', { code: 'ACHIEVEMENT_EVAL_ERROR', gameId: run.gameId })
        })
}

/**
 * F-21(A-10): 이 판의 **원 참가자 전원**에게 개인 캐시 무효화를 보낸다.
 *
 * 현재 경기 채널에 남아 있는지는 조건이 아니다 — 먼저 추방·이탈한 계정이야말로 로비에서 옛
 * 전적을 보고 있는 쪽이다. 대상은 socket.js의 emitToUser가 조회하는 **현재 인증 소켓**이고,
 * 연결이 없으면 그냥 전달되지 않는다(그 계정은 재진입·재연결·창 재활성화 시의 서버 조회로
 * 수렴한다 — 이 신호는 수렴을 앞당길 뿐 유일한 경로가 아니다).
 *
 * payload에는 gameId와 무효화 종류만 담는다. 역할·진영·승패는 싣지 않는다 — 이 신호는 "다시
 * 읽어라"는 말이지 결과의 전달이 아니다.
 */
function invalidateAccountCaches(uuids, gameId, scopes) {
    const emit = emitToUserImpl
    if (typeof emit !== 'function') return
    for (const uuid of uuids) {
        if (typeof uuid !== 'string' || !uuid) continue
        try {
            emit(uuid, 'account_cache_invalidated', { gameId, scopes: [...scopes] })
        } catch (err) {
            console.error('[캐시 무효화 전달 실패]', { code: 'INVALIDATION_DELIVERY_ERROR', gameId })
        }
    }
}

/** 테스트 전용: 현재 onlineUsersRegistry 참조를 읽기 전용으로 반환합니다(변형하지 않습니다). */
function __getOnlineUsersRegistryForTests() {
    return onlineUsersRegistry
}

/**
 * callback을 항상 안전하게 호출한다 — callback 자체가 던지는 예외가 이후 로직(방송 등)을
 * 막지 않게 한다. acknowledge_role_reveal과 leave_game_session이 공유한다(둘 다 비밀 역할
 * 데이터를 다루지 않으므로 raw Error를 그대로 로그해도 안전하다 — submit_night_action/
 * submit_joker_chat_message는 그렇지 않아 별도의 고정 구조 로거를 쓴다).
 */
function respond(callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[ack 전달 실패]', err)
    }
}

/**
 * ROLE_REVEAL 역할 확인 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * 전원이 확인하면(game-core가 transitioned:true를 돌려주면) 첫 DAY 전이를 참가자 전체
 * channel에 한 번만 방송합니다 — 방송 대상 channel에는 마지막으로 확인한 본인의 socket도
 * 포함되므로 발신자와 나머지 참가자가 같은 phase 갱신을 정확히 한 번씩 받습니다. 중복·
 * 재요청·늦게 도착한 확인은 game-core가 transitioned:false 또는 INVALID_PHASE로 되돌려
 * 이 분기에 아예 도달하지 않습니다(두 번째 canonical 전이 방송이 없습니다).
 * callback과 broadcast는 서로 독립적인 best-effort 통지라
 * respond()가 callback의 예외를 삼켜, 콜백이 던지더라도 아래 broadcast는 항상 실행됩니다
 * (onDisconnect의 "알림 전송과 channel 정리를 분리된 try 블록에 둔다"는 기존 관례와 동일한
 * 이유).
 */
function handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.acknowledgeRoleReveal(uuid, gameId)
    } catch (err) {
        console.error('[역할 확인 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            // 원본 코드와 uuid/gameId만 서버 로그에 남기고, role 등 비밀 정보는 이 함수
            // 어디에서도 로그로 남기지 않는다(result.session 자체를 로그에 넘기지 않음).
            console.error('[역할 확인 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respond(callback, { ok: true })

    if (result.transitioned) {
        try {
            emitToGameChannel(io, result.session,'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(result.session))
        } catch (err) {
            console.error('[phase 변경 알림 전송 실패]', err)
        }
        // 첫 DAY가 열리는 유일한 지점이므로 낮 토론 제한시간도 여기서 시작한다. 방송과 분리된
        // try 블록에 두어 한쪽이 실패해도 다른 쪽이 막히지 않게 한다(onDisconnect와 같은 관례).
        try {
            startDayPhaseTimer(io, result.session)
        } catch (err) {
            console.error('[낮 타이머 시작 실패]', { code: 'TIMER_START_ERROR', gameId: result.session.id })
        }
    }
}

/**
 * DAY_DISCUSSION의 "투표 시작 준비(ready_for_day_vote)" 요청을 처리합니다(Socket.IO
 * acknowledgement 방식). handleAcknowledgeRoleReveal과 같은 골격이며, 생존자 전원이 준비를
 * 마쳐 game-core가 transitioned:true를 돌려줄 때만 DAY_VOTE 개시를 참가자 전체 channel에 한 번
 * 방송합니다 — 중복·늦은 준비는 core가 transitioned:false 또는 INVALID_DAY_PHASE로 되돌리므로
 * 이 분기에 도달하지 않습니다(한 낮에 day_phase_changed 방송은 정확히 한 번).
 *
 * ack에는 요청자 본인이 본 진행률(readyCount/requiredCount)만 담습니다 — 누가 준비했는지는
 * 방송하지도, 응답하지도 않습니다(새 공개 정보를 만들지 않기 위함).
 * INVALID_DAY_PHASE/ACTOR_NOT_ALIVE는 클라이언트가 정상적으로 마주칠 수 있는 공개 코드라
 * INTERNAL_ONLY_CODES에 넣지 않고 그대로 전달합니다.
 * callback과 broadcast는 서로 독립적인 best-effort 통지입니다(respond가 callback 예외를 삼킵니다).
 *
 * @param {object} io - Socket.IO 서버(방송에만 쓴다)
 * @param {object} socket - 요청 socket(권한 판정에만 쓴다)
 * @param {string} uuid - 인증된 요청자 uuid
 * @param {object} payload - 클라이언트 요청({ gameId })
 * @param {Function} callback - Socket.IO acknowledgement 콜백
 * @flow socket 권한·payload 형태를 검사하고 core를 호출한 뒤, 실패면 코드 정규화, 성공이면
 *       ack를 돌려주고 transitioned일 때만 day_phase_changed를 방송한다.
 */
function handleAcknowledgeDayVoteReady(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.acknowledgeDayVoteReady(uuid, gameId)
    } catch (err) {
        console.error('[낮 투표 준비 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[낮 투표 준비 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // F-21(AC-03): 낮 투표 제출과 **같은 이유**의 갱신이다. 이탈이 한 번 일어난 뒤 화면은 서버가
    // 실어 준 공개 진행 수·본인 값을 canonical로 쓰므로, 준비가 서버 값을 갱신하지 않으면
    // 준비 인원이 이탈 당시의 수에 멈춘 채 남는다(ACK의 수치는 그 뒤의 이탈을 모른다).
    // 전이 방송보다 먼저 보내 이 제출 시점의 사실을 그대로 전달한다.
    try {
        emitSelfSubmissionProgress(io, result.session, uuid)
    } catch (err) {
        console.error('[개인 진행 상태 전송 실패]', { code: 'SELF_PROGRESS_AFTER_READY', gameId })
    }

    respond(callback, { ok: true, readyCount: result.readyCount, requiredCount: result.requiredCount })

    if (result.transitioned) {
        try {
            emitToGameChannel(io, result.session,
                'day_phase_changed',
                gameSessionCore.buildDayPhaseChangedPayload(result.session),
            )
        } catch (err) {
            console.error('[낮 하위 페이즈 변경 알림 전송 실패]', err)
        }
        // 전원 준비로 토론이 조기 종료됐다 — 남은 토론 제한시간을 버리고 투표 제한시간을 건다.
        try {
            startDayPhaseTimer(io, result.session)
        } catch (err) {
            console.error('[낮 타이머 시작 실패]', { code: 'TIMER_START_ERROR', gameId: result.session.id })
        }
    }
}

/**
 * submit_night_action 전용 ack 전달 헬퍼. 공용 respond()(위)는 acknowledge_role_reveal에서만
 * 쓰고 여기서는 재사용하지 않는다 — respond()는 callback이 throw할 때 원본 Error를 그대로
 * 로그하는데, 이 이벤트는 밤 행동이라는 비밀 데이터를 다루므로 그보다 엄격한 고정 구조 로그를
 * 쓴다. trustedGameId는 client가 보낸 원본 payload.gameId가 아니라 game-core가 registry
 * 조회로 직접 확인한 session.id(성공 경로)이거나 undefined(그 외 모든 경로)여야 한다 — 이
 * 함수 자체는 그 값이 어디서 왔는지 모르고 그대로 로그에 쓰기만 한다.
 */
function respondNightAction(uuid, trustedGameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[밤 행동 제출 ack 전달 실패]', { code: 'CALLBACK_ERROR', uuid, gameId: trustedGameId })
    }
}

// gameId → 진행 중인 밤 턴 시퀀스 run 컨텍스트. 밤 하나당 최대 하나만 존재하며, 마지막 턴이
// 끝나면 스스로 지워진다. handleSubmitNightAction이 io도 타이머도 인자로 받지 않고 턴을 앞당길
// 수 있는 이유가 이 Map이다 — 제출 핸들러는 gameId만으로 진행 중인 run을 찾는다.
const nightTurnRuns = new Map()

/**
 * F-26b(AC-05): session → 그 밤에 emitNightSuccessEvents가 실제로 전송한 성공 사건의
 * 수신자별 완료 수신 기록. run.contracts는 stopNightTurnSequence에서 run과 함께 사라지므로
 * DAY·TRIBUNAL·ENDED로 넘어간 뒤에도 완료 ACK를 대조할 수 있는 별도 보관소가 필요하다.
 *
 * 값은 { nightDayIndex, byEvent: Map<eventId, Map<uuid, record>> }이고, record는
 * { membershipId, socketId, socket, completed }다 — socket은 실제 전송 당시의 소켓 객체
 * 참조이며, 재연결로 만들어진 새 객체는 이 기록의 소유자가 아니다(AC-05의 "옛 소켓" 거부).
 *
 * 다음 밤 startNightTurnSequence가 이전 밤 보관함을 통째로 교체하고, finalizeGameSessionEnd가
 * 세션 종료 시 지운다. WeakMap이라 session이 수거되면 표식도 함께 사라진다.
 */
let nightSuccessReceiptsBySession = new WeakMap()

// ── F-25: 역할 턴의 내부 진행 단계와 연출 계약 ───────────────────────────────────
//
// 이 절이 만드는 것은 **서버 내부 사실**뿐이다. 새 개인 소켓 메시지·전달 영수증·재생 완료
// ACK는 어느 것도 여기서 생기지 않는다(각각 F-26a/F-26b의 책임). 공개
// night_turn_started/night_turn_ended의 이름·허용 키·개수도 그대로다 — 사건의 성공 여부나
// 수신자 수가 공개 메시지의 모양 차이로 드러나면 그 자체가 부채널이기 때문이다(A-08).
//
// 대기는 **같은 동기 호출 안에서 즉시 통과**한다. 실제 상한·타이머·해제 조건은 F-27a가
// 구현하므로 여기서는 timeout도 Promise도 ACK 집계도 만들지 않는다.

/** run의 내부 진행 단계. 공개 payload·snapshot 어디에도 실리지 않는다. */
const NIGHT_TURN_STAGES = Object.freeze({
    IDLE: 'IDLE',
    SUBMITTING: 'SUBMITTING',
    PRESENTATION_WAIT: 'PRESENTATION_WAIT',
    STOPPED: 'STOPPED',
})

/** 내부 계약의 형태 번호. F-26a가 이 값으로 자기가 아는 모양인지 확인한다. */
const NIGHT_PRESENTATION_CONTRACT_VERSION = 1

/**
 * 역할 → 그 역할이 만드는 사건 종류.
 *
 * core가 실제로 기록하는 사건은 KILL/HEAL뿐이다(applyNightRoleStep). GUARD/WITCH_HUNTER는
 * 확정 step에서 조사·확인 기술자를 만들어 붙이되, core의 events 배열에는 절대 덧붙이지
 * 않는다 — 그 배열은 최종 판정(prepareNightResolutionForSession)의 입력이다.
 */
const NIGHT_PRESENTATION_EVENT_TYPE_BY_ROLE = Object.freeze({
    JOKER: 'KILL',
    DOCTOR: 'HEAL',
    GUARD: 'INVESTIGATE',
    WITCH_HUNTER: 'CONFIRM',
})

/** 사건 수신 관점. 한 계정이 둘 다 가질 수 있다(의사의 자기 치료). 순서는 항상 이 순서다. */
const NIGHT_PRESENTATION_PERSPECTIVES = Object.freeze(['USER', 'TARGET'])

/**
 * 생존 actor가 없는 턴의 종료 지연(ms)을 계산합니다. 턴 제한시간의 20~60% 구간이며, 난수원을
 * 인자로 받아 테스트가 결정적으로 검증할 수 있게 합니다(handleResolveNight의 deps 관례와 동일).
 *
 * 즉시 끝내지 않는 이유: 종료까지 걸린 시간이 그 역할의 전멸 여부를 그대로 알려주는 부채널이
 * 되기 때문입니다. 제한시간을 다 쓰지도 않는 이유는 그 반대로, 아무도 제출할 수 없는 턴이
 * 매번 만료까지 가면 밤이 무의미하게 길어지기 때문입니다.
 *
 * randomFn이 [0,1) 밖의 값이나 비수 값을 돌려줘도 비율은 항상 [0.2, 0.6]에 갇힙니다.
 */
function computeEmptyTurnDelayMs(durationMs, randomFn = Math.random) {
    const raw = Number(randomFn())
    const bounded = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0
    return Math.floor(durationMs * (0.2 + bounded * 0.4))
}

/**
 * 이 턴에 적용할 제한시간(ms)을 정합니다. 우선순위는 (1) deps로 명시 주입된 turnDurationMs,
 * (2) 방 설정의 직업별 밤 시간, (3) 방 설정의 전체 nightActionTime, (4) canonical 기본 상수입니다.
 *
 * 직업별 값이 "없을 때만" 전체 값으로 폴백한다는 것이 이 함수의 계약입니다 — 폴백은 조용한
 * 보정이 아니라 명시된 규칙이고, 잘못된 값(범위 밖·비정수)은 애초에 방 생성 검증에서 거부되어
 * 여기까지 오지 않습니다. 설정 값의 단위는 초, 반환 단위는 ms입니다.
 *
 * deadline 계산과 무인 턴 지연(computeEmptyTurnDelayMs)이 모두 이 한 값에서 유도되므로, 직업별
 * 시간을 켜도 "지연 길이만으로 전멸 여부가 새어나가지 않는다"는 기존 불변식이 그대로 유지됩니다.
 */
function resolveNightTurnDurationMs(run, role) {
    if (run.durationMs !== null) return run.durationMs

    const timerSettings = run.session.timerSettings
    const roleSeconds = timerSettings?.roleNightActionTimes?.[role]
    if (Number.isInteger(roleSeconds) && roleSeconds > 0) return roleSeconds * 1000

    const fallbackSeconds = timerSettings?.nightActionTime
    if (Number.isInteger(fallbackSeconds) && fallbackSeconds > 0) return fallbackSeconds * 1000

    return gameSessionCore.NIGHT_TURN_DURATION_MS
}

/** 밤 턴 방송은 참가자 전원이 이미 가입해 있는 세션 channel에 한 번만 보낸다(수신자별로 달라지는 값이 없다). */
function emitNightTurnEvent(run, event, payload) {
    try {
        emitToGameChannel(run.io, run.session, event, payload)
    } catch (err) {
        console.error('[밤 턴 방송 실패]', { code: 'DELIVERY_ERROR', event, gameId: run.session.id })
    }
}

/**
 * 다음 턴으로 넘어갑니다. NIGHT_TURN_ORDER를 다 돌았으면 run을 정리하고 끝냅니다.
 *
 * 시작 방송은 생존 여부와 무관하게 항상 같은 빌더로 같은 시점(턴 진입 직후)에 나가고,
 * deadline도 항상 now + 그 직업에 적용되는 제한시간입니다 — 생존 actor 유무는 오직 "무엇이 이
 * 턴을 끝내는가"에만 영향을 줍니다(무인 턴은 제한시간의 20~60% 무작위 지연, 그 외에는 전원
 * 제출 또는 제한시간 만료).
 *
 * 두 경우 모두 타이머를 정확히 하나 건다 — 어느 쪽도 "타이머가 없는 턴"이 아니므로, 타이머의
 * 존재 여부 자체가 그 역할의 전멸 여부를 알려주는 부채널이 되지 않는다.
 */
function advanceNightTurn(run) {
    const { session } = run
    // F-25(A-05): 종료 방송 중에 이탈 종결·단계 전이·시퀀스 정리가 끼어들 수 있다. 그 뒤에
    // 남은 진행 호출이 새 타이머를 만들거나 지나간 밤을 다시 진행시키지 못하게, **지금의**
    // run 동일성·단계·밤 번호를 여기서 다시 묻는다(정리된 run의 후속 호출은 no-op이다).
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.phase !== 'NIGHT') return
    if (session.dayIndex !== run.nightDayIndex) return
    run.index += 1
    if (run.index >= gameSessionCore.NIGHT_TURN_ORDER.length) {
        // F-25b(AC-03/AC-05): 네 역할이 모두 끝난 밤은 여기서 **자동으로 최종화**된다 — 최종
        // 사망 확정·승패 판정·전적 저장·결과 방송은 전부 그 공통 경계 하나가 소유하므로,
        // 수동 resolve_night와 이 자동 경로가 같은 밤을 두 번 확정할 수 없다.
        stopNightTurnSequence(session.id)
        finalizeNightForSession(run.io, session)
        return
    }

    const role = gameSessionCore.NIGHT_TURN_ORDER[run.index]
    session.nightTurnRole = role
    // 이 역할의 제출 구간이 열렸다. 연출 대기(PRESENTATION_WAIT)는 역할 확정 뒤에야 등록되므로,
    // 그 사이에 도착한 제출·판정 요청은 여기의 단계로 구분된다.
    run.stage = NIGHT_TURN_STAGES.SUBMITTING
    const durationMs = resolveNightTurnDurationMs(run, role)
    const deadline = run.nowFn() + durationMs
    run.deadline = deadline
    emitNightTurnEvent(run, 'night_turn_started', gameSessionCore.buildNightTurnStartedPayload(session, role, deadline))

    if (gameSessionCore.getAliveActorUuidsForRole(session, role).length === 0) {
        run.timerId = run.setTimeoutFn(() => endNightTurn(run, role), computeEmptyTurnDelayMs(durationMs, run.randomFn))
        return
    }

    // 생존 actor가 있는 턴은 제한시간 만료로 끝날 수 있다 — 만료 시점에 아직 제출하지 않은
    // 생존자는 기권(SKIP)으로 기록된다. 그 전에 전원이 제출하면 만료를 기다리지 않고 즉시
    // 끝난다. 진입 시점에 이미 전원 제출된 상태일 수도 있으므로(시퀀서 시작 전에 들어온 제출)
    // 타이머를 건 "뒤에" 한 번 확인한다 — 여기서 턴이 끝나면 endNightTurn이 이 타이머를 해제한다.
    run.timerId = run.setTimeoutFn(() => expireNightTurnWithAbstentions(run, role), durationMs)
    maybeEndNightTurnOnCompletion(session.id)
}

/**
 * 제한시간이 만료된 턴을 닫습니다 — 그 역할의 생존 actor 중 아직 제출하지 않은 사람을 전부
 * 기권(SKIP)으로 기록한 뒤 턴을 끝냅니다.
 *
 * 기권 기록은 game-core의 submitNightAction(targetId: null)을 그대로 통과시킵니다. 서버가
 * nightActions Map을 직접 건드리지 않는 이유는, 그렇게 하면 phase·생존·판정 완료 같은 canonical
 * 가드를 우회한 항목이 밤 판정에 섞일 수 있기 때문입니다 — 이미 판정된 밤이나 사망자에 대한
 * 기권은 core가 거부하고, 이 함수는 그 거부를 그대로 받아들입니다(그 actor는 미제출로 남고
 * 제출 완료 판정도 그 사실을 그대로 반영합니다).
 *
 * 기권을 기록하기 "전에", 이 역할의 생존 actor 중 아직 재접속하지 않은 사람의 유예를 먼저
 * 만료시킵니다 — "밤 자기 턴 중 끊긴 참가자는 그 턴의 제한시간 내에 돌아오지 않으면 사망한다"는
 * 규칙의 deadline이 곧 이 만료 시점이기 때문입니다. 순서가 중요한 이유는 사망이 먼저 확정돼야
 * 그 참가자가 getAliveActorUuidsForRole에서 빠져 "죽은 사람 몫의 기권"이 밤 판정에 남지 않기
 * 때문입니다. 사망 확정이 그 자리에서 턴을 끝내거나(남은 생존자가 이미 제출을 마친 경우) 게임을
 * 끝낼 수 있으므로, 유예 처리 뒤에 두 가드를 다시 확인합니다.
 *
 * 늦게 도착한 타이머가 이미 지나간 턴을 잘못 닫지 않도록 run 동일성과 현재 턴 역할을 먼저
 * 확인합니다(endNightTurn과 같은 가드).
 */
function expireNightTurnWithAbstentions(run, role) {
    const { session } = run
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.nightTurnRole !== role) return
    // F-25: 이미 확정돼 연출 대기로 넘어간 턴에는 기권을 기록하지 않는다(옛 제출 타이머 no-op).
    if (run.stage !== NIGHT_TURN_STAGES.SUBMITTING) return

    for (const graceRun of [...(disconnectGraceRuns.get(session.id)?.values() ?? [])]) {
        if (session.players.get(graceRun.uuid)?.role !== role) continue
        expireDisconnectGrace(graceRun)
    }
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.nightTurnRole !== role) return

    for (const actorUuid of gameSessionCore.getAliveActorUuidsForRole(session, role)) {
        if (session.nightActions.has(actorUuid)) continue
        try {
            gameSessionCore.submitNightAction(actorUuid, session.id, null)
        } catch (err) {
            // 한 명의 기권 기록 실패가 나머지 기권과 턴 진행 자체를 막지 않는다. 로그에는
            // 고정 구조만 남긴다(role은 이미 방송된 공개 정보, uuid는 밤 행동 로그의 기존 관례).
            console.error('[밤 턴 만료 기권 기록 실패]', { code: 'ABSTAIN_ERROR', uuid: actorUuid, gameId: session.id })
        }
    }

    endNightTurn(run, role)
}

/**
 * F-25: 내부 계약의 **깊은 복사**. 보관본과 반환본이 어떤 참조도 공유하지 않게 한다 —
 * 호출자가 받은 값을 변형해도 run의 보관 계약·다음 반환·core의 진행 자료가 오염되지 않는다.
 */
function cloneNightPresentationContract(contract) {
    return {
        version: contract.version,
        gameId: contract.gameId,
        nightDayIndex: contract.nightDayIndex,
        role: contract.role,
        revision: contract.revision,
        step: { ...contract.step },
        healingClosed: contract.healingClosed,
        events: contract.events.map((event) => ({
            eventId: event.eventId,
            type: event.type,
            targetId: event.targetId,
            actorUuids: [...event.actorUuids],
            recipients: event.recipients.map((recipient) => ({
                uuid: recipient.uuid,
                membershipId: recipient.membershipId,
                socketId: recipient.socketId,
                perspectives: [...recipient.perspectives],
            })),
        })),
        recoveryStates: { ...contract.recoveryStates },
    }
}

/**
 * F-25(AC-05): 한 사건의 **수신 대상** 목록을 조립한다(순수 계산).
 *
 * 행위자 목록은 "역할 확정 당시의 유효 행동 근거"(USER)이고, 대상자는 그 사건이 일어난
 * 상대(TARGET)다. 둘 다 `deliverableSocketIdByUuid`와 교차한 뒤에야 수신 대상이 된다 — 그
 * 표가 곧 "지금 이 순간 이 판의 사건을 받을 수 있는 계정"이다.
 *
 * 대상자는 생존으로 거르지 않는다 — 확정 사망한 참가자도 연결과 참여가 유지되면 자기에게
 * 일어난 사건의 수신 대상이다(isEligibleSessionRecipient가 alive를 묻지 않는 이유와 같다).
 * 자기 자신을 치료한 의사처럼 두 자격을 동시에 갖는 계정은 **한 항목**으로 합쳐진다.
 *
 * socket 객체·session·Map 같은 가변 참조는 담지 않는다(식별자와 관점뿐이다).
 */
function buildNightPresentationRecipients(session, deliverableSocketIdByUuid, actorUuids, targetId) {
    const wanted = new Map()
    for (const uuid of actorUuids) {
        if (typeof uuid !== 'string' || uuid.length === 0) continue
        wanted.set(uuid, new Set(['USER']))
    }
    if (typeof targetId === 'string' && targetId.length > 0) {
        const perspectives = wanted.get(targetId) ?? new Set()
        perspectives.add('TARGET')
        wanted.set(targetId, perspectives)
    }

    const recipients = []
    for (const [uuid, perspectives] of wanted) {
        if (!deliverableSocketIdByUuid.has(uuid)) continue
        recipients.push({
            uuid,
            membershipId: session.players.get(uuid)?.membershipId ?? null,
            socketId: deliverableSocketIdByUuid.get(uuid),
            perspectives: NIGHT_PRESENTATION_PERSPECTIVES.filter((perspective) => perspectives.has(perspective)),
        })
    }
    return recipients
}

/**
 * F-25(AC-02/AC-05): 확정된 한 역할의 **내부 연출 계약**을 만든다 — 이 조각이 F-26a에게
 * 남기는 유일한 산출물이다.
 *
 * 입력은 completeNightRole이 돌려준 확정 결과와 core의 진행 자료뿐이고, 어떤 판정도 다시
 * 하지 않는다. KILL/HEAL은 core가 이미 기록한 사건을 그대로 복사하고(의사의 RESOLVED만으로
 * HEAL을 만들지 않는다 — 실제로 회복 대기 중이던 대상을 되살렸을 때만 core가 HEAL을 남긴다),
 * GUARD/WITCH_HUNTER는 확정 step에서 조사·확인 기술자를 만든다. 실패·합의 실패·기권·무역할·
 * 무행위자는 events가 빈 **완료된** 계약을 남긴다.
 *
 * 사건 ID는 게임·밤·역할·확정 revision·역할 내 순번만으로 정한다 — 대상·조사자·결과·수신자
 * 수는 ID에 넣지 않는다. 같은 확정에 대해서는 몇 번을 다시 물어도 같은 ID다.
 *
 * 같은 역할 확정의 계약은 한 번만 만들어 run에 보관하고, 반환은 언제나 깊은 복사다.
 */
function buildNightPresentationContract(run, completed) {
    const { io, session } = run
    const role = completed?.role ?? null
    const revision = completed?.revision ?? null

    const stored = run.contracts.get(role)
    if (stored && stored.revision === revision) return cloneNightPresentationContract(stored)

    const progress = gameSessionCore.getNightProgress(session)
    const step = { ...(completed?.step ?? {}) }

    // 진행 자료는 **살아 있는 내부 자료**다 — 읽는 즉시 복사해 담는다.
    const recoveryStates = {}
    for (const [uuid, state] of progress?.recoveryStates ?? []) recoveryStates[uuid] = state

    const eventType = NIGHT_PRESENTATION_EVENT_TYPE_BY_ROLE[role] ?? null
    const descriptors = []
    if (eventType === 'KILL' || eventType === 'HEAL') {
        for (const event of progress?.events ?? []) {
            if (event?.type !== eventType) continue
            descriptors.push({ type: event.type, targetId: event.targetId ?? null })
        }
    } else if (eventType !== null && step.status === 'RESOLVED' && typeof step.targetId === 'string') {
        descriptors.push({ type: eventType, targetId: step.targetId })
    }

    // 사용자(USER) 자격의 근거는 성공 ACK가 아니라 **역할 확정 시점에 canonical로 저장된
    // 제출**이다. 그래서 기권(null)·미제출은 물론, 기록되지 않는 광대의 동료 지목 no-op도
    // 여기 들어오지 않는다(A-03). 회복 제외는 core의 역할 계산(computeNightRoleStep)과 같은
    // 규칙이고, DOCTOR만 예외인 이유도 같다(공격받은 의사 본인의 자기 치료를 막지 않는다).
    // 다수결·합의 정책 자체는 resolveRoleNightAction이 소유한다 — 여기서 재집계하지 않는다.
    const actorUuids = []
    if (descriptors.length > 0) {
        let submissions = []
        try {
            submissions = gameSessionCore.collectRoleNightSubmissions(session, role)
        } catch (err) {
            console.error('[밤 연출 계약 오류]', { code: 'ACTOR_COLLECT_ERROR', role, gameId: session.id })
        }
        const states = gameSessionCore.NIGHT_RECOVERY_STATES
        for (const submission of submissions) {
            if ((submission?.target ?? null) === null) continue
            if (role !== 'DOCTOR') {
                const state = progress?.recoveryStates?.get(submission.actorUuid)
                if (state === states.PENDING_RECOVERY || state === states.DEATH_CANDIDATE) continue
            }
            if (!actorUuids.includes(submission.actorUuid)) actorUuids.push(submission.actorUuid)
        }
    }

    // "지금 이 순간 이 판의 사건을 받을 수 있는 계정 → 그 canonical 소켓 id". 계약 하나에 대해
    // 한 번만 계산한다 — 사건마다 다시 물으면 같은 확정 안에서도 결과가 갈릴 수 있다.
    //
    // 후보 목록은 계산 시점의 사실이므로(F-23 AC-04) 후보를 구한 **뒤**의 소켓 교체·채널 제외·
    // 이탈을 stillEligibleForDelivery로 다시 묻고, 새 소속을 얻은 계정은 A-12와 같은 축으로
    // 한 번 더 제외한다. 이 결과도 전송 권한을 영구 보증하지 않는다 — 실제 전송 직전의
    // 재확인은 F-26a의 책임이다.
    const deliverableSocketIdByUuid = new Map()
    if (descriptors.length > 0) {
        let candidates = []
        try {
            candidates = resolveSessionParticipantSockets(io, session)
        } catch (err) {
            console.error('[밤 연출 계약 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', role, gameId: session.id })
        }
        for (const candidate of candidates) {
            const uuid = candidate?.data?.user?.uuid ?? null
            if (typeof uuid !== 'string' || uuid.length === 0) continue
            if (deliverableSocketIdByUuid.has(uuid)) continue
            if (!stillEligibleForDelivery(session, candidate)) continue
            if (hasMembershipOutsideSession(session, uuid)) continue
            deliverableSocketIdByUuid.set(uuid, typeof candidate.id === 'string' ? candidate.id : null)
        }
    }

    const contract = {
        version: NIGHT_PRESENTATION_CONTRACT_VERSION,
        gameId: session.id,
        nightDayIndex: run.nightDayIndex,
        role,
        revision,
        step,
        healingClosed: completed?.healingClosed === true,
        events: descriptors.map((descriptor, index) => ({
            eventId: `night-presentation:${session.id}:${run.nightDayIndex}:${role}:${revision}:${index}`,
            type: descriptor.type,
            targetId: descriptor.targetId,
            actorUuids: [...actorUuids],
            recipients: buildNightPresentationRecipients(session, deliverableSocketIdByUuid, actorUuids, descriptor.targetId),
        })),
        recoveryStates,
    }
    run.contracts.set(role, contract)
    return cloneNightPresentationContract(contract)
}

/**
 * F-26a(AC-02/AC-06): 한 수신자에게 보낼 개인 성공 사건 payload를 **명시적 필드 선택**으로
 * 만든다 — contract/event/recipient 어느 것도 그대로 spread하지 않는다.
 *
 * TARGET 전용 허용 키는 정확히 gameId·nightDayIndex·eventId·type·perspectives 다섯이다.
 * targetId는 USER 관점을 가진 수신자에게만 덧붙는다(자기 자신을 지목한 행위자 관점) — TARGET만
 * 가진 수신자는 "누가 자신에게 무엇을 했다"는 사실만 받고, 조사자 신원이나 조사 결과(역할 등)는
 * 이 사건에 애초에 담기지 않는다(그 정보는 기존 night_action_result 경로가 소유한다).
 */
function buildNightSuccessPayload(contract, event, recipient) {
    const payload = {
        gameId: contract.gameId,
        nightDayIndex: contract.nightDayIndex,
        eventId: event.eventId,
        type: event.type,
        perspectives: [...recipient.perspectives],
    }
    if (recipient.perspectives.includes('USER')) payload.targetId = event.targetId
    return payload
}

/**
 * F-26(AC-01/AC-05): 수신 기록에 보관할 **제한된 성공 사건 payload**를 필드별로 복사한다.
 *
 * buildNightSuccessPayload가 만든 그 객체를 그대로 들고 있지 않는다 — 보관본이 전달본과 같은
 * 참조면 전달 뒤의 변형이 복원 자료까지 함께 바꾼다. 허용 키는 전달 payload와 정확히 같고
 * (TARGET 전용은 다섯, USER 관점이 있을 때만 targetId), 모양이 아니면 null이다(fail-closed —
 * 그 기록은 복원 대상이 되지 않는다).
 */
function copyNightSuccessPayload(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
    if (typeof payload.gameId !== 'string' || payload.gameId.length === 0) return null
    if (typeof payload.eventId !== 'string' || payload.eventId.length === 0) return null
    if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return null
    if (typeof payload.type !== 'string' || payload.type.length === 0) return null
    if (!Array.isArray(payload.perspectives) || payload.perspectives.length === 0) return null
    const copy = {
        gameId: payload.gameId,
        nightDayIndex: payload.nightDayIndex,
        eventId: payload.eventId,
        type: payload.type,
        perspectives: [...payload.perspectives],
    }
    if (payload.perspectives.includes('USER')) {
        if (typeof payload.targetId !== 'string' || payload.targetId.length === 0) return null
        copy.targetId = payload.targetId
    }
    return copy
}

/**
 * F-26b(AC-05): 이 session의 완료 수신 보관함에서 (eventId, uuid) 기록을 얻거나 만든다.
 * 이미 있으면(동일 기록) **덮어쓰지 않고** 기존 값을 그대로 돌려준다 — 완료 표식이 재전송으로
 * false로 되돌아가지 않게 한다. 보관함 자체가 없으면(정상 경로에서는 startNightTurnSequence가
 * 항상 먼저 연다) 기록하지 않고 null을 돌려준다 — 내부 부기 실패가 공개 성공 사건 전달을
 * 막지는 않는다.
 *
 * F-26(AC-01/AC-02): 신규 기록은 전달한 그 payload의 **필드별 복사본**을 함께 보관한다 —
 * 재접속 복원(handleGetSessionSnapshot)이 같은 eventId·같은 허용 필드를 다시 만들지 않고 이
 * 보관본만 되돌려주기 위한 유일한 자료다. 기존 기록은 **같은 membershipId일 때만** 이 전달의
 * 것이다(refused=true는 "다른 소속의 기록이므로 전달하지 않는다"는 뜻이다). 같은 소속의 유효한
 * live 재전달은 연결 결속(socket·socketId)만 갱신하고 최초 payload와 completed는 보존한다 —
 * completed를 false로 되돌리는 경로는 어디에도 없다.
 */
function recordNightSuccessReceipt(session, event, recipient, socket, payload = null) {
    const store = nightSuccessReceiptsBySession.get(session)
    if (!store) return { record: null, created: false, refused: false }
    let byUuid = store.byEvent.get(event.eventId)
    if (!byUuid) {
        byUuid = new Map()
        store.byEvent.set(event.eventId, byUuid)
    }
    const existing = byUuid.get(recipient.uuid)
    if (existing) {
        if (existing.membershipId !== recipient.membershipId) {
            return { record: null, created: false, refused: true }
        }
        if (existing.completed !== true && socket) {
            existing.socket = socket
            existing.socketId = typeof socket.id === 'string' ? socket.id : recipient.socketId
        }
        return { record: existing, created: false, refused: false }
    }
    const record = {
        membershipId: recipient.membershipId,
        socketId: recipient.socketId,
        socket,
        completed: false,
        // 복원 자료. 모양이 아니면 null이고, 그 기록은 snapshot 복원에 실리지 않는다.
        payload: copyNightSuccessPayload(payload),
    }
    byUuid.set(recipient.uuid, record)
    return { record, created: true, refused: false }
}

/**
 * emit이 실패했을 때 **그 실패한 연결의 결속만** 푼다(기록 자체는 남긴다).
 *
 * F-26(AC-02): 예전에는 미완료 기록을 통째로 지웠다. 기록에 복원 payload가 들어온 지금 그
 * 삭제는 "전달에 한 번 실패했다"를 "이 사건은 없었다"로 바꾼다 — 그 수신자는 재접속해도
 * 자기 사건을 복원받지 못한다. 그래서 membershipId·제한된 payload·completed=false는 보존하고
 * 연결 결속만 비운다(결속이 없는 기록은 어떤 ACK도 통과시키지 못하고, 다음 정상 조회가
 * 현재 자격을 확인한 뒤 새 연결로 다시 결속한다).
 *
 * 이미 완료된 기록과, 그 사이 **다른 연결이 결속한** 기록은 건드리지 않는다 — 옛 전송 예외가
 * 새 연결의 결속을 지우지 못하게 하는 유일한 근거다.
 */
function discardNightSuccessReceiptIfUncompleted(session, eventId, uuid, failedSocket = null, failedSocketId = null) {
    const byUuid = nightSuccessReceiptsBySession.get(session)?.byEvent.get(eventId)
    const record = byUuid?.get(uuid)
    if (!record || record.completed === true) return
    if (record.socket !== failedSocket) return
    if (record.socketId !== failedSocketId) return
    record.socket = null
    record.socketId = null
}

/**
 * F-26a(AC-01/AC-04/AC-05): F-25 계약이 고정한 사건별 수신자 목록을 소비해 night_action_success를
 * 개별 emit한다.
 *
 * 계약의 수신자 목록은 **계약을 만든 시점의 사실**이다(F-23 AC-04와 같은 이유) — 실제 전송
 * 직전에 io.sockets.sockets에서 계약이 기록한 socketId를 다시 찾아 인증 uuid 일치·canonical
 * 소켓 여부·현재 membershipId 일치·일반 수신 자격·다른 세션 소속 여부를 전부 재검증한다. 하나라도
 * 어긋나면 그 수신자에게는 보내지 않는다 — 앞 수신자의 emit이 다음 수신자를 이 판에서 빼거나
 * 새 소속으로 옮겼을 수 있기 때문이다.
 *
 * 한 사건·한 소켓 쌍은 정확히 한 번만 전달한다(자기 치료처럼 USER·TARGET이 한 recipient
 * 항목으로 이미 합쳐져 있지만, 방어적으로 한 번 더 막는다). 개별 emit 예외는 로그만 남기고
 * 다른 수신자의 전달을 막지 않는다.
 *
 * F-26b(AC-05): 기존 수신자 검사를 모두 통과한 전송 **직전**에 완료 ACK 대조용 기록을 확보한다
 * (동기 전송 대역에서 클라이언트가 같은 동기 구간 안에 완료를 되돌려도 기록이 이미 있게 하기
 * 위함이다). emit이 예외를 던지면 이번에 추가한 기록만 되돌린다.
 */
function emitNightSuccessEvents(run, contract) {
    if (!contract || !Array.isArray(contract.events) || contract.events.length === 0) return
    const { io, session } = run
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.id !== contract.gameId) return
    if (session.dayIndex !== contract.nightDayIndex) return

    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.get !== 'function') return

    const deliveredEventSocketPairs = new Set()

    for (const event of contract.events) {
        for (const recipient of event.recipients ?? []) {
            const dedupeKey = `${event.eventId}:${recipient.socketId}`
            if (deliveredEventSocketPairs.has(dedupeKey)) continue

            if (typeof recipient.socketId !== 'string' || recipient.socketId.length === 0) continue
            const recipientSocket = registry.get(recipient.socketId)
            if (!recipientSocket) continue
            if (recipientSocket.data?.user?.uuid !== recipient.uuid) continue
            if (!isCurrentSocketForUuid(recipient.uuid, recipientSocket, io)) continue
            if ((session.players.get(recipient.uuid)?.membershipId ?? null) !== recipient.membershipId) continue
            if (!stillEligibleForDelivery(session, recipientSocket)) continue
            if (hasMembershipOutsideSession(session, recipient.uuid)) continue

            // F-26(AC-01/AC-02): 기존 자격 검사를 모두 통과한 **뒤에만** 허용 payload를 만들고,
            // 같은 것을 기록에 보관해 재접속 복원이 다시 만들지 않게 한다. 다른 소속의 기록이면
            // 이 전달의 것이 아니므로 보내지 않고(refused), 이미 완료된 기록은 재전송하지 않는다.
            const payload = buildNightSuccessPayload(contract, event, recipient)
            const { record, refused } = recordNightSuccessReceipt(session, event, recipient, recipientSocket, payload)
            if (refused) continue
            if (record && record.completed === true) continue

            deliveredEventSocketPairs.add(dedupeKey)

            // 실패 정리는 "그때 결속한 바로 그 연결"만 푼다 — 그 사이 다른 연결이 결속했다면
            // 이 예외는 그 결속을 건드릴 근거가 없다.
            const boundSocketId = record ? record.socketId : null
            try {
                recipientSocket.emit('night_action_success', payload)
            } catch (err) {
                console.error('[밤 성공 사건 전달 실패]', { code: 'DELIVERY_ERROR', eventId: event.eventId, gameId: session.id })
                discardNightSuccessReceiptIfUncompleted(session, event.eventId, recipient.uuid, recipientSocket, boundSocketId)
            }
        }
    }
}

/**
 * F-25(AC-01): 확정된 역할을 **연출 대기(PRESENTATION_WAIT)** 로 넘긴다.
 *
 * 사건이 있든 없든 모든 완료 역할이 이 전이를 거친다 — 대기 여부 자체가 그 역할의 성공을
 * 알려주는 부채널이 되면 안 되기 때문이다(A-08). 이 단계에서는 제출 타이머가 이미 비워져
 * 있고 session.nightTurnRole도 비워진다(다음 역할은 아직 시작되지 않았다).
 *
 * 돌려주는 토큰은 이 run·이 세션·이 밤·이 역할·이 확정 revision에만 유효한 1회용 열쇠다 —
 * 이전 run이나 이전 밤의 토큰으로는 현재 대기를 닫을 수 없다.
 */
function beginNightPresentationWait(run, completed, contract) {
    const { session } = run
    run.waitSeq += 1
    const token = {
        run,
        session,
        gameId: session.id,
        nightDayIndex: run.nightDayIndex,
        role: completed.role,
        revision: completed.revision ?? null,
        waitId: `${session.id}:${run.nightDayIndex}:${completed.role}:${completed.revision}:${run.waitSeq}`,
        contract,
    }
    run.stage = NIGHT_TURN_STAGES.PRESENTATION_WAIT
    run.wait = token
    session.nightTurnRole = null
    return token
}

/**
 * F-25(AC-01): 연출 대기를 닫고 다음 역할로 넘어간다.
 *
 * 이번 조각의 해제는 **같은 동기 호출 안의 즉시 통과**다 — 클라이언트의 재생 완료 판정이
 * 아니다. 실제 대기·상한·해제 조건은 F-27a가 구현한다.
 *
 * 대기를 **먼저** 닫은 뒤에 진행한다 — 그래야 같은 토큰으로 두 번 들어와도 두 번째는 아무
 * 것도 하지 않는다. run·세션·게임·밤·역할·토큰 중 하나라도 어긋나면 no-op이다(이탈 종결이
 * 종료 방송 중에 run을 정리했다면 그 정리가 먼저 끝나고 이 호출은 지나간다).
 */
function releaseNightPresentationWait(run, token) {
    if (!run || !token) return false
    if (token.run !== run) return false
    const { session } = run
    if (token.session !== session) return false
    if (nightTurnRuns.get(session.id) !== run) return false
    if (token.gameId !== session.id) return false
    if (token.nightDayIndex !== run.nightDayIndex) return false
    if (session.phase !== 'NIGHT') return false
    if (session.dayIndex !== run.nightDayIndex) return false
    if (run.stage !== NIGHT_TURN_STAGES.PRESENTATION_WAIT) return false
    if (run.wait !== token) return false

    run.wait = null
    run.stage = NIGHT_TURN_STAGES.IDLE
    advanceNightTurn(run)
    return true
}

/** 그 판이 지금 내부 연출 대기 중인가(제출·수동 판정·최종화가 공유하는 단일 질문). */
function isNightPresentationWaitActive(gameId) {
    const run = nightTurnRuns.get(gameId)
    return !!run && run.stage === NIGHT_TURN_STAGES.PRESENTATION_WAIT
}

/**
 * 지정한 역할의 턴을 끝내고 종료를 방송한 뒤 다음 턴으로 넘어갑니다. role 인자는 "이 종료
 * 요청이 어느 턴에 대한 것인지"를 명시해, 이미 지나간 턴의 늦게 도착한 타이머가 현재 턴을
 * 잘못 끝내는 것을 막습니다.
 *
 * F-25: 역할 확정 → 내부 연출 계약 구성 → 연출 대기 등록 → 기존 종료 방송 → 즉시 통과 순으로
 * 진행합니다. 방송 중에 도착한 재진입(중복 종료·다음 역할 제출·수동 판정·이탈 종결)은 전부
 * 이 대기 단계에서 끊깁니다.
 */
function endNightTurn(run, role) {
    const { session } = run
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.nightTurnRole !== role) return
    // 이미 연출 대기로 넘어간 턴은 다시 닫지 않는다(종료 방송 중의 중복 호출 차단).
    if (run.stage !== NIGHT_TURN_STAGES.SUBMITTING) return

    // F-25b(AC-01/A-06): 그 역할의 결과·사건·완료 표식을 **방송과 다음 턴 진행보다 먼저**
    // canonical 상태에 기록한다. 의사 턴이면 이 호출이 이번 밤의 치료 가능성을 닫지만,
    // canonical alive는 바꾸지 않는다 — 최종 사망은 밤 전체가 끝난 뒤 한 번만 확정된다.
    let completed
    try {
        completed = gameSessionCore.completeNightRole(session, role)
    } catch (err) {
        completed = { ok: false, code: 'ROLE_COMPLETE_UNEXPECTED_ERROR' }
    }
    if (!completed.ok) {
        // 기록에 실패하면 종료 방송도 다음 역할 진행도 하지 않는다 — 기록되지 않은 역할을
        // 건너뛴 채 밤이 최종화되면 그 밤의 집계가 조용히 어긋난다.
        console.error('[밤 역할 확정 실패]', { code: completed.code, role, gameId: session.id })
        return
    }

    // F-25(AC-02/AC-05): 확정 직후·종료 방송 **전에** 그 역할의 사건과 수신 대상을 고정한다.
    // 계약 구성 자체는 canonical 상태를 전혀 바꾸지 않는다.
    let contract = null
    try {
        contract = buildNightPresentationContract(run, completed)
    } catch (err) {
        console.error('[밤 연출 계약 오류]', { code: 'CONTRACT_BUILD_ERROR', role, gameId: session.id })
    }

    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    run.deadline = null

    const wait = beginNightPresentationWait(run, completed, contract)
    // F-26a(AC-01/AC-06): 역할별 성공 연출은 공개 종료 방송보다 먼저, 확정된 바로 그 계약으로
    // 전달한다 — 계약 구성 실패(contract === null)는 이 조각을 조용히 건너뛰고 기존 종료 진행은
    // 그대로 이어간다(공개 턴 계약을 F-26a 실패가 막지 않는다).
    if (contract) {
        try {
            emitNightSuccessEvents(run, contract)
        } catch (err) {
            console.error('[밤 성공 사건 전달 오류]', { code: 'SUCCESS_EVENT_ERROR', role, gameId: session.id })
        }
    }
    emitNightTurnEvent(run, 'night_turn_ended', gameSessionCore.buildNightTurnEndedPayload(session, role))
    releaseNightPresentationWait(run, wait)
}

/**
 * 진행 중인 턴이 "그 역할 생존자 전원 제출"로 끝났는지 확인하고, 끝났으면 제한시간을 기다리지
 * 않고 즉시 종료시킵니다. 진행 중인 run이 없으면 아무 것도 하지 않습니다(no-op).
 */
function maybeEndNightTurnOnCompletion(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run) return
    const role = gameSessionCore.getCurrentNightTurnRole(run.session)
    if (role === null) return
    // 생존 actor가 없는 턴은 공집합이라 isRoleTurnComplete가 항상 참이다. 그 턴을 여기서 즉시
    // 끝내면 종료 타이밍이 곧 전멸 신호가 되므로, 무인 턴은 오직 무작위 지연 타이머만이 끝낸다.
    if (gameSessionCore.getAliveActorUuidsForRole(run.session, role).length === 0) return
    if (!gameSessionCore.isRoleTurnComplete(run.session, role)) return
    endNightTurn(run, role)
}

/**
 * 한 밤의 턴 시퀀스를 시작합니다 — NIGHT_TURN_ORDER 순서대로 턴마다 night_turn_started를
 * 방송하고, 각 턴이 끝날 때 night_turn_ended를 방송한 뒤 다음 턴으로 넘어갑니다.
 *
 * deps로 randomFn(무인 턴 지연)·nowFn(deadline)·setTimeoutFn/clearTimeoutFn(타이머)을 주입할 수
 * 있습니다. production 기본값은 각각 Math.random·Date.now·setTimeout·clearTimeout입니다.
 * turnDurationMs를 주면 모든 턴이 그 길이를 쓰고, 주지 않으면 턴마다 그 직업에 적용되는
 * 길이를 세션 설정에서 유도합니다(resolveNightTurnDurationMs).
 *
 * 같은 세션에 이미 시퀀스가 돌고 있으면 두 번째 호출은 기존 run을 그대로 돌려주고 아무 것도
 * 다시 시작하지 않습니다(멱등) — 턴이 중복 방송되거나 타이머가 두 벌 걸리지 않습니다.
 */
function startNightTurnSequence(io, session, deps = {}) {
    if (!session || session.phase !== 'NIGHT') return null
    expireDisconnectGracesAtPhaseBoundary(session)
    if (session.phase !== 'NIGHT') return null
    const existing = nightTurnRuns.get(session.id)
    if (existing) return existing

    // F-26b(AC-05): 이 밤의 완료 수신 보관함을 연다. 같은 밤(같은 nightDayIndex)의 run
    // 재생성은 기존 완료 기록을 보존하고, 다른 밤의 잔존 보관함은 여기서 통째로 교체한다.
    const storedReceipts = nightSuccessReceiptsBySession.get(session)
    if (!storedReceipts || storedReceipts.nightDayIndex !== session.dayIndex) {
        nightSuccessReceiptsBySession.set(session, { nightDayIndex: session.dayIndex, byEvent: new Map() })
    }

    const run = {
        io,
        session,
        index: -1,
        timerId: null,
        deadline: null,
        // F-25: 이 run이 진행하는 **밤 번호**. 확정으로 dayIndex가 오른 뒤 도착한 늦은 타이머·
        // 대기 토큰이 새 밤을 진행시키지 못하게 하는 유일한 근거다.
        nightDayIndex: session.dayIndex,
        // F-25: 내부 진행 단계와 현재 연출 대기 토큰(공개 payload·snapshot에는 실리지 않는다).
        stage: NIGHT_TURN_STAGES.IDLE,
        wait: null,
        waitSeq: 0,
        // 역할 → 그 역할 확정의 내부 연출 계약 보관본. 반환은 언제나 깊은 복사다.
        contracts: new Map(),
        randomFn: deps.randomFn ?? Math.random,
        nowFn: deps.nowFn ?? Date.now,
        setTimeoutFn: deps.setTimeoutFn ?? setTimeout,
        clearTimeoutFn: deps.clearTimeoutFn ?? clearTimeout,
        // null이면 "명시 주입 없음" — 턴마다 세션 설정에서 그 직업의 길이를 유도한다.
        durationMs: deps.turnDurationMs ?? null,
    }
    nightTurnRuns.set(session.id, run)
    // F-25b: 이 밤이 순차 진행 중임을 canonical 상태에 표시한다 — 아직 아무 역할도 끝나지
    // 않은 순차 밤에 들어온 resolve_night가 미완료 역할을 건너뛰고 확정해 버리지 않도록,
    // 첫 턴 진입(advanceNightTurn)보다 먼저 세운다. 유예 만료로 세션이 이미 NIGHT를 벗어난
    // 경우는 위 가드에서 걸러졌고, core도 현재 phase를 다시 확인한다.
    gameSessionCore.markNightSequenced(session)
    advanceNightTurn(run)
    return run
}

/** 진행 중인 턴 시퀀스를 중단하고 세션에서 턴 상태를 지웁니다(대기 중인 타이머도 해제). */
function stopNightTurnSequence(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run) return
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    run.deadline = null
    // F-25: 대기 토큰과 단계를 무효화한다 — 정리된 run으로 들어온 늦은 해제 호출은 no-op이다.
    run.wait = null
    run.stage = NIGHT_TURN_STAGES.STOPPED
    nightTurnRuns.delete(gameId)
    delete run.session.nightTurnRole
}

// gameId → 진행 중인 낮 페이즈 타이머 run. nightTurnRuns와 짝이 되는 구조이며 세션당 최대
// 하나만 존재한다. 밤 턴 run과 별도의 Map인 이유는 두 타이머의 수명이 겹치지 않기 때문이다 —
// 낮 타이머는 phase가 DAY인 동안만, 밤 턴 타이머는 NIGHT인 동안만 산다.
const dayPhaseRuns = new Map()

/** 낮 하위 구간 전이는 참가자 전원이 이미 가입해 있는 세션 channel에 한 번만 방송한다. */
function emitDayPhaseEvent(run, event, payload) {
    try {
        emitToGameChannel(run.io, run.session, event, payload)
    } catch (err) {
        console.error('[낮 페이즈 방송 실패]', { code: 'DELIVERY_ERROR', event, gameId: run.session.id })
    }
}

/**
 * 예약 시점의 낮 상태가 지금도 그대로인지 확인합니다. 만료 콜백은 이 검사를 통과할 때만
 * 진행합니다 — 조기 전이·재투표·판정으로 상태가 이미 바뀐 뒤 도착한 타이머가 다음 구간을
 * 잘못 끝내는 것을 막습니다(endNightTurn의 role 대조와 같은 역할).
 */
function matchesScheduledDayState(run) {
    const { session } = run
    if (session.phase !== 'DAY') return false
    if (session.dayIndex !== run.scheduledFor.dayIndex) return false
    if (gameSessionCore.getDayPhase(session) !== run.scheduledFor.dayPhase) return false
    return gameSessionCore.getDayVoteRound(session) === run.scheduledFor.round
}

/**
 * 현재 낮 상태에 맞는 타이머를 새로 겁니다(이미 걸린 타이머는 해제합니다). 세션이 낮을 벗어나
 * 있으면 run 자체를 정리합니다 — 낮이 아닌 동안에는 낮 타이머가 존재하지 않는다는 것이
 * 이 구조의 불변식입니다.
 */
function scheduleDayPhaseTimer(run) {
    const { session } = run
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    if (session.phase !== 'DAY') {
        stopDayPhaseTimer(session.id)
        return
    }

    const dayPhase = gameSessionCore.getDayPhase(session)
    const isVote = dayPhase === gameSessionCore.DAY_PHASES.VOTE
    const durationMs = isVote ? run.voteDurationMs : run.discussionDurationMs
    run.scheduledFor = {
        dayIndex: session.dayIndex,
        dayPhase,
        round: gameSessionCore.getDayVoteRound(session),
    }
    run.deadline = run.nowFn() + durationMs
    run.timerId = run.setTimeoutFn(
        isVote ? () => expireDayVoteWithAbstentions(run) : () => expireDayDiscussion(run),
        durationMs,
    )
}

/**
 * dayDiscussionTime 만료 — 토론을 닫고 DAY_VOTE를 엽니다. 전이 자체는 "전원 준비"와 동일한
 * canonical mutation(enterDayVotePhase) 하나만 쓰고, 방송도 같은 이벤트·같은 빌더를 씁니다
 * (자동 전환과 수동 전환이 클라이언트에게 구별되지 않아야 합니다). 전이 직후 곧바로 투표
 * 제한시간을 겁니다.
 */
function expireDayDiscussion(run) {
    const { session } = run
    if (dayPhaseRuns.get(session.id) !== run) return
    if (!matchesScheduledDayState(run)) return

    try {
        gameSessionCore.enterDayVotePhase(session)
    } catch (err) {
        console.error('[낮 토론 만료 처리 실패]', { code: 'TRANSITION_ERROR', gameId: session.id })
        return
    }

    emitDayPhaseEvent(run, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session))
    scheduleDayPhaseTimer(run)
}

/**
 * dayVoteTime 만료 — 아직 투표하지 않은 생존자를 기권으로 기록한 뒤, 수동 판정(resolve_day_vote)과
 * 정확히 같은 경로(prepareDayVoteResolution → commitDayVoteResolution → day_vote_resolved 방송)로
 * 그 낮을 해소합니다. 그래서 재투표(REVOTE)·재판(TRIBUNAL)·밤(TIE/ABSTAINED) 중 어디로 가는지는
 * 이 함수가 아니라 기존 판정 규칙이 정합니다.
 *
 * 기권 기록도 game-core의 submitDayVote(targetId: null)를 그대로 통과시킵니다 —
 * expireNightTurnWithAbstentions와 같은 이유로, canonical 가드를 우회한 표를 집계에 넣지
 * 않기 위함입니다.
 *
 * 판정 요청자로는 참가자 uuid 하나를 씁니다(누구를 고르든 결과가 같은 계산이고, prepare가
 * registry 일관성을 확인할 대상이 필요할 뿐입니다). REVOTE면 다음 라운드의 투표 제한시간을
 * 다시 걸고, 그 외에는 phase가 DAY를 벗어나므로 run이 정리됩니다.
 */
function expireDayVoteWithAbstentions(run) {
    const { session } = run
    if (dayPhaseRuns.get(session.id) !== run) return
    if (!matchesScheduledDayState(run)) return

    for (const voterUuid of gameSessionCore.getEligibleDayVoterUuids(session)) {
        if (session.dayVotes.has(voterUuid)) continue
        try {
            gameSessionCore.submitDayVote(voterUuid, session.id, null)
        } catch (err) {
            console.error('[낮 투표 만료 기권 기록 실패]', { code: 'ABSTAIN_ERROR', uuid: voterUuid, gameId: session.id })
        }
    }

    const requesterUuid = session.players.keys().next().value
    let prepared
    try {
        prepared = gameSessionCore.prepareDayVoteResolution(requesterUuid, session.id, session.dayIndex)
    } catch (err) {
        console.error('[낮 투표 만료 판정 실패]', { code: 'PREPARE_UNEXPECTED_ERROR', gameId: session.id })
        return
    }
    if (!prepared.ok) {
        console.error('[낮 투표 만료 판정 실패]', { code: prepared.code, gameId: session.id })
        return
    }
    // 만료와 수동 판정이 거의 동시에 도착해 이미 판정된 경우다 — 재commit·재방송하지 않고,
    // 타이머만 현재 상태에 맞춰 다시 건다(수동 판정 경로가 하는 일과 같다).
    if (prepared.alreadyResolved) {
        scheduleDayPhaseTimer(run)
        return
    }

    let committed
    try {
        committed = gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[낮 투표 만료 판정 실패]', { code: 'COMMIT_ERROR', gameId: session.id })
        return
    }
    if (!committed.ok) {
        console.error('[낮 투표 만료 판정 실패]', { code: committed.code, gameId: session.id })
        return
    }

    const resolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(session, prepared.resolution)
    let recipients = []
    try {
        recipients = resolveSessionParticipantSockets(run.io, session)
    } catch (err) {
        console.error('[낮 투표 만료 판정 실패]', { code: 'RECIPIENT_RESOLVE_ERROR', gameId: session.id })
    }
    for (const recipientSocket of recipients) {
        if (!stillEligibleForDelivery(session, recipientSocket)) continue
        try {
            recipientSocket.emit('day_vote_resolved', resolvedPayload)
        } catch (err) {
            console.error('[낮 투표 만료 판정 실패]', { code: 'DELIVERY_ERROR', gameId: session.id })
        }
    }

    syncSessionPhaseTimers(run.io, session)
}

/**
 * 이 세션의 낮 타이머를 현재 상태(DAY_DISCUSSION / DAY_VOTE)에 맞춰 겁니다. 이미 돌고 있는
 * run이 있으면 그 run의 deps를 유지한 채 다시 걸고, 없으면 새로 만듭니다 — 호출자는 전부
 * "낮 상태가 방금 바뀐" 지점(최초 DAY 진입·투표 개시·밤 판정 후 새 낮·재투표 개시)이므로,
 * 다시 거는 것이 곧 새 구간의 제한시간을 시작하는 것입니다.
 *
 * 세션이 낮이 아니면 아무 타이머도 걸지 않고 기존 run을 정리합니다(재판·밤·종료로 넘어간
 * 낮의 타이머가 남아 나중에 발화하는 일을 막습니다).
 *
 * deps로 nowFn·setTimeoutFn·clearTimeoutFn과 discussionDurationMs·voteDurationMs를 주입할 수
 * 있습니다 — 주입하지 않으면 각각 Date.now·setTimeout·clearTimeout과 세션 설정
 * (timerSettings.dayDiscussionTime/dayVoteTime, 초 단위)을 쓰고, 설정도 없으면 game-core의
 * 기본 상수로 폴백합니다.
 */
function startDayPhaseTimer(io, session, deps = {}) {
    if (!session) return null
    expireDisconnectGracesAtPhaseBoundary(session)
    if (session.phase !== 'DAY') {
        stopDayPhaseTimer(session.id)
        return null
    }

    let run = dayPhaseRuns.get(session.id)
    if (!run) {
        const timerSettings = session.timerSettings
        const secondsToMs = (seconds, fallbackMs) =>
            Number.isInteger(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs
        run = {
            io,
            session,
            timerId: null,
            deadline: null,
            scheduledFor: null,
            nowFn: deps.nowFn ?? Date.now,
            setTimeoutFn: deps.setTimeoutFn ?? setTimeout,
            clearTimeoutFn: deps.clearTimeoutFn ?? clearTimeout,
            discussionDurationMs:
                deps.discussionDurationMs ??
                secondsToMs(timerSettings?.dayDiscussionTime, gameSessionCore.DAY_DISCUSSION_DURATION_MS),
            voteDurationMs:
                deps.voteDurationMs ?? secondsToMs(timerSettings?.dayVoteTime, gameSessionCore.DAY_VOTE_DURATION_MS),
        }
        dayPhaseRuns.set(session.id, run)
    }

    scheduleDayPhaseTimer(run)
    return dayPhaseRuns.get(session.id) ?? null
}

/** 진행 중인 낮 페이즈 타이머를 중단합니다(대기 중인 타이머도 해제). stopNightTurnSequence의 짝. */
function stopDayPhaseTimer(gameId) {
    const run = dayPhaseRuns.get(gameId)
    if (!run) return
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    dayPhaseRuns.delete(gameId)
}

/**
 * canonical phase가 바뀐 직후 두 종류의 타이머를 한 곳에서 동기화합니다. DAY에서는 낮 타이머만,
 * NIGHT에서는 밤 턴 시퀀스만 유지하고, 그 밖의 phase(TRIBUNAL/ENDED)에서는 둘 다 정리합니다.
 * startNightTurnSequence가 세션별 멱등이므로 거의 동시에 도착한 경로가 중복 호출해도 턴은 한 번만
 * 시작됩니다.
 */
function syncSessionPhaseTimers(io, session) {
    if (!session) return null
    expireDisconnectGracesAtPhaseBoundary(session)

    if (session.phase === 'DAY') {
        stopNightTurnSequence(session.id)
        return startDayPhaseTimer(io, session)
    }

    stopDayPhaseTimer(session.id)
    if (session.phase === 'NIGHT') {
        return startNightTurnSequence(io, session)
    }

    stopNightTurnSequence(session.id)
    return null
}

// gameId → Map<uuid, run> — 진행 중인 재접속 유예 타이머. 한 세션에서 여러 명이 동시에 끊길 수
// 있으므로 세션당 하나가 아니라 (세션, 참가자)당 하나다. nightTurnRuns/dayPhaseRuns와 같은
// 구조를 쓰는 이유도 같다 — 늦게 도착한 만료 콜백을 run 동일성 하나로 거를 수 있어야 한다.
const disconnectGraceRuns = new Map()

/** (gameId, uuid)의 진행 중인 유예 run. 없으면 undefined. */
function getDisconnectGraceRun(gameId, uuid) {
    return disconnectGraceRuns.get(gameId)?.get(uuid)
}

/** run을 registry에서 떼어내고 대기 중인 타이머를 해제한다(취소·만료가 공유하는 유일한 정리 경로). */
function detachDisconnectGraceRun(gameId, uuid, run) {
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    const pending = disconnectGraceRuns.get(gameId)
    if (!pending) return
    pending.delete(uuid)
    if (pending.size === 0) disconnectGraceRuns.delete(gameId)
}

/**
 * 진행 중인 세션에서 참가자가 끊겼을 때 세션을 종료하는 대신 재접속 유예를 겁니다. 유예가
 * 만료될 때까지 재접속하지 않으면 그 참가자만 사망으로 확정되고, 나머지 참가자의 게임은
 * 그대로 이어집니다(어떤 타이머도 여기서 멈추지 않습니다).
 *
 * 자기 NIGHT 턴이면 이미 방송된 절대 deadline까지의 "남은 시간"만 기다린다. 그 외에는 별도
 * 시계를 만들지 않고 끊긴 시점의 top-level phase가 끝날 때 만료한다. 이로써 낮 하위 구간
 * 전환이나 다른 역할의 밤 턴이 유예를 임의로 늘리거나 줄이지 않는다.
 *
 * 같은 (세션, 참가자)에 이미 유예가 걸려 있으면 기존 run을 그대로 돌려주고 타이머를 다시 걸지
 * 않습니다(멱등) — 낡은 소켓의 지연 disconnect가 뒤늦게 도착해도 유예가 연장되지 않습니다.
 */
function beginDisconnectGrace(io, session, uuid, deps = {}) {
    const existing = getDisconnectGraceRun(session.id, uuid)
    if (existing) return existing

    const nightRun = nightTurnRuns.get(session.id)
    const currentRole = gameSessionCore.getCurrentNightTurnRole(session)
    const playerRole = session.players.get(uuid)?.role
    const isOwnNightTurn =
        session.phase === 'NIGHT' &&
        currentRole !== null &&
        currentRole === playerRole &&
        nightRun?.deadline !== null &&
        nightRun?.deadline !== undefined
    const nowFn = deps.nowFn ?? nightRun?.nowFn ?? Date.now

    const run = {
        io,
        session,
        uuid,
        timerId: null,
        phaseAtDisconnect: session.phase,
        deadline: isOwnNightTurn ? nightRun.deadline : null,
        nowFn,
        setTimeoutFn: deps.setTimeoutFn ?? setTimeout,
        clearTimeoutFn: deps.clearTimeoutFn ?? clearTimeout,
    }
    let pending = disconnectGraceRuns.get(session.id)
    if (!pending) {
        pending = new Map()
        disconnectGraceRuns.set(session.id, pending)
    }
    pending.set(uuid, run)
    if (isOwnNightTurn) {
        const remainingMs = Math.max(0, run.deadline - run.nowFn())
        run.timerId = run.setTimeoutFn(() => expireDisconnectGrace(run), remainingMs)
    }
    return run
}

/** 끊긴 시점의 top-level phase를 벗어난 유예만 만료한다(DAY 하위 구간 변경은 제외). */
function expireDisconnectGracesAtPhaseBoundary(session) {
    const pending = disconnectGraceRuns.get(session.id)
    if (!pending) return
    for (const run of [...pending.values()]) {
        if (run.phaseAtDisconnect === session.phase) continue
        expireDisconnectGrace(run)
    }
}

/**
 * 재접속한 참가자의 유예를 취소합니다(대기 중인 타이머도 해제). 취소와 만료가 같은 registry
 * 항목(run 동일성)을 놓고 경쟁하므로, 둘 중 먼저 도착한 쪽이 run을 떼어내고 나중에 도착한
 * 쪽은 자기 run이 더 이상 registry에 없다는 사실만으로 조용히 no-op이 됩니다 — 이것이
 * "재접속과 만료가 동시에 일어나도 중복 사망하지 않는다"의 소켓 계층 절반입니다(나머지 절반은
 * game-core의 commitDisconnectElimination이 구조적으로 보장합니다).
 *
 * 진행 중인 유예가 없으면 아무 것도 하지 않습니다(no-op) — 유예 없이 재접속한 참가자, 이미
 * 만료된 참가자, 애초에 게임에 없던 uuid가 모두 같은 경로로 안전하게 통과합니다.
 */
function cancelDisconnectGrace(gameId, uuid) {
    const run = getDisconnectGraceRun(gameId, uuid)
    if (!run) return false
    detachDisconnectGraceRun(gameId, uuid, run)
    return true
}

/**
 * 유예가 만료된 참가자의 사망을 확정하고, 그 결과를 방송한 뒤 진행 중인 타이머·턴을 새 생존
 * 집합에 맞춰 다시 동기화합니다.
 *
 * 가드 순서(뒤 단계는 앞 단계를 통과해야만 평가됩니다):
 *   1. run 동일성 — 이미 취소·만료된 run의 늦게 도착한 타이머는 여기서 걸린다.
 *   2. 실제 재접속 여부(isUuidConnected) — 취소보다 만료가 근소하게 먼저 도착한 경우에도
 *      "지금 연결돼 있는 사람"은 절대 죽이지 않는다.
 *   3. game-core 재검증(getDisconnectGraceTarget) — 그 사이 세션이 끝났거나 registry에서
 *      사라졌거나 이미 배제된 경우를 한 번에 거른다.
 * 세 가드를 모두 통과해도 commitDisconnectElimination이 다시 한 번 멱등성을 보장하므로,
 * 중복 사망은 어느 한 가드의 정확성에 기대지 않는다.
 *
 * 사망을 방송한 뒤의 뒷정리는 승자 확정 여부로 갈린다 — 승리로 끝났으면 두 타이머를 모두
 * 정리하고, 그렇지 않으면 진행 중이던 구간의 타이머는 그대로 두고 밤 턴 완료만 다시 확인한다.
 */
function expireDisconnectGrace(run) {
    const { io, session, uuid } = run
    if (getDisconnectGraceRun(session.id, uuid) !== run) return
    detachDisconnectGraceRun(session.id, uuid, run)

    if (isUuidConnected(io, uuid)) return
    const target = gameSessionCore.getDisconnectGraceTarget(uuid, session.id)
    if (!target || target.session !== session) return

    // F-21(AC-03/AC-05): 사망 확정·공개 사건·종결 저장·타이머 정리는 이제 추방·명시적 이탈과
    // **같은 경계**가 소유한다. 예전에는 이 함수가 그 전부를 직접 적고 있었고, 그래서 나중에
    // 생긴 추방 경로가 같은 일을 다시 적으면 두 경로의 사망·전적이 조용히 갈릴 수 있었다.
    applyParticipantDeparture(io, session, uuid, { reason: 'DISCONNECT_GRACE_EXPIRED' })
}

/**
 * F-21(AC-03): **수신자 본인의** 제출 상태를 개인 전송한다(session_self_progress).
 *
 * 두 자리에서 부른다:
 *   1. 이탈 직후 — 표적이 사라진 표가 기권으로 정규화됐다는 사실을 각자에게 알린다.
 *   2. **평범한 제출 직후** — 이것이 없으면 이탈 이후의 화면이 영영 미제출로 남는다. 서버가
 *      마지막으로 말한 본인 값이 이탈 당시의 `false`이고, 그 뒤의 제출은 로컬 ACK로만
 *      존재하기 때문이다(화면은 서버 값이 있으면 그것을 canonical로 쓴다 — 그래야 늦은
 *      ACK가 정규화를 되돌리지 못한다). 제출이 서버 값을 갱신하지 않으면 그 두 계약이
 *      서로를 무력화한다: 투표는 커밋됐는데 화면은 "아직 안 냄"이고 버튼은 다시 눌린다.
 *
 * 순서값(selfProgressSeq)을 함께 싣는다 — 제출은 참여 세대를 올리지 않으므로 세대만으로는
 * 이탈 당시의 값과 그 뒤의 제출을 구별할 수 없다.
 *
 * 공개 방송에 본인 값을 실을 수는 없다(누가 누구를 찍었는지가 드러난다). 통지마다 격리한다 —
 * 한 수신자의 전달 실패가 나머지를 막지 않는다. 절대 던지지 않는다.
 *
 * @param {string|null} [onlyUuid] - 주면 그 한 명에게만 보낸다(자기 제출 직후의 갱신).
 */
function emitSelfSubmissionProgress(io, session, onlyUuid = null) {
    if (!session || !(session.players instanceof Map)) return
    let seq = null
    let progress = null
    try {
        seq = gameSessionCore.bumpSelfProgressSeq(session)
        progress = gameSessionCore.buildPublicPhaseProgress(session)
    } catch (err) {
        console.error('[개인 진행 상태 전송 실패]', {
            code: 'SELF_PROGRESS_BUILD_ERROR', gameId: session.id,
        })
        return
    }
    const participationRevision = Number.isSafeInteger(session.participationRevision)
        ? session.participationRevision
        : 0

    for (const player of session.players.values()) {
        if (onlyUuid !== null && player.uuid !== onlyUuid) continue
        // 이미 빠진 참가자에게는 이 판의 개인 상태를 더 보내지 않는다.
        if (player.isParticipating === false) continue
        const targetSocket = getSocketForUuid(io, player.uuid)
        if (!targetSocket) continue
        // F-23(AC-04): 개인 진행 상태도 같은 자격 경계를 **전송 시점에** 다시 통과해야 한다 —
        // canonical 소켓이더라도 그 판의 채널을 잃었거나 전달에서 배제된 연결이면 보내지 않는다.
        if (!isEligibleSessionRecipient(session, targetSocket, player.uuid)) continue
        try {
            targetSocket.emit('session_self_progress', {
                gameId: session.id,
                phase: session.phase,
                dayIndex: session.dayIndex,
                participationRevision,
                selfProgressSeq: seq,
                progress,
                self: gameSessionCore.buildSelfSubmissionFields(session, player.uuid),
            })
        } catch (err) {
            console.error('[개인 진행 상태 전송 실패]', {
                code: 'SELF_PROGRESS_DELIVERY_ERROR', uuid: player.uuid, gameId: session.id,
            })
        }
    }
}

/**
 * F-21(AC-03/AC-05): 방장 추방 · 진행 중 명시적 이탈 · 재접속 유예 만료가 **공유하는** 이탈
 * 처리 경계다. core의 commitParticipantDeparture로 개인 전이를 끝낸 뒤, 그 결과에 따라 공개
 * 사건·단계 진행·타이머·종결 저장을 연결한다.
 *
 * 세 경로를 한 함수로 묶는 이유는 AC-03 그 자체다 — 추방과 일반 이탈의 사망·전적·보상이
 * 같아야 한다는 요구는, 두 경로가 **같은 코드**를 지날 때만 구조적으로 보장된다.
 *
 * 커밋 이후의 통지는 각각 독립된 try 블록에 둔다. 하나가 던져도 나머지 통지와 타이머 정리가
 * 막히지 않아야, 서버가 확정한 상태와 클라이언트가 보는 상태의 어긋남이 한 곳에 몰리지 않는다.
 *
 * @returns core 결과 그대로(실패면 {ok:false, code}). 호출자는 이 값으로 ACK를 만든다.
 */
function applyParticipantDeparture(io, session, uuid, { reason = 'PARTICIPANT_LEFT', onCommitted = null } = {}) {
    let applied
    try {
        applied = gameSessionCore.commitParticipantDeparture(session, uuid, { reason })
    } catch (err) {
        // 로그에는 고정 구조만 남긴다(밤 턴 만료 기권 기록 실패와 같은 관례 — 원본 Error와
        // role은 남기지 않는다). 커밋이 실패했다는 것은 아무 상태도 바뀌지 않았다는 뜻이다.
        console.error('[참가자 이탈 처리 실패]', { code: 'COMMIT_ERROR', uuid, gameId: session?.id })
        return { ok: false, code: 'INTERNAL_ERROR' }
    }
    if (!applied.ok) return applied

    // ── 0) 커밋 직후의 결정 기록 — 여기까지 await·emit이 하나도 없다 ─────────────
    //
    // F-21(공통 커밋·통지 경계): "상태 변경과 영수증 결정 사이에는 await·외부 callback·emit을
    // 두지 않는다". 추방은 이 훅에서 영수증을 확정한다 — 아래 방송·저장·타이머 중 하나가
    // 던져도, 서버가 이미 확정한 제거가 기록되지 않은 채 남아 원 요청자가 결과를 영영 알 수
    // 없게 되는 상태가 생기지 않는다. 훅 자체의 예외는 격리하되 커밋을 되돌리지 않는다.
    if (typeof onCommitted === 'function') {
        try {
            onCommitted(applied)
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'COMMIT_HOOK_ERROR', uuid, gameId: session.id })
        }
    }

    // 이탈로 분모가 줄어든 낮 투표/재판이면 그 사실을 기록한다. 이탈 직후의 재평가(아래
    // advancePhaseAfterDeparture)로 끝나지 않으면, **뒤따르는 마지막 제출**이 같은 재평가를
    // 한 번 더 태운다(handleSubmitDayVote·handleCastTribunalVote). 표식을 커밋 직후에 두는
    // 이유는 그 사이에 도착하는 제출이 아직 표식 없는 상태에서 판정을 건너뛰지 않게 하기
    // 위해서다.
    if (!applied.terminal) markDepartureResolvePending(session)

    // 이 참가자를 기다리던 유예가 남아 있으면 함께 끝낸다 — 이미 빠진 사람의 타이머가 나중에
    // 발화해 두 번째 사망을 시도하지 않게 한다(core가 멱등이라 중복은 어차피 거부되지만,
    // 타이머 자체를 남겨 두면 세션이 사라진 뒤 발화하는 콜백이 된다).
    try {
        cancelDisconnectGrace(session.id, uuid)
    } catch (err) {
        console.error('[참가자 이탈 처리 실패]', { code: 'GRACE_CANCEL_ERROR', uuid, gameId: session.id })
    }

    // ── 1) 사망 공개 사건 — 생존자였을 때만. 사망자 이탈은 사망을 다시 방송하지 않는다 ──
    if (applied.eliminated) {
        let payload = null
        try {
            payload = gameSessionCore.buildDisconnectEliminationPayload(session, applied.victimUuid)
            if (applied.terminal) {
                payload = { ...payload, ...gameSessionCore.buildTerminalFields(session) }
            }
            // 유예 만료 경로와 **같은 규칙**의 안정 ID다 — 같은 사망은 어느 경로로 들어와도
            // 같은 문자열이 된다. 사망 원인이나 개인 역할은 넣지 않는다.
            payload = {
                ...payload,
                sfxEvent: {
                    eventId: `game:${session.id}:day:${session.dayIndex}:victim:${applied.victimUuid}:eliminated`,
                    gameId: session.id,
                    origin: 'live',
                },
            }
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'PAYLOAD_BUILD_ERROR', uuid, gameId: session.id })
        }
        if (payload) {
            try {
                emitToGameChannel(io, session,'player_eliminated', payload)
            } catch (err) {
                console.error('[참가자 이탈 처리 실패]', { code: 'DELIVERY_ERROR', uuid, gameId: session.id })
            }
        }
    }

    // ── 2) 참여 상태 변화 — 생존과 별개의 사실이라 사망 사건과 합치지 않는다 ────────
    //
    // **payload 조립도 격리한다.** 예전에는 이 한 줄이 try 밖에 있었다 — 조립이 던지면
    // 아래의 개인 진행 상태·재판 취소·종결 저장·타이머 정리·그리고 호출부의 추방 ACK까지
    // 전부 실행되지 않은 채 예외가 올라갔다. 커밋과 영수증은 이미 확정된 뒤이므로, 그 순간
    // 서버가 확정한 결과와 실제로 일어난 후속 처리가 갈라진다. 선택적 통지 하나의 실패가
    // 확정된 결과를 지우지 못하게 한다.
    let participationPayload = null
    try {
        participationPayload = gameSessionCore.buildParticipationChangedPayload(session, applied.victimUuid)
    } catch (err) {
        console.error('[참가자 이탈 처리 실패]', {
            code: 'PARTICIPATION_PAYLOAD_BUILD_ERROR', uuid, gameId: session.id,
        })
    }
    if (participationPayload) {
        try {
            emitToGameChannel(io, session, 'session_participation_changed', participationPayload)
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'PARTICIPATION_DELIVERY_ERROR', uuid, gameId: session.id })
        }
    }

    // ── 2b) 각자의 **본인** 제출 상태 ────────────────────────────────────────
    //
    // 이탈은 남의 표를 기권으로 정규화한다(표적이 사라졌으므로). 그 사실을 공개 방송에 실을
    // 수는 없다 — 누가 누구를 찍었는지가 드러난다. 그래서 **각자에게만** 자기 값을 보낸다.
    //
    // 위 공개 payload 조립이 실패했더라도 이 전송은 그대로 일어난다(각자 독립적으로 조립한다).
    emitSelfSubmissionProgress(io, session)

    // ── 3) 피고 이탈로 취소된 재판 ────────────────────────────────────────────
    if (applied.tribunalCancelled) {
        try {
            emitToGameChannel(io, session,
                'tribunal_vote_resolved',
                gameSessionCore.buildTribunalVoteResolvedPayload(session),
            )
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'TRIBUNAL_CANCEL_ERROR', uuid, gameId: session.id })
        }
    }

    // ── 4) 종결 / 비종결 ─────────────────────────────────────────────────────
    if (applied.terminal) {
        // 결과가 확정된 판에는 기다릴 제출도 다시 태울 판정도 없다.
        clearDepartureResolveMark(session.id)
        // 이탈 사망으로 자연 승패가 확정된 판도 정상 완주다(유예 만료와 같은 규칙).
        persistTerminalSession(session, { completed: true })
        try {
            syncSessionPhaseTimers(io, session)
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'TIMER_SYNC_ERROR', uuid, gameId: session.id })
        }
        return applied
    }

    advancePhaseAfterDeparture(io, session, applied)
    return applied
}

/**
 * 이탈 직후의 단계 진행. **비종결일 때만** 호출된다.
 *
 * 같은 구간에 머무는 이탈에서는 syncSessionPhaseTimers를 부르지 않는다 — 그러면 낮 타이머가
 * 다시 걸려 남은 참가자에게 없던 시간이 생긴다(유예 만료 경로가 이미 지키던 규칙과 같다).
 * 실제 전이나 종결이 일어난 경우에만 타이머를 다시 맞춘다.
 */
function advancePhaseAfterDeparture(io, session, applied) {
    // 재판 취소로 이미 그날 밤에 들어섰다 — 정상 무죄 전이와 같은 경로로 밤을 시작한다.
    if (applied.tribunalCancelled) {
        try {
            syncSessionPhaseTimers(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TIMER_SYNC_ERROR', gameId: session.id })
        }
        return
    }

    let advanced = { transitioned: null }
    try {
        advanced = gameSessionCore.advanceStalledPhaseAfterDeparture(session)
    } catch (err) {
        console.error('[이탈 후 단계 진행 실패]', { code: 'ADVANCE_ERROR', gameId: session.id })
    }

    if (advanced.transitioned === 'DAY') {
        try {
            emitToGameChannel(io, session,'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(session))
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'PHASE_DELIVERY_ERROR', gameId: session.id })
        }
        try {
            startDayPhaseTimer(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TIMER_START_ERROR', gameId: session.id })
        }
        return
    }

    if (advanced.transitioned === 'DAY_VOTE') {
        try {
            emitToGameChannel(io, session,'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session))
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'DAY_PHASE_DELIVERY_ERROR', gameId: session.id })
        }
        try {
            startDayPhaseTimer(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TIMER_START_ERROR', gameId: session.id })
        }
        return
    }

    // 표가 정규화돼 남은 사람만으로 이미 전원 제출인 낮이라면, deadline을 기다리지 않고
    // 기존 판정 경로를 한 번 태운다(이탈이 없는 라운드의 기존 대기 계약은 건드리지 않는다).
    if (session.phase === 'DAY' && gameSessionCore.getDayPhase(session) === gameSessionCore.DAY_PHASES.VOTE) {
        try {
            maybeResolveDayVoteAfterDeparture(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'DAY_VOTE_RESOLVE_ERROR', gameId: session.id })
        }
        return
    }

    // 피고가 아닌 유권자가 빠져 남은 제출만으로 이미 전원 제출이 된 재판도 같은 규칙이다 —
    // 분모가 줄었다는 사실이 곧 완료일 수 있으므로 이탈 직후에 한 번 재평가한다(피고 이탈은
    // 위 tribunalCancelled 분기가 이미 가져갔다).
    if (session.phase === 'TRIBUNAL') {
        try {
            maybeResolveTribunalVoteAfterDeparture(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TRIBUNAL_RESOLVE_ERROR', gameId: session.id })
        }
        return
    }

    if (session.phase === 'NIGHT') {
        // 죽은 참가자는 더 이상 생존 actor가 아니다 — 같은 직업의 남은 생존자가 이미 제출을
        // 마쳤다면 그 턴은 제한시간을 기다리지 않고 끝난다. 행동자가 1→0이 된 경우에는
        // 기존 run/deadline을 그대로 두고 그 run의 정상 만료에 맡긴다(A-07).
        try {
            maybeEndNightTurnOnCompletion(session.id)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TURN_COMPLETION_ERROR', gameId: session.id })
        }
    }
}

/**
 * F-21(AC-03): "이 라운드는 이탈로 분모가 줄었다"는 표식. gameId당 하나이며, 값에는 그
 * 라운드를 특정하는 좌표(단계·dayIndex·라운드 또는 재판 후보)가 들어간다.
 *
 * 좌표를 값에 넣는 이유가 핵심이다 — 다음 날·재투표·다른 재판으로 넘어가면 옛 표식은 저절로
 * 맞지 않게 되므로, **이탈이 없던 라운드**의 기존 계약("전원 투표해도 deadline 또는 명시적
 * 판정까지 대기")이 이 표식 때문에 되살아나지 않는다.
 */
const departureResolveMarks = new Map()

/** 지금 이 세션이 "이탈 재평가"의 대상이 될 수 있는 열린 라운드인가. 아니면 null. */
function departureResolveCoordinate(session) {
    if (!session) return null
    if (session.phase === 'DAY' && gameSessionCore.getDayPhase(session) === gameSessionCore.DAY_PHASES.VOTE) {
        return `DAY_VOTE:${session.dayIndex}:${gameSessionCore.getSessionDayVoteRound(session.id)}`
    }
    if (session.phase === 'TRIBUNAL' && session.tribunal && session.tribunal.resolved !== true) {
        return `TRIBUNAL:${session.dayIndex}:${session.tribunal.candidateId}`
    }
    return null
}

/** 이탈 직후 호출한다 — 열린 낮 투표/재판이 아니면 아무 것도 기록하지 않는다. */
function markDepartureResolvePending(session) {
    const coordinate = departureResolveCoordinate(session)
    if (coordinate === null) return
    departureResolveMarks.set(session.id, coordinate)
}

/** 판정이 실제로 끝났거나 판이 끝났을 때 지운다. */
function clearDepartureResolveMark(gameId) {
    departureResolveMarks.delete(gameId)
}

/** 지금 이 세션의 열린 라운드가 **바로 그 표식이 가리키는** 라운드인가. */
function hasDepartureResolveMark(session) {
    const coordinate = departureResolveCoordinate(session)
    return coordinate !== null && departureResolveMarks.get(session.id) === coordinate
}

/**
 * F-21(AC-03): 이탈로 분모가 줄어든 라운드의 **뒤따르는 마지막 제출** 직후 완료를 재평가한다.
 *
 * 표식이 없으면 아무 일도 하지 않는다 — 이탈이 없는 라운드의 기존 대기 계약을 그대로 두기
 * 위한 유일한 근거가 이 표식이다. 제출자 본인의 canonical 세션으로만 조회하므로 옛 gameId의
 * 늦은 제출이 새 판을 판정하지 못한다.
 */
function resolveAfterDepartureOnSubmit(io, uuid, gameId) {
    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session || !hasDepartureResolveMark(session)) return
    if (session.phase === 'DAY') {
        maybeResolveDayVoteAfterDeparture(io, session)
        return
    }
    if (session.phase === 'TRIBUNAL') maybeResolveTribunalVoteAfterDeparture(io, session)
}

/**
 * F-21(AC-03): 판정 prepare/commit이 요구하는 **요청자**를 세션에서 고른다.
 *
 * roster의 첫 참가자를 그대로 쓰면 안 된다 — session.players는 전적과 snapshot 명단을 위해
 * 이탈자를 지우지 않으므로, 첫 항목이 방금 빠진 바로 그 사람일 수 있다. 그 uuid로 prepare를
 * 부르면 playerSession 매핑이 이미 풀려 NOT_IN_SESSION으로 조용히 실패하고, 이탈 직후
 * 재평가가 통째로 일어나지 않는다(그 라운드는 deadline까지 멈춘 채로 남는다).
 *
 * 그래서 **아직 참여 중이고 계정→세션 매핑이 이 판을 가리키는** 첫 참가자만 고른다. 후보가
 * 없으면 null이고, 호출부는 조용히 아무 일도 하지 않는다.
 */
function pickResolutionRequesterUuid(session) {
    for (const player of session.players.values()) {
        if (!gameSessionCore.isParticipatingInSession(session, player.uuid)) continue
        if (gameSessionCore.getActiveSessionForDeparture(player.uuid, session.id) !== session) continue
        return player.uuid
    }
    return null
}

/**
 * 이탈로 분모가 줄어 이미 전원 제출이 된 DAY_VOTE를 기존 prepare/commit 경로로 한 번 판정한다.
 * 아직 미제출자가 있으면 core가 ACTIONS_PENDING으로 돌려주므로 조용히 아무 일도 하지 않는다 —
 * "이탈 직후 재평가"가 새 판정 규칙을 만들지 않는 이유다.
 */
function maybeResolveDayVoteAfterDeparture(io, session) {
    const requesterUuid = pickResolutionRequesterUuid(session)
    if (!requesterUuid) return

    const prepared = gameSessionCore.prepareDayVoteResolution(requesterUuid, session.id, session.dayIndex)
    if (!prepared.ok || prepared.alreadyResolved) return

    const committed = gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution)
    if (!committed.ok) return

    // 판정이 실제로 끝났다 — 이 라운드의 표식은 역할을 다했다. 남겨 두면 같은 gameId의
    // 다음 라운드가 이탈 없이도 표식을 물려받은 것처럼 보일 수 있다.
    clearDepartureResolveMark(session.id)

    const resolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(session, prepared.resolution)
    let recipients = []
    try {
        recipients = resolveSessionParticipantSockets(io, session)
    } catch (err) {
        console.error('[이탈 후 낮 투표 판정 실패]', { code: 'RECIPIENT_RESOLVE_ERROR', gameId: session.id })
    }
    for (const recipientSocket of recipients) {
        if (!stillEligibleForDelivery(session, recipientSocket)) continue
        try {
            recipientSocket.emit('day_vote_resolved', resolvedPayload)
        } catch (err) {
            console.error('[이탈 후 낮 투표 판정 실패]', { code: 'DELIVERY_ERROR', gameId: session.id })
        }
    }

    // 실제 phase/round 전이가 일어난 경우다 — 여기서는 타이머를 다시 맞추는 것이 정확하다.
    try {
        syncSessionPhaseTimers(io, session)
    } catch (err) {
        console.error('[이탈 후 낮 투표 판정 실패]', { code: 'TIMER_SYNC_ERROR', gameId: session.id })
    }
}

/**
 * F-21(AC-03): **피고가 아닌 유권자**가 빠져 남은 제출만으로 이미 전원 제출이 된 재판을 기존
 * prepare/commit 경로로 한 번 판정한다.
 *
 * 피고 이탈은 이 경로가 아니다 — core가 커밋 구간에서 재판을 CANCELLED로 무효화하고 같은 날
 * 밤으로 넘기므로, 여기까지 오면 phase가 이미 TRIBUNAL이 아니다.
 *
 * 아직 미제출 유권자가 있으면 core가 TRIBUNAL_VOTES_INCOMPLETE로 돌려주므로 조용히 아무 일도
 * 하지 않는다. 판정 규칙·재검증(ballotSnapshot 동결·판정 참조 동일성)은 handleResolveTribunalVote와
 * 완전히 같은 것을 쓴다 — 이탈이 새 판정 규칙을 만들지 않는다.
 */
function maybeResolveTribunalVoteAfterDeparture(io, session) {
    const requesterUuid = pickResolutionRequesterUuid(session)
    if (!requesterUuid) return

    const prepared = gameSessionCore.prepareTribunalVoteResolution(requesterUuid, session.id, session.dayIndex)
    if (!prepared.ok) return

    const committed = gameSessionCore.commitTribunalVoteResolution(prepared.session, prepared.resolution)
    if (!committed.ok) return

    clearDepartureResolveMark(session.id)

    // payload 조립과 terminal 병합의 격리 정책은 handleResolveTribunalVote와 동일하다 —
    // 기존 조립이 실패해도 terminal이면 최소 payload는 반드시 방송한다.
    let resolvedPayload = null
    try {
        resolvedPayload = gameSessionCore.buildTribunalVoteResolvedPayload(session)
    } catch (err) {
        console.error('[이탈 후 재판 판정 실패]', { code: 'PAYLOAD_BUILD_ERROR', gameId: session.id })
    }
    let broadcastPayload = resolvedPayload
    if (committed.terminal) {
        try {
            const terminalFields = gameSessionCore.buildTerminalFields(session)
            broadcastPayload = resolvedPayload ? { ...resolvedPayload, ...terminalFields } : terminalFields
        } catch (err) {
            console.error('[이탈 후 재판 판정 실패]', { code: 'TERMINAL_BUILD_ERROR', gameId: session.id })
        }
        // 완주 종료의 한 경로다 — 기존 종결 저장 훅을 그대로 쓴다(추방·이탈로 전적이 갈리지
        // 않게 하는 것이 AC-03의 핵심이다).
        persistTerminalSession(session, { completed: true })
    }

    let recipients = []
    try {
        recipients = resolveSessionParticipantSockets(io, session)
    } catch (err) {
        console.error('[이탈 후 재판 판정 실패]', { code: 'RECIPIENT_RESOLVE_ERROR', gameId: session.id })
    }
    if (broadcastPayload) {
        for (const recipientSocket of recipients) {
            if (!stillEligibleForDelivery(session, recipientSocket)) continue
            try {
                recipientSocket.emit('tribunal_vote_resolved', broadcastPayload)
            } catch (err) {
                console.error('[이탈 후 재판 판정 실패]', { code: 'DELIVERY_ERROR', gameId: session.id })
            }
        }
    }

    try {
        syncSessionPhaseTimers(io, session)
    } catch (err) {
        console.error('[이탈 후 재판 판정 실패]', { code: 'TIMER_SYNC_ERROR', gameId: session.id })
    }
}

/**
 * NIGHT 밤 행동 제출 요청을 처리합니다(Socket.IO acknowledgement 방식). acknowledge_role_reveal과
 * 달리 phase 전환을 일으키지 않습니다 — 제출자 본인에게 ack를 돌려주는 것이 이 핸들러의 계약이고,
 * 유일한 브로드캐스트는 이 제출이 진행 중인 턴의 마지막 제출이었을 때 turn 시퀀서가 내보내는
 * night_turn_ended(와 뒤이은 다음 턴의 night_turn_started)뿐입니다. 그 방송은 ack를 보낸 "뒤"에
 * 일어나며 실패해도 ack를 되돌리지 않습니다(handleResolveNight의 commit 이후 단계와 같은 원칙).
 * 제출 자체의 성패는 payload에 실리지 않으므로 이 방송도 제출자를 식별하지 않습니다.
 *
 * 로그의 gameId는 client가 보낸 원본 문자열을 절대 쓰지 않습니다. game-core가 성공
 * ({ ok:true, gameId: session.id })을 반환한 경로에서만 그 canonical session.id를 로그
 * 컨텍스트로 쓰고, 그 외 모든 경로(payload 검증 실패·일반 예외·registry 불일치를 포함한 모든
 * 실패)는 gameId: undefined로 고정합니다 — client가 trim으로 검증은 통과시키면서 앞뒤에
 * 개행·공백을 두른 문자열을 보내도 그 원본이 로그에 실리지 않게 하기 위함입니다.
 */
function handleSubmitNightAction(socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, targetId } = payload
    if (typeof gameId !== 'string') {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (targetId !== null && typeof targetId !== 'string') {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    // F-25(AC-01): 그 판이 연출 대기 중이면 core를 부르기 **전에** 끊는다. 대기 중에는
    // session.nightTurnRole이 비어 있어 core의 턴 소유권 검사가 "턴 시퀀서가 없는 밤"으로
    // 오인하고 **다음** 역할의 제출을 받아들일 수 있다. 판정 기준은 client가 보낸 gameId가
    // 아니라 registry가 돌려준 이 계정의 canonical 세션이다(둘이 갈리면 기존 경로로 보낸다).
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (routing && routing.gameId === gameId && isNightPresentationWaitActive(routing.gameId)) {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.submitNightAction(uuid, gameId, targetId)
    } catch (err) {
        console.error('[밤 행동 제출 처리 에러]', { code: 'UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondNightAction(uuid, undefined, callback, {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: '요청을 처리하지 못했습니다.',
        })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[밤 행동 제출 registry 불일치]', { code: result.code, uuid, gameId: undefined })
            respondNightAction(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondNightAction(uuid, undefined, callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // 성공 — result.gameId는 game-core가 registry에서 조회한 canonical session.id다(client
    // 원본 payload.gameId가 아님). client에게 보내는 payload에는 포함하지 않는다.
    respondNightAction(uuid, result.gameId, callback, { ok: true })

    // ack를 보낸 뒤에만 턴을 앞당긴다 — 이 제출이 그 역할 생존자의 마지막 제출이었다면 여기서
    // 제한시간을 기다리지 않고 턴이 즉시 끝난다. 진행 중인 시퀀스가 없으면 no-op이다.
    try {
        maybeEndNightTurnOnCompletion(result.gameId)
    } catch (err) {
        console.error('[밤 턴 종료 처리 에러]', { code: 'TURN_ADVANCE_ERROR', uuid, gameId: result.gameId })
    }
}

/**
 * submit_joker_chat_message 전용 ack 전달 헬퍼. respondNightAction과 동일한 이유로 고정
 * 구조 로그를 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다.
 */
function respondJokerChat(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * 특정 GameSession에서 "지금 실제로 그 채널의 메시지를 받을 수 있는" 소켓만 골라 반환합니다.
 * matchmaking.js의 resolveParticipantSockets와 동일한 3조건(참가자 소속·connected===true·
 * 대상 channel 가입)에 더해, 수신 자격 자체(공개 채널의 참가자 전원 / JOKER 진영)는 game-core의
 * getChatRecipientUuids가 canonical session.players에서 직접 유도한 uuid 집합으로만 판정합니다
 * — 이 함수는 role/alive를 스스로 해석하지 않습니다. 전용 room이 없으므로 매 전송마다
 * 재계산합니다(세션 최대 10명이라 성능 문제가 없습니다).
 *
 * io.sockets.sockets 전체를 순회하지만 session.channelId 가입 여부를 반드시 확인하므로,
 * 다른 GameSession의 소켓이나 채널 밖 소켓은 절대 포함되지 않습니다(io 전역 브로드캐스트 없음).
 */
function resolveChatRecipientSockets(io, session, channel) {
    const eligibleUuids = new Set(gameSessionCore.getChatRecipientUuids(session, channel))
    const sockets = []
    for (const s of io.sockets.sockets.values()) {
        const uuid = s.data?.user?.uuid ?? null
        // F-23(AC-04): 같은 판의 **참가 자격**을 먼저 적용하고(이탈자·옛 소켓·제외된 구독을
        // 걸러낸 뒤) 그 위에 core의 채널별 수신 권한을 교차한다. 역할별 권한(사망한 광대의 팀
        // 대화 등) 자체는 core가 그대로 소유한다 — 여기서 새로 넓히거나 좁히지 않는다.
        if (!isEligibleSessionRecipient(session, s, uuid)) continue
        if (!eligibleUuids.has(uuid)) continue
        sockets.push(s)
    }
    return sockets
}

/**
 * 역할별 비밀 채팅의 수신자 해석. 지정 channel의 canonical 수신자만 반환하며,
 * JOKER channel에서는 사망한 광대도 계속 팀 대화를 받습니다.
 */
function resolveJokerTeammateSockets(io, session, channel = gameSessionCore.CHAT_CHANNELS.JOKER) {
    return resolveChatRecipientSockets(io, session, channel)
}

/**
 * 특정 GameSession의 "지금 실제로 메시지를 받을 수 있는" 참가자 전체 소켓을 반환합니다.
 * resolveJokerTeammateSockets와 동일한 3조건(참가자 소속·connected===true·대상 channel
 * 가입)을 쓰지만, JOKER team 필터가 없다는 점만 다릅니다(전체 참가자 대상 안전 이벤트용).
 */
function resolveSessionParticipantSockets(io, session) {
    const sockets = []
    for (const s of io.sockets.sockets.values()) {
        // F-23(AC-04): 예전에는 `session.players.has(uuid)`만 물었다. 사망자의 roster는 결과·
        // 재접속을 위해 보존되므로, **방금 이탈을 커밋한 계정**도 여전히 players에 있었고 채널
        // 정리(비동기 leave)가 끝나기 전의 첫 공개 판정이 그대로 전달됐다. 공통 자격 경계는
        // 참여 여부·canonical 소켓·전달 제외까지 함께 묻되 alive는 묻지 않는다(AC-05 보존).
        if (!isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null)) continue
        sockets.push(s)
    }
    return sockets
}

/**
 * NIGHT 단계 역할별 채팅 메시지 제출을 처리합니다(Socket.IO acknowledgement 방식).
 * 기존 wire event/API 이름은 호환성을 위해 joker 명칭을 유지합니다.
 * deps.prepare/deps.commit/deps.resolveTeammateSockets/deps.idFn을 주입할 수 있습니다 —
 * production 기본값은 각각 game-core의 prepareJokerChatMessage/commitJokerChatMessage,
 * 이 파일의 resolveJokerTeammateSockets, node:crypto의 randomUUID입니다.
 *
 * 순서: payload 구조 검증 → prepare(어떤 상태도 바꾸지 않음) → 실패 시 internal-only 코드만
 * INTERNAL_ERROR로 정규화 → resolveTeammateSockets → 발신자 포함 확인(참조 동일성) → idFn
 * 호출(resolver·발신자 포함 확인을 전부 통과한 뒤에만 — 실패할 요청이 메시지 ID를 낭비하지
 * 않음) → messageId trim 검증 → commit(유일한 mutation) → ack → 수신자 각각에 개별 emit
 * (하나가 던져도 나머지는 계속 전달).
 *
 * 로그는 예외 없이 console.error('[조커 채팅 오류]', {code, uuid, gameId}) 3키만 쓰고,
 * canonical session.id를 아직 모르는 실패는 gameId: undefined를 명시적으로 포함합니다.
 * err 객체, 사용자가 보낸 텍스트 원문, role/team/nickname, 지목 대상 정보는 로그에 절대
 * 포함하지 않습니다.
 */
function handleSubmitJokerChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareJokerChatMessage
    const commit = deps.commit ?? gameSessionCore.commitJokerChatMessage
    const resolveTeammateSockets = deps.resolveTeammateSockets ?? resolveJokerTeammateSockets
    const idFn = deps.idFn ?? randomUUID

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, text } = payload
    if (typeof gameId !== 'string' || typeof text !== 'string') {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, text)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (JOKER_CHAT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            // registry 불일치·시계 이상값은 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[조커 채팅 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        // 클라이언트 입력값 검증 실패는 서버 버그가 아니므로 로그하지 않는다(기존 관례와 동일).
        respondJokerChat(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let teammateSockets
    try {
        teammateSockets = resolveTeammateSockets(
            io,
            prepared.session,
            prepared.channel ?? gameSessionCore.CHAT_CHANNELS.JOKER,
        )
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const senderIncluded = teammateSockets.some((s) => s === socket)
    if (!senderIncluded) {
        console.error('[조커 채팅 오류]', { code: 'SENDER_NOT_IN_RECIPIENTS', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    let rawMessageId
    try {
        rawMessageId = idFn()
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'ID_GENERATION_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }
    if (typeof rawMessageId !== 'string' || rawMessageId.trim().length === 0) {
        console.error('[조커 채팅 오류]', { code: 'INVALID_MESSAGE_ID', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }
    const messageId = rawMessageId.trim()

    let committed
    try {
        committed = commit(prepared.session, uuid, prepared.sentAt)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        // prepare~commit 사이 다른 이벤트로 세션이 ENDED로 전이됐을 수 있다(신뢰 경계 재검증 실패).
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respondJokerChat(uuid, prepared.session.id, callback, { ok: true })

    for (const teammateSocket of teammateSockets) {
        if (!stillEligibleForDelivery(prepared.session, teammateSocket)) continue
        try {
            teammateSocket.emit('joker_chat_message', {
                gameId: prepared.session.id,
                senderUuid: prepared.actorUuid,
                text: prepared.sanitizedText,
                messageId,
                sentAt: prepared.sentAt,
            })
        } catch (err) {
            console.error('[조커 채팅 오류]', { code: 'DELIVERY_ERROR', uuid: prepared.actorUuid, gameId: prepared.session.id })
        }
    }
}

/**
 * submit_game_chat_message 전용 ack 전달 헬퍼. respondJokerChat과 동일한 이유로 고정 구조
 * 로그를 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다. 채널(생존/사망)은 로그에도 남기지 않는다
 * — 그 자체가 발신자의 생존 여부를 드러내는 canonical 세션 상태이기 때문이다.
 */
function respondGameChat(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * 공개 DAY 채팅의 단일 제출 진입점입니다(Socket.IO acknowledgement 방식).
 * 클라이언트는 { gameId, text }만 보내며 채널을 고르지 않습니다 — 라우팅은 전적으로 game-core의
 * prepareGameChatMessage가 인증 uuid의 canonical 생존 상태와 session.phase에서 유도합니다
 * (생존+DAY만 통과, 사망자는 NOT_ELIGIBLE, 생존자의 다른 phase는 INVALID_PHASE). 사망자는
 * 이 채널의 수신자로는 남지만 발신자는 될 수 없습니다.
 *
 * deps.prepare/deps.commit/deps.resolveRecipientSockets/deps.idFn을 주입할 수 있습니다 —
 * production 기본값은 각각 game-core의 prepareGameChatMessage/commitGameChatMessage,
 * 이 파일의 resolveChatRecipientSockets, node:crypto의 randomUUID입니다. idFn은 이 핸들러가
 * 직접 호출하지 않고 prepare에 그대로 넘깁니다 — messageId는 commit이 대조하는 단일 사용
 * 능력(capability)에 함께 묶여야 하므로 game-core가 만드는 canonical 값입니다.
 *
 * 순서(handleSubmitJokerChatMessage와 동일한 원자성 계약): payload 구조 검증 → prepare(어떤
 * 상태도 바꾸지 않음 — 여기서 sentAt·messageId·공개 메시지가 canonical 값으로 확정되고 능력이
 * 발급된다) → 실패 시 internal-only 코드만 INTERNAL_ERROR로 정규화 → 수신자 해석 → 발신자
 * 포함 확인(참조 동일성) → 이벤트명 해석 → commit(유일한 mutation, prepared 능력 하나만 받아
 * canonical 상태를 처음부터 다시 검증하고 여기서 처음으로 rate limit이 소비된다) → ack
 * → 수신자 각각에 개별 emit(하나가 던져도 나머지는 계속 전달). 즉 검증·수신자 해석이 전부
 * 끝나기 전에는 rate limit이 소비되지 않습니다.
 *
 * 바깥으로 나가는 payload는 commit이 사설 능력 기록에서 돌려준 canonical 메시지를 매 수신자마다
 * 새로 복사한 방어적 객체이고, 키는 정확히
 * {gameId, messageId, senderUuid, nickname, text, sentAt, dayIndex} 7개뿐입니다 — role/team/
 * alive/allies/votes/actions/targets/socket id/rate limit/Room 내부 값은 어디에도 없습니다.
 * 모든 식별·시각·인덱스 값은 canonical 서버 상태에서 왔고 클라이언트 payload에서 오지 않습니다
 * (핸들러가 들고 있는 prepared 번들조차 출처가 아닙니다).
 */
function handleSubmitGameChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareGameChatMessage
    const commit = deps.commit ?? gameSessionCore.commitGameChatMessage
    const resolveRecipientSockets = deps.resolveRecipientSockets ?? resolveChatRecipientSockets
    const idFn = deps.idFn ?? randomUUID

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, text } = payload
    if (typeof gameId !== 'string' || typeof text !== 'string') {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, text, { idFn })
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (GAME_CHAT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            // registry 불일치·시계 이상값·알 수 없는 채널은 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[게임 채팅 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondGameChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        // 클라이언트 입력값 검증 실패는 서버 버그가 아니므로 로그하지 않는다(기존 관례와 동일).
        respondGameChat(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let recipientSockets
    try {
        recipientSockets = resolveRecipientSockets(io, prepared.session, prepared.channel)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const senderIncluded = recipientSockets.some((s) => s === socket)
    if (!senderIncluded) {
        console.error('[게임 채팅 오류]', { code: 'SENDER_NOT_IN_RECIPIENTS', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const eventName = CHAT_EVENT_BY_CHANNEL[prepared.channel]
    if (typeof eventName !== 'string') {
        console.error('[게임 채팅 오류]', { code: 'INVALID_CHAT_CHANNEL', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    let committed
    try {
        // prepared는 값 가방이 아니라 prepare가 이 요청 하나에만 발급한 단일 사용 능력이다 —
        // 이 핸들러는 그 객체를 만들지도 고치지도 않고 그대로 넘기기만 하고, commit이 모듈
        // 사설 기록과 대조해 정확히 한 번 소모한다(요청 단위 바인딩).
        committed = commit(prepared)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        // commit이 canonical 상태에서 다시 검증한 결과다 — prepare~commit 사이의 phase 전이·사망·
        // 세션 종료/이탈, 또는 prepared 데이터 변조로 실패할 수 있다. 어느 쪽이든 rate limit Map은
        // 하나도 바뀌지 않은 상태이므로(원자성), 여기서 되돌릴 것은 없고 emit도 하지 않는다.
        if (!GAME_CHAT_COMMIT_PUBLIC_CODES.has(committed.code)) {
            console.error('[게임 채팅 오류]', { code: committed.code, uuid, gameId: prepared.session.id })
            respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // 내보낼 값의 유일한 출처는 commit이 사설 능력 기록에서 돌려준 canonical 메시지다 —
    // 핸들러가 들고 있는 prepared의 노출 필드는 쓰지 않는다(그 사이 변조됐다면 commit이 이미
    // 거부했겠지만, 출처를 하나로 묶어 두면 애초에 변조된 값이 나갈 경로 자체가 없다).
    const outbound = committed.message
    if (typeof outbound !== 'object' || outbound === null) {
        // production commit은 성공 시 반드시 canonical 메시지를 돌려주므로 도달하지 않는다.
        console.error('[게임 채팅 오류]', { code: 'INVALID_CHAT_MESSAGE', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    respondGameChat(uuid, prepared.session.id, callback, { ok: true })

    for (const recipientSocket of recipientSockets) {
        if (!stillEligibleForDelivery(prepared.session, recipientSocket)) continue
        try {
            // 수신자마다 새 객체를 만든다 — 한 수신자가 받은 payload를 변형해도 다른 수신자나
            // canonical 세션 상태에 영향이 없다(방어적 payload).
            recipientSocket.emit(eventName, {
                gameId: outbound.gameId,
                messageId: outbound.messageId,
                senderUuid: outbound.senderUuid,
                nickname: outbound.nickname,
                text: outbound.text,
                sentAt: outbound.sentAt,
                dayIndex: outbound.dayIndex,
            })
        } catch (err) {
            console.error('[게임 채팅 오류]', { code: 'DELIVERY_ERROR', uuid: outbound.senderUuid, gameId: outbound.gameId })
        }
    }
}

/**
 * resolve_night 전용 ack 전달 헬퍼. respondNightAction/respondJokerChat과 동일한 이유로
 * 고정 구조 로그를 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다.
 */
function respondResolveNight(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * NIGHT 행동 결과 판정 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * deps.prepare/deps.commit/deps.resolveParticipantSockets를 주입할 수 있습니다 — production
 * 기본값은 각각 game-core의 prepareNightResolution/commitNightResolution, 이 파일의
 * resolveSessionParticipantSockets입니다.
 *
 * 순서: payload 구조 검증 → prepare(어떤 상태도 바꾸지 않음) → 실패 시 internal-only 코드만
 * INTERNAL_ERROR로 정규화 → commit(유일한 mutation) → ack({ok:true}) → 참가자 전체에게
 * night_actions_resolved 개별 emit → 같은 루프에서 GUARD/WITCH_HUNTER 본인에게만
 * night_action_result 개별 emit. commit 이후의 모든 단계는 ack를 이미 보낸 뒤이므로 실패해도
 * rollback하지 않고 추가 응답도 만들지 않는다(로그만 남긴다).
 *
 * 로그는 예외 없이 console.error('[밤 행동 판정 오류]', {code, uuid, gameId}) 3키만 쓰고,
 * canonical session.id를 아직 모르는 실패는 gameId: undefined를 명시적으로 포함합니다. raw
 * Error, 판정 결과(암살 후보·보호 대상·개인 결과 등), nightActions는 로그에 절대 포함하지
 * 않습니다.
 */
/**
 * F-25b(A-03): commit이 돌려주는 코드 중 **클라이언트에 그대로 보내면 안 되는** 것들.
 *
 * 출처 없는 준비·오래된 준비·registry 불일치는 전부 서버 내부 상태 신호다(정상 클라이언트가
 * 만들어낼 수 있는 상황이 아니다). 기존 오염 fixture 시험과 같은 관측 결과를 유지하기 위해
 * 이 코드들은 {code:'COMMIT_ERROR', uuid, gameId} 3키 로그와 INTERNAL_ERROR ack으로 정규화한다.
 * NIGHT_ALREADY_RESOLVED·ACTIONS_PENDING·GAME_ALREADY_ENDED·INVALID_PHASE는 정상 도달 가능한
 * 공개 코드라 여기에 없다.
 */
const NIGHT_COMMIT_INTERNAL_ONLY_CODES = new Set([
    'UNKNOWN_RESOLUTION_SOURCE',
    'STALE_RESOLUTION',
    'SESSION_NOT_FOUND',
    'NOT_A_PARTICIPANT',
])

/**
 * F-25b: 같은 세션의 밤 최종화가 **동시에 두 번 진입하지 못하게** 하는 표식.
 *
 * commit 자체가 원자적 단일 게이트지만(같은 밤의 두 번째 커밋은 NIGHT_ALREADY_RESOLVED),
 * ack·emit이 다시 이 경계를 부르는 재진입(수신자 emit이 이탈을 커밋하고 그 정리가 타이머를
 * 깨우는 등)까지는 막지 못한다. 전송 시작 전에 표식을 세워 그 경로를 끊는다.
 */
const nightFinalizeInFlight = new Set()

/**
 * F-25b: **한 밤을 최종화하는 유일한 경계.** 수동 resolve_night(handleResolveNight)와 마지막
 * 역할 턴이 끝난 자동 진행(advanceNightTurn)이 모두 이 함수 하나를 지난다 — 그래서 같은 밤에
 * 대해 최종 사망 확정·승패 판정·전적 저장·결과 방송이 각각 최대 1회만 일어난다(AC-05).
 *
 * 순서: 재진입 표식 확보 → 유효한 준비(세션 단위) → commit(유일한 mutation) → 공개 payload와
 * 개인 결과 고정 → terminal이면 기존 persistTerminalSession → 수동 호출의 ack → 시퀀스 중단과
 * 낮 타이머 동기화 → 수신자별 기존 세 이벤트 전달.
 *
 * 새 종료 보류·저장 재시도·세션 삭제 계약을 만들지 않는다(A-11) — 종결 저장은 기존 훅
 * 그대로이고, 세션 전체 정리는 여전히 기존 종료 경로(finalizeGameSessionEnd)가 소유한다.
 *
 * @param {object} io
 * @param {object} session - registry에 등록된 canonical GameSession
 * @param {object} [options]
 * @param {object|null} [options.prepared] - 이미 계산된 준비({ok,session,resolution}). 수동 경로가 넘긴다.
 * @param {object} [options.deps] - prepareForSession/commit/resolveParticipantSockets 주입
 * @param {function|null} [options.onResult] - 수동 경로의 ack 전달자. 자동 경로는 null이다.
 * @returns {{ok:boolean, code?:string, terminal?:object|null, victimUuid?:string|null}}
 */
function finalizeNightForSession(io, session, { prepared = null, deps = {}, onResult = null } = {}) {
    const prepareForSession = deps.prepareForSession ?? gameSessionCore.prepareNightResolutionForSession
    const commit = deps.commit ?? gameSessionCore.commitNightResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    const gameId = session?.id
    if (typeof gameId !== 'string' || !gameId) return { ok: false, code: 'SESSION_NOT_FOUND' }
    // F-25(AC-04): 연출 대기 중에는 **어느 경로로 들어와도** 확정하지 않는다. prepared를 이미
    // 들고 들어온 수동 경로까지 여기서 막아야, 종료 방송 중의 재진입이 커밋·저장·보상을
    // 시작할 수 없다(자동 최종화는 대기가 닫힌 뒤 stopNightTurnSequence를 지나 도착한다).
    if (isNightPresentationWaitActive(gameId)) return { ok: false, code: 'ACTIONS_PENDING' }
    if (nightFinalizeInFlight.has(gameId)) return { ok: false, code: 'NIGHT_FINALIZE_IN_PROGRESS' }

    nightFinalizeInFlight.add(gameId)
    try {
        let resolvedPrepared = prepared
        if (!resolvedPrepared) {
            try {
                resolvedPrepared = prepareForSession(session)
            } catch (err) {
                console.error('[밤 행동 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid: undefined, gameId })
                return { ok: false, code: 'INTERNAL_ERROR' }
            }
        }
        if (!resolvedPrepared || resolvedPrepared.ok !== true) {
            return { ok: false, code: resolvedPrepared?.code ?? 'INTERNAL_ERROR' }
        }

        // 준비가 가리키는 세션이 곧 이 경계의 canonical 세션이다(두 값이 갈리면 진행하지 않는다).
        const targetSession = resolvedPrepared.session ?? session
        const resolution = resolvedPrepared.resolution

        let applied
        try {
            applied = commit(targetSession, resolution)
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'COMMIT_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
            if (onResult) onResult({ ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return { ok: false, code: 'INTERNAL_ERROR' }
        }

        if (!applied.ok) {
            if (NIGHT_COMMIT_INTERNAL_ONLY_CODES.has(applied.code)) {
                console.error('[밤 행동 판정 오류]', { code: 'COMMIT_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
                if (onResult) onResult({ ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
                return { ok: false, code: 'INTERNAL_ERROR' }
            }
            if (onResult) onResult({ ok: false, code: applied.code, message: '요청을 처리할 수 없습니다.' })
            return { ok: false, code: applied.code }
        }

        // 여기부터는 이미 확정된 밤이다 — 아래 어떤 실패도 커밋된 상태를 되돌리지 않는다.
        //
        // commit이 이미 phase/dayIndex를 갱신한 뒤의 session을 받는다 — recipient마다 동일한
        // payload이므로 루프 밖에서 한 번만 만들어 재사용한다. 기존 필드 조립과 terminal 필드
        // 병합은 별도 try 블록이다 — 기존 조립이 실패해도 terminal이 있으면 최소
        // payload({phase,winResult,players})는 반드시 전달한다.
        let nightResultAppliedPayload = null
        try {
            // 공개 사망 reveal은 commit이 canonical resolution에 채워 넣은 목록(실제로 alive→dead로
            // 바뀐 참가자만)을 그대로 실어 나른다 — 소켓 계층은 목록을 만들지도, 고치지도 않는다.
            nightResultAppliedPayload = gameSessionCore.buildNightResultAppliedPayload(
                targetSession,
                applied.victimUuid,
                resolution.publicDeathReveals,
            )
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'PAYLOAD_BUILD_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
        }

        if (applied.terminal) {
            try {
                const terminalFields = gameSessionCore.buildTerminalFields(targetSession)
                nightResultAppliedPayload = nightResultAppliedPayload
                    ? { ...nightResultAppliedPayload, ...terminalFields }
                    : terminalFields
            } catch (err) {
                console.error('[밤 행동 판정 오류]', { code: 'TERMINAL_BUILD_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
            }
            // 완주 종료의 두 경로 중 하나다. 저장은 여기서 딱 한 번 시작되고, 실패해도 아래의
            // ack·방송을 막지 않는다(payload 조립 실패와 같은 격리 정책). 같은 판의 두 번째
            // 종결 훅(세션 정리 등)은 persistTerminalSession이 스스로 막는다(F-21 A-09).
            persistTerminalSession(targetSession, { completed: true })
        }

        if (onResult) {
            onResult(nightResultAppliedPayload
                ? { ok: true }
                : { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        }

        // 밤이 판정됐으므로 그 밤의 턴 시퀀스는 어떤 경우에도 끝난다. 낮으로 넘어갔으면(비종결)
        // 그 낮의 토론 제한시간을 시작하고, 승자가 확정돼 ENDED가 됐으면 낮 타이머도 걸지 않는다
        // (startDayPhaseTimer가 phase 가드로 스스로 정리한다).
        try {
            stopNightTurnSequence(targetSession.id)
            startDayPhaseTimer(io, targetSession)
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'TIMER_SYNC_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
        }

        let recipients
        try {
            recipients = resolveParticipantSockets(io, targetSession)
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
            return { ok: true, victimUuid: applied.victimUuid, terminal: applied.terminal ?? null }
        }

        for (const recipientSocket of recipients) {
            // 목록은 계산 시점의 사실이다 — 앞 수신자의 emit이 이 계정을 그 판에서 빼거나 새
            // 소속으로 옮겼을 수 있으므로 전송 직전에 자격을 다시 묻는다(F-23 AC-04).
            if (!stillEligibleForDelivery(targetSession, recipientSocket)) continue
            const recipientUuid = recipientSocket.data?.user?.uuid ?? null
            // 일반 사건의 자격 검사에는 "다른 경기 routing"이 포함돼 있지 않다 — 밤 결과는
            // 새 소속을 얻은 계정에게 가면 안 되므로 그 축을 여기서 한 번 더 묻는다(A-12).
            if (recipientUuid !== null && hasMembershipOutsideSession(targetSession, recipientUuid)) continue

            try {
                recipientSocket.emit('night_actions_resolved', { gameId: targetSession.id, dayIndex: resolution.dayIndex })
            } catch (err) {
                console.error('[밤 행동 판정 오류]', { code: 'DELIVERY_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
            }

            const privateResult = resolution.privateResults?.get(recipientUuid)
            if (privateResult !== undefined) {
                try {
                    recipientSocket.emit('night_action_result', {
                        gameId: targetSession.id,
                        dayIndex: resolution.dayIndex,
                        ...privateResult,
                        // F-16(AC-04/AC-05): 이 개인 결과의 안정 사건 ID와 허용 수신 계정이다.
                        // 수신자는 현재 인증 계정이 accountId와 같을 때만 소리를 낸다 — 전달
                        // 경로(개별 emit)에 더해 클라이언트에서도 한 번 더 대조하는 이중 방어다.
                        //
                        // ID에는 게임·밤·본인 행동 종류만 넣는다. 대상 uuid나 조사로 드러난
                        // 역할 같은 비밀 값은 ID에도 서버 로그에도 복제하지 않는다(AC-05).
                        sfxEvent: {
                            eventId: `game:${targetSession.id}:night:${resolution.dayIndex}:${privateResult.actionType}`,
                            accountId: recipientUuid,
                            gameId: targetSession.id,
                            origin: 'live',
                        },
                    })
                } catch (err) {
                    console.error('[밤 행동 판정 오류]', { code: 'PRIVATE_DELIVERY_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
                }
            }

            if (nightResultAppliedPayload) {
                try {
                    recipientSocket.emit('night_result_applied', nightResultAppliedPayload)
                } catch (err) {
                    console.error('[밤 행동 판정 오류]', { code: 'DELIVERY_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
                }
            }
        }

        return { ok: true, victimUuid: applied.victimUuid, terminal: applied.terminal ?? null }
    } finally {
        nightFinalizeInFlight.delete(gameId)
    }
}

function handleResolveNight(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareNightResolution

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    // F-25(AC-04): 연출 대기 중인 밤은 아직 확정할 수 없다. 이 본문은 **먼저 준비를 수행**하므로
    // 공통 경계(finalizeNightForSession)의 가드만으로는 "준비도 0회"를 만족할 수 없다 —
    // prepare 앞에서 끊는다. 기준은 registry가 돌려준 이 계정의 canonical 세션이다.
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (routing && routing.gameId === gameId && isNightPresentationWaitActive(routing.gameId)) {
        respondResolveNight(uuid, routing.gameId, callback, { ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_NIGHT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[밤 행동 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveNight(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // 준비 이후의 커밋·저장·결과 전달은 전부 공통 경계가 소유한다 — 자동 밤 최종화가 같은
    // 함수를 쓰므로 두 경로가 같은 밤을 두 번 확정할 수 없다(AC-05).
    //
    // onResult에 uuid를 실어 둔다: 공통 경계의 오류 로그가 기존과 동일한
    // {code, uuid, gameId} 3키를 유지해야 하기 때문이다(자동 경로에서는 uuid가 undefined다).
    let answered = false
    const onResult = (response) => {
        answered = true
        respondResolveNight(uuid, prepared.session.id, callback, response)
    }
    onResult.uuid = uuid

    const outcome = finalizeNightForSession(io, prepared.session, { prepared, deps, onResult })
    // 재진입 표식에 막혀 공통 경계가 아무 것도 하지 않은 경우처럼 ack가 아직 나가지 않았다면
    // 요청자는 답을 받지 못한 채 남는다 — 이 요청이 그 밤을 확정하지 못했다는 사실만 알린다.
    if (!answered) {
        respondResolveNight(uuid, prepared.session.id, callback, outcome?.ok
            ? { ok: true }
            : { ok: false, code: 'NIGHT_ALREADY_RESOLVED', message: '요청을 처리할 수 없습니다.' })
    }
}

/**
 * DAY 투표/기권 제출 요청을 처리합니다(Socket.IO acknowledgement 방식). handleAcknowledgeRoleReveal과
 * 동일한 골격(payload 검증 → core 호출 try/catch → internal-only 코드 정규화 → respond())을
 * 따르되, 이번 슬라이스는 집계·전이가 없으므로 broadcast 블록 없이 ack만으로 끝납니다.
 *
 * uuid는 인증된 socket에서 전달받은 값만 쓰고, payload의 uuid/role/alive/phase는 아예 읽지
 * 않습니다(core가 registry 기준으로 다시 전부 검증합니다).
 *
 * 토론(DAY_DISCUSSION) 중의 제출은 core가 INVALID_DAY_PHASE로 거부하며, 그 코드는 공개
 * 코드이므로 이 핸들러가 그대로 클라이언트에 전달합니다(별도 처리가 없습니다).
 *
 * F-11(A-01/A-03): core가 유효한 "비기권" 제출(targetId !== null)을 받아들이면, 그 사건을
 * 성공 ack 전에 vote_participations에 영속화합니다 — 기권(targetId:null)은 D-09가 세지
 * 않는 참여이므로 저장을 시도조차 하지 않고 기존과 동일하게 동기적으로 ack합니다.
 * dayIndex는 core 호출 직후(=await 이전, 라운드 전환이 끼어들 수 없는 시점)에 읽어 사건이
 * 항상 "이 제출이 실제로 반영된" 라운드로 귀속되게 합니다(A-03 조건 3). 저장이 실패하면
 * 메모리 투표는 이미 반영된 채로 남겨두고(A-03 조건 2 — 같은 요청의 재시도를 거절하지
 * 않습니다) 재시도 가능한 실패 코드로 ack합니다.
 *
 * F-11 CODEX-1 재검토(AC-03): 저장 시도는 이 dayIndex의 최초 투표 라운드(dayVoteRound===1)에만
 * 합니다. A-01은 "일반 낮 라운드당 1회"를 최초 투표의 유효한 비기권 참여로 정의하고
 * "재판·재투표 자체는 새 사건을 만들지 않는다"고 명시합니다 — 최초 라운드에서 기권했던
 * 참가자가 재투표(round>=2)에서 뒤늦게 비기권으로 돌아서더라도 그 제출은 최초 투표가
 * 아니므로 새 사건을 만들면 안 됩니다. 최초 라운드의 비기권 제출은 이미 저장을 시도했으므로
 * (성공했든 DB 유일 제약에 막혔든) 그 뒤 라운드에서 다시 시도할 필요가 없습니다.
 */
/**
 * F-16(AC-01/AC-04): 낮 투표 제출 성공 ACK에 실을 개인 사건 봉투.
 *
 * 요청자 본인에게만 가는 ACK이므로 accountId는 인증된 uuid다 — 수신 클라이언트가 "현재
 * 로그인 계정"과 다시 대조해 계정 전환 직후 도착한 늦은 ACK을 거부할 수 있게 한다.
 * 투표 대상·역할은 담지 않는다(AC-05).
 *
 * game-core가 봉투를 만들지 못했으면(세션이 그 사이 사라진 경우 등) null을 싣는다 —
 * 프런트는 봉투가 없으면 조용히 무음이고, 투표 성공 판정 자체는 달라지지 않는다(AC-06).
 */
function buildDayVoteSubmitSfxEvent(uuid, gameId) {
    let record
    try {
        record = gameSessionCore.readDayVoteSubmitSfxEvent(uuid, gameId)
    } catch (err) {
        // 사건 봉투 조회 실패가 이미 성공한 투표 제출을 실패로 바꾸지 않는다.
        return null
    }
    if (record === null) return null
    return {
        kind: 'day-vote-submitted',
        eventId: record.eventId,
        accountId: uuid,
        gameId,
        dayIndex: record.dayIndex,
        round: record.round,
        origin: 'live',
    }
}

/** F-16(AC-01): 재판 투표 제출 성공 ACK 봉투. 최초 성공 1회뿐이라 revision이 없다. */
function buildTribunalVoteSubmitSfxEvent(uuid, gameId) {
    let record
    try {
        record = gameSessionCore.readTribunalVoteSubmitSfxEvent(uuid, gameId)
    } catch (err) {
        return null
    }
    if (record === null) return null
    return {
        kind: 'tribunal-vote-submitted',
        eventId: record.eventId,
        accountId: uuid,
        gameId,
        dayIndex: record.dayIndex,
        origin: 'live',
    }
}

async function handleSubmitDayVote(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, targetId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (targetId !== null && typeof targetId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.submitDayVote(uuid, gameId, targetId)
    } catch (err) {
        console.error('[낮 투표 제출 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[낮 투표 제출 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // F-16(AC-01/AC-04): 동기 commit이 끝난 **바로 이 순간** 사건 봉투를 캡처한다. 아래 DB
    // await가 아무리 늦게 끝나도, 그 사이 같은 actor가 다시 제출해 새 revision이 생겼더라도,
    // 이 요청의 ack에는 이 요청이 만든 ID가 실린다(game-core가 매번 새 불변 객체로 교체한다).
    const sfxEvent = buildDayVoteSubmitSfxEvent(uuid, gameId)

    /**
     * F-21(AC-03): ack를 먼저 보낸 뒤, **이탈로 분모가 줄어든 라운드**라면 이 제출이 마지막일
     * 수 있으므로 완료를 한 번 재평가한다. 표식이 없는 라운드에서는 아무 일도 하지 않는다 —
     * 기존 "전원 투표해도 deadline 또는 명시적 판정까지 대기" 계약이 그대로 남는다.
     *
     * 성공 ack와 참여 저장 실패 ack **양쪽**이 이 경계를 지난다. 기준은 ack의 성패가 아니라
     * "core에 표가 커밋됐는가"이고, 여기까지 온 요청은 어느 쪽이든 이미 커밋된 뒤다.
     */
    const ackThenResolve = (ackPayload) => {
        // F-21(AC-03): **커밋된 표를 서버가 다시 말해 준다.** 이탈 이후의 화면은 서버가 실어 준
        // 본인 값을 canonical로 쓰므로(늦은 ACK가 정규화를 되돌리지 못하게 하려고), 이 갱신이
        // 없으면 방금 커밋된 표가 화면에서 미제출로 남고 버튼이 다시 눌린다. 판정 재평가보다
        // **먼저** 보내 이 제출 시점의 사실을 그대로 전달한다(그 뒤의 전이는 자기 방송을 낸다).
        try {
            // 제출자 본인의 canonical 세션으로만 조회한다 — 옛 gameId의 늦은 제출이 새 판의
            // 개인 상태를 건드리지 못한다(resolveAfterDepartureOnSubmit과 같은 경계).
            const committed = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
            if (committed) emitSelfSubmissionProgress(io, committed, uuid)
        } catch (err) {
            console.error('[개인 진행 상태 전송 실패]', { code: 'SELF_PROGRESS_AFTER_SUBMIT', gameId })
        }
        respond(callback, ackPayload)
        try {
            resolveAfterDepartureOnSubmit(io, uuid, gameId)
        } catch (err) {
            console.error('[이탈 후 낮 투표 판정 실패]', { code: 'SUBMIT_RESOLVE_ERROR', gameId })
        }
    }

    if (targetId === null) {
        // 기권은 D-09가 세지 않는 참여다 — 저장을 시도하지 않으므로 어떤 await도 거치지
        // 않고 기존과 동일하게 동기적으로 ack한다.
        ackThenResolve({ ok: true, sfxEvent })
        return
    }

    // A-01: 재투표(2라운드 이상)의 비기권 제출은 최초 투표가 아니므로 새 사건을 만들지
    // 않는다 — 최초 라운드에서 기권했던 참가자가 재투표에서 비기권으로 돌아서는 경우가
    // 여기서 걸러진다.
    //
    // 이것은 **F-11의 DB 참여 집계** 규칙이며 F-16의 소리와는 별개다 — 재투표 제출도 실제
    // 상태 변경이므로 sfxEvent는 그대로 싣는다(집계 기여만 없다).
    if (gameSessionCore.getSessionDayVoteRound(gameId) !== 1) {
        ackThenResolve({ ok: true, sfxEvent })
        return
    }

    const dayIndex = gameSessionCore.getSessionDayIndex(gameId)
    try {
        await recordVoteParticipationImpl({ gameId, dayIndex, userId: uuid })
    } catch (err) {
        console.error('[투표 참여 사건 저장 실패]', { code: 'VOTE_PERSIST_ERROR', uuid, gameId })
        // F-21(AC-03): **표는 이미 core에 커밋돼 있다.** 저장 실패는 D-09의 참여 집계가
        // 실패했다는 뜻일 뿐, 이 라운드의 제출 자체를 되돌리지 않는다(A-03 조건 2 — 메모리
        // 투표는 반영된 채로 남긴다). 그러므로 이탈로 분모가 줄어든 라운드에서 이 제출이
        // 마지막이었다면 완료 재평가는 저장 성공 여부와 무관하게 똑같이 일어나야 한다 —
        // 그러지 않으면 그 라운드는 DB 사정 하나로 deadline까지 멈춘 채 남는다.
        //
        // 실패 ACK의 사실은 바꾸지 않는다(재시도 가능한 실패 그대로다). 재평가 자체는 성공
        // 경로와 **같은 한 번의** prepare/commit·방송·저장 경로를 쓰므로 중복이 생기지 않는다.
        ackThenResolve({
            ok: false,
            code: 'VOTE_PERSIST_FAILED',
            message: '투표 저장에 실패했습니다. 다시 시도해 주세요.',
        })
        return
    }

    // DB await 뒤의 늦은 ack는 그 사이 정규화된 canonical 상태를 덮지 않는다 — 아래 재평가는
    // 저장된 값이 아니라 지금의 canonical 세션을 다시 읽어 판정한다.
    ackThenResolve({ ok: true, sfxEvent })
    // F-12: ack를 먼저 보낸 뒤 fire-and-forget으로 재평가한다 — 업적 평가(DB 조회 여러 건 +
    // 조건 충족 시 트랜잭션)가 투표 제출 응답 지연을 만들지 않게 한다.
    evaluateAchievementsForUsers([uuid], gameId)
}

/**
 * resolve_day_vote 전용 ack 전달 헬퍼. respondResolveNight과 동일한 이유로 고정 구조 로그를
 * 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다.
 */
function respondResolveDayVote(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * DAY 투표 판정 요청을 처리합니다(Socket.IO acknowledgement 방식). handleResolveNight과 동일한
 * 골격(payload 검증 → prepare → internal-only 코드 정규화 → commit → ack → 참가자 전체 방송)을
 * 따르되, 이미 판정된 dayIndex의 재요청(prepared.alreadyResolved)은 재commit·재방송 없이
 * ack만 돌려준다는 점이 다르다.
 *
 * 로그는 예외 없이 console.error('[낮 투표 판정 오류]', {code, uuid, gameId}) 3키만 쓰고,
 * canonical session.id를 아직 모르는 실패는 gameId: undefined를 명시적으로 포함합니다. raw
 * Error, 판정 결과(투표자별 대상 등), dayVotes는 로그에 절대 포함하지 않습니다.
 */
function handleResolveDayVote(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareDayVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitDayVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, dayIndex } = payload
    if (typeof gameId !== 'string') {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, dayIndex)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_DAY_VOTE_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[낮 투표 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    if (prepared.alreadyResolved) {
        // 이미 판정된 dayIndex에 대한 재요청 — 멱등하게 ack만 돌려주고 재commit·재방송하지 않는다.
        respondResolveDayVote(uuid, prepared.session.id, callback, {
            ok: true,
            gameId: prepared.resolution.gameId,
            dayIndex: prepared.resolution.dayIndex,
            outcome: prepared.resolution.outcome,
            tribunalTargetUuid: prepared.resolution.tribunalTargetUuid,
        })
        return
    }

    let committed
    try {
        committed = commit(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondResolveDayVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        // prepare~commit 사이 다른 이벤트로 세션이 ENDED로 전이됐을 수 있다(신뢰 경계 재검증 실패).
        respondResolveDayVote(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respondResolveDayVote(uuid, prepared.session.id, callback, {
        ok: true,
        gameId: prepared.resolution.gameId,
        dayIndex: prepared.resolution.dayIndex,
        outcome: prepared.resolution.outcome,
        tribunalTargetUuid: prepared.resolution.tribunalTargetUuid,
    })

    let recipients
    try {
        recipients = resolveParticipantSockets(io, prepared.session)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        recipients = []
    }

    const dayVoteResolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(prepared.session, prepared.resolution)

    for (const recipientSocket of recipients) {
        if (!stillEligibleForDelivery(prepared.session, recipientSocket)) continue
        try {
            recipientSocket.emit('day_vote_resolved', dayVoteResolvedPayload)
        } catch (err) {
            console.error('[낮 투표 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
        }
    }

    // 판정 결과를 먼저 전달한 뒤 canonical phase에 맞는 다음 타이머를 시작한다. NIGHT 전이는 여기서
    // 실제 밤 턴 시퀀스를 시작하므로 클라이언트는 day_vote_resolved 다음에 night_turn_started를 받는다.
    try {
        syncSessionPhaseTimers(io, prepared.session)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'TIMER_SYNC_ERROR', uuid, gameId: prepared.session.id })
    }
}

/**
 * cast_tribunal_vote 전용 ack 전달 헬퍼. callback이 던져도 예외가 바깥으로 새지 않고, 로그는
 * 항상 {gameId, dayIndex, requesterUuid, internalCode:'CALLBACK_ERROR'} 4필드만 쓴다 — 공용
 * respond()나 다른 이벤트 전용 로거를 재사용하지 않는다(raw Error/session을 로그하지 않기 위함).
 */
function respondCastTribunalVote(gameId, dayIndex, requesterUuid, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid, internalCode: 'CALLBACK_ERROR' })
    }
}

/**
 * TRIBUNAL 유죄/무죄 투표 제출 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * handleSubmitDayVote와 동일한 골격(payload 검증 → core 호출 try/catch → internal-only 코드
 * 정규화 → respond())을 따르되, 로그는 {gameId, dayIndex, requesterUuid, internalCode} 4필드
 * 고정 구조를 쓴다(raw Error/session 없음). 성공 이후 broadcast는 없다(본인에게만 ack).
 *
 * uuid는 registerGameHandlers가 이미 들고 있는 인증된 클로저 값만 쓰고, payload의 uuid류
 * 필드는 아예 읽지 않는다.
 */
function handleCastTribunalVote(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondCastTribunalVote(undefined, undefined, uuid, callback, {
            ok: false,
            code: 'STALE_SOCKET',
            message: '요청을 처리할 수 없습니다.',
        })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondCastTribunalVote(undefined, undefined, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }
    const { gameId, dayIndex, vote } = payload
    if (typeof gameId !== 'string') {
        respondCastTribunalVote(undefined, dayIndex, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondCastTribunalVote(gameId, undefined, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }

    let result
    try {
        result = gameSessionCore.submitTribunalVote(uuid, gameId, dayIndex, vote)
    } catch (err) {
        console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid: uuid, internalCode: 'UNEXPECTED_ERROR' })
        respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: '요청을 처리하지 못했습니다.',
        })
        return
    }

    if (!result.ok) {
        if (CAST_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES.has(result.code)) {
            console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid: uuid, internalCode: result.code })
            respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
                ok: false,
                code: 'INTERNAL_ERROR',
                message: '요청을 처리하지 못했습니다.',
            })
            return
        }
        respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
            ok: false,
            code: result.code,
            message: '요청을 처리할 수 없습니다.',
        })
        return
    }

    // F-16(AC-01): 최초 성공 1회에만 붙는다 — 중복 제출은 위에서 TRIBUNAL_VOTE_ALREADY_SUBMITTED로
    // 이미 실패했으므로 여기 도달하지 않는다(중복 실패에 소리를 붙이지 않는다).
    respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
        ok: true,
        gameId: result.gameId,
        dayIndex: result.dayIndex,
        vote: result.vote,
        sfxEvent: buildTribunalVoteSubmitSfxEvent(uuid, gameId),
    })

    // F-21(AC-03): 낮 투표·토론 준비와 **같은 이유**의 갱신이다. 이탈 이후의 화면은 서버가 실어
    // 준 본인 값(hasSubmittedTribunalVote)을 canonical로 쓰므로, 제출이 그 값을 갱신하지 않으면
    // 방금 커밋된 표가 화면에서 미제출로 남는다. 판정 재평가보다 먼저 보낸다.
    try {
        const committed = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
        if (committed) emitSelfSubmissionProgress(io, committed, uuid)
    } catch (err) {
        console.error('[개인 진행 상태 전송 실패]', { code: 'SELF_PROGRESS_AFTER_TRIBUNAL_VOTE', gameId })
    }

    // F-21(AC-03): 유권자 이탈로 분모가 줄어든 재판이라면 이 제출이 마지막일 수 있다 —
    // 표식이 있는 경우에만 기존 prepare/commit 경로를 한 번 태운다(이탈이 없던 재판의 기존
    // 판정 시점 계약은 그대로다).
    try {
        resolveAfterDepartureOnSubmit(io, uuid, gameId)
    } catch (err) {
        console.error('[이탈 후 재판 판정 실패]', { gameId, dayIndex, requesterUuid: uuid, internalCode: 'SUBMIT_RESOLVE_ERROR' })
    }
}

/**
 * resolve_tribunal_vote 전용 ack 전달 헬퍼. respondResolveDayVote와 동일한 이유로 고정 구조
 * 로그를 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다.
 */
function respondResolveTribunalVote(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * TRIBUNAL 판정 요청을 처리합니다(Socket.IO acknowledgement 방식). handleResolveDayVote와
 * 동일한 골격(payload 검증 → prepare → internal-only 코드 정규화 → commit → ack → 참가자
 * 전체 방송)을 따르되, alreadyResolved 멱등 단축 분기는 없다(TRIBUNAL_ALREADY_RESOLVED로 그대로
 * 거부한다) — 그리고 commit 자체가 { ok:false, code }를 반환할 수 있어(신뢰 경계 재검증 실패),
 * 그 경우도 실패 ack로 그대로 이어지고 payload 빌드·broadcast가 없다.
 *
 * deps.prepare/deps.commit/deps.resolveParticipantSockets를 주입할 수 있습니다 — production
 * 기본값은 각각 game-core의 prepareTribunalVoteResolution/commitTribunalVoteResolution, 이
 * 파일의 resolveSessionParticipantSockets입니다.
 */
function handleResolveTribunalVote(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareTribunalVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitTribunalVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, dayIndex } = payload
    if (typeof gameId !== 'string') {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, dayIndex)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[재판 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let committed
    try {
        committed = commit(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // 기존 필드 조립과 terminal 필드 병합은 별도 try 블록이다 — 기존 조립이 실패해도 terminal이
    // 있으면 최소 payload({phase,winResult,players})는 반드시 broadcast하고, 요청자에게는
    // INTERNAL_ERROR ACK를 보낸다(handleResolveNight과 동일한 정책).
    let resolvedPayload = null
    try {
        resolvedPayload = gameSessionCore.buildTribunalVoteResolvedPayload(prepared.session)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'PAYLOAD_BUILD_ERROR', uuid, gameId: prepared.session.id })
    }

    let broadcastPayload = resolvedPayload
    if (committed.terminal) {
        try {
            const terminalFields = gameSessionCore.buildTerminalFields(prepared.session)
            broadcastPayload = resolvedPayload ? { ...resolvedPayload, ...terminalFields } : terminalFields
        } catch (err) {
            console.error('[재판 판정 오류]', { code: 'TERMINAL_BUILD_ERROR', uuid, gameId: prepared.session.id })
        }
        // 완주 종료의 나머지 한 경로다(handleResolveNight과 동일한 훅·동일한 격리 정책).
        persistTerminalSession(prepared.session, { completed: true })
    }

    if (!resolvedPayload) {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    } else {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, {
            ok: true,
            gameId: resolvedPayload.gameId,
            dayIndex: resolvedPayload.dayIndex,
            outcome: resolvedPayload.outcome,
            counts: resolvedPayload.counts,
            executedUuid: resolvedPayload.executedUuid,
        })
    }

    let recipients
    try {
        recipients = resolveParticipantSockets(io, prepared.session)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        recipients = []
    }

    if (broadcastPayload) {
        for (const recipientSocket of recipients) {
            if (!stillEligibleForDelivery(prepared.session, recipientSocket)) continue
            try {
                recipientSocket.emit('tribunal_vote_resolved', broadcastPayload)
            } catch (err) {
                console.error('[재판 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
            }
        }
    }

    // 재판 판정 결과를 전달한 다음 NIGHT면 첫 역할 턴을 시작하고, ENDED면 남은 타이머를 정리한다.
    try {
        syncSessionPhaseTimers(io, prepared.session)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'TIMER_SYNC_ERROR', uuid, gameId: prepared.session.id })
    }
}

/**
 * GameSession 종료 core(endGameSessionForPlayer)가 성공한 직후 공통으로 수행하는 뒷정리.
 * disconnect·명시적 이탈 두 경로가 모두 이 함수 하나만 거치므로 "종료·방송은 한 번뿐"이라는
 * 계약이 자연히 지켜진다.
 *
 * 세 단계(matchmaking 정리 → game_ended 방송 → channel 정리)는 서로 독립적인 best-effort
 * 작업이라 각각 분리된 try 블록에 둔다 — 하나가 던져도 나머지 정리가 막히지 않아야 한다
 * (알림 emit 또는 channel 정리가 실패해도 registry 정리는 이미 끝난 채로 남는다).
 *
 * matchmaking 정리는 종료 core 호출과 동일한 동기 구간에서 실행돼야 하므로(중간에 다른
 * 요청이 gameRooms/playerRoom을 건드릴 수 없어야 함), 호출자는 이 함수를
 * endGameSessionForPlayer 성공 직후 await 없이 즉시 호출해야 한다.
 */
function finalizeGameSessionEnd(io, session, reason, leftUuid, cleanupUuids) {
    // F-26b(AC-05): 이 session의 완료 수신 보관함을 game_ended 전송보다 먼저 지운다 — 종료 전송
    // 중에 재진입한 완료 요청도 이미 취소된 사건으로 거부되게 한다.
    nightSuccessReceiptsBySession.delete(session)

    /**
     * F-23(AC-04): 종료 수신 후보와 **정리 전 제외 사실**을 여기서 고정한다.
     *
     * 아래 matchmaking 정리는 새 대기방 소속 정보까지 지울 수 있다 — 전송 시점에 처음 물으면
     * "먼저 나가 새 방에 들어간 계정"이 그 정리 때문에 다시 후보로 보인다. cleanupUuids도
     * 방어 복사한다(호출자의 값이 이후 바뀌어도 후보 집합은 달라지지 않는다).
     */
    let endContext = null
    try {
        endContext = buildSessionEndContext(session, leftUuid, cleanupUuids)
    } catch (err) {
        console.error('[GameSession 종료 수신 문맥 구성 실패]', { code: 'END_CONTEXT_ERROR', gameId: session?.id })
    }

    // 전적 저장을 가장 먼저 시도한다 — 아래 정리 단계가 세션에서 읽어갈 값을 지우기 전에
    // 레코드를 동기적으로 확보하기 위함이다(DB 왕복 자체는 기다리지 않는다). 이 경로로 처음
    // 들어온 세션은 승패가 확정되지 않은 중단 경기이고, 이미 저장된 세션(밤/재판 판정으로
    // 완주한 판)은 repository의 GameResult.id PK 멱등 처리가 걸러낸다.
    try {
        const completed = session.phase === 'ENDED' && !!session.winResult
        persistTerminalSession(session, {
            completed,
            disconnectedUuid: completed ? undefined : leftUuid,
        })
    } catch (err) {
        console.error('[GameSession 종료 시 전적 저장 실패]', err)
    }

    try {
        // 종료된 세션에는 진행할 밤 턴도 낮 구간도, 기다릴 재접속도 없다 — 대기 중인 타이머를
        // 여기서 반드시 해제해야 이미 사라진 세션을 나중에 건드리는 콜백이 남지 않는다.
        stopNightTurnSequence(session.id)
        stopDayPhaseTimer(session.id)
        // F-21(AC-03): 끝난 판에는 다시 태울 판정이 없다 — 이탈 재평가 표식도 함께 버린다.
        clearDepartureResolveMark(session.id)
        for (const [uuid, run] of [...(disconnectGraceRuns.get(session.id) ?? [])]) {
            detachDisconnectGraceRun(session.id, uuid, run)
        }
    } catch (err) {
        console.error('[GameSession 종료 시 타이머 정리 실패]', err)
    }

    try {
        // Only accounts released by this termination belong to this cleanup generation.
        matchmaking.cleanupRoomStateForSessionParticipants(io, cleanupUuids)
    } catch (err) {
        console.error('[GameSession 종료 시 matchmaking 정리 실패]', err)
    }

    try {
        // endContext가 없으면(구성 실패) 이 방송은 자격을 판정할 근거가 없다 — 보내지 않는다.
        // 놓친 정상 참가자는 재조회로 회복하지만, 새 소속에 흘러간 종료 알림은 그 화면을
        // 정리하고 로비로 보낸 뒤라 회수할 수 없다(fail-closed).
        if (endContext) {
            emitToGameChannel(io, session, 'game_ended', { gameId: session.id, reason }, endContext)
        } else {
            console.error('[GameSession 종료 알림 폐기]', { code: 'END_EMIT_DROPPED', gameId: session?.id })
        }
    } catch (err) {
        console.error('[GameSession 종료 알림 전송 실패]', err)
    }

    try {
        /**
         * F-23(AC-04): 채널 정리도 **현재 소유권**을 확인한다.
         *
         * 예전에는 `io.in(channelId).socketsLeave(channelId)`로 그 이름의 채널 가입을 일괄
         * 제거했다. channelId는 roomId와 같은 값이라, 같은 방에서 **새 판**이 이미 시작된
         * 경우 그 새 소유자들의 가입까지 함께 지워 새 경기의 방송 경로가 끊긴다. 공통 detach
         * 경계는 지금 그 채널의 정당한 소속이면 되돌리고, 아니면 전달 제외를 유지한 채 끝낸다.
         */
        const registry = io?.sockets?.sockets
        if (registry && typeof registry.values === 'function') {
            for (const member of [...registry.values()]) {
                if (!member?.rooms?.has?.(session.channelId)) continue
                const memberUuid = member.data?.user?.uuid ?? null
                if (typeof memberUuid !== 'string') continue
                detachSocketFromChannel(
                    member, session.channelId, '[GameSession channel 정리 실패]', { gameId: session.id },
                    {
                        ownsChannel: () => ownsSessionChannelNow(member, memberUuid, session.channelId),
                        keepsConnection: () => socketHasLiveMembership(member, memberUuid),
                    },
                )
            }
        }
    } catch (err) {
        console.error('[GameSession channel 정리 실패]', err)
    }

}

/**
 * leave_game_session 명시적 이탈 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * UUID는 socket.data.user.uuid(인증된 신원)만 쓰고, payload에서는 gameId만 읽습니다 —
 * roomId/role/team/nickname 등 다른 필드는 신뢰하지 않고 아예 읽지 않습니다.
 *
 * game-core(endGameSessionForPlayer)가 이미 registry 기준으로 ABA를 방지하므로(요청
 * gameId가 uuid의 현재 활성 세션과 다르면 STALE_SESSION_MISMATCH), 이 함수는 실패 코드가
 * NOT_IN_SESSION/STALE_SESSION_MISMATCH일 때 둘 다 "이미 그 게임에서는 나가 있음"과
 * 동치로 보고 멱등하게 성공 응답한다 — 다른(어쩌면 새로 시작된) 세션을 여기서 잘못
 * 건드리지 않는다.
 */
/**
 * F-23(AC-06): 이탈 커밋이 실패했지만 **요청자가 원한 최종 상태에는 이미 도달한** 코드들.
 *
 * 이 둘만 성공 ACK로 바꾼다 — 나머지(INTERNAL_ERROR 등)는 실제 실패이고, 성공으로 답하면
 * 클라이언트가 아직 참여 중인 판을 정리하고 로비로 간다.
 */
const IDEMPOTENT_DEPARTURE_CODES = new Set(['ALREADY_LEFT', 'NOT_A_PARTICIPANT'])

function handleLeaveGameSession(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const normalizedGameId = gameId.trim()
    if (!normalizedGameId) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    // ── F-21(AC-03/AC-05): 비종결 세션의 명시적 이탈은 **개인 전이**다 ──────────
    //
    // 예전에는 이 경로가 곧바로 endGameSessionForPlayer를 불러, 한 명이 나가면 남은 참가자의
    // 세션까지 통째로 사라졌다. 그래서 "추방은 개인 사망, 이탈은 판 전체 소멸"이라는 비대칭이
    // 생기고 그 차이가 그대로 전적의 차이가 됐다(AC-03이 금지하는 바로 그 상태다).
    //
    // ENDED는 그대로 기존 개인 detach를 쓴다 — 결과가 확정된 판에서 "나간다"는 것은 결과
    // 화면을 닫는 일이고, 마지막 참가자가 나갈 때 세션을 지우는 기존 계약이 정확하다.
    const activeSession = gameSessionCore.getActiveSessionForDeparture(uuid, normalizedGameId)
    if (activeSession && activeSession.phase !== 'ENDED') {
        const departed = applyParticipantDeparture(io, activeSession, uuid, { reason: 'PLAYER_LEFT' })
        /**
         * F-23(AC-06): **실패를 성공 ACK로 바꾸지 않는다.**
         *
         * 예전에는 결과와 무관하게 항상 { ok: true }였다. 그래서 커밋이 실제로 실패한 경우
         * (core 예외 → INTERNAL_ERROR, 사망 커밋 실패)에도 클라이언트는 성공으로 읽고 화면을
         * 정리한 뒤 로비로 갔다 — 서버에는 여전히 참여 중인 참가자가 남는다.
         *
         * 다만 "이미 빠져 있었다"는 실패가 아니다. 중복 나가기·유예 만료 뒤의 재시도·늦은
         * 재전송은 모두 요청자가 원한 최종 상태에 이미 도달해 있으므로 기존 멱등 성공 계약을
         * 그대로 유지한다(그 구분이 없으면 정상적인 재시도가 오류로 보인다).
         */
        if (departed.ok || IDEMPOTENT_DEPARTURE_CODES.has(departed.code)) {
            respond(callback, { ok: true })
        } else {
            respond(callback, {
                ok: false,
                code: departed.code ?? 'INTERNAL_ERROR',
                message: '요청을 처리하지 못했습니다.',
            })
        }
        if (departed.ok) {
            // 나간 본인의 소켓만 채널에서 내보낸다 — 남은 참가자의 방송 경로는 그대로다.
            detachSocketFromChannel(
                socket, activeSession.channelId, '[게임 이탈 채널 정리 실패]', { gameId: activeSession.id },
                // 이 이탈의 채널 정리가 늦게 끝나는 사이 같은 소켓이 같은 방의 **새 판**에
                // 정상 입장했을 수 있다(channelId는 roomId라 값이 같다). 그때의 늦은 거부로
                // 새 소속의 연결을 끊지 않는다.
                {
                    ownsChannel: () => ownsSessionChannelNow(socket, uuid, activeSession.channelId),
                    keepsConnection: () => socketHasLiveMembership(socket, uuid),
                },
            )
            try {
                matchmaking.cleanupRoomStateForSessionParticipants(io, [uuid])
            } catch (err) {
                console.error('[게임 이탈 시 matchmaking 정리 실패]', err)
            }
        }
        return
    }

    let result
    try {
        result = gameSessionCore.endGameSessionForPlayer(uuid, 'PLAYER_LEFT', normalizedGameId)
    } catch (err) {
        console.error('[게임 이탈 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        respond(callback, { ok: true })
        return
    }

    respond(callback, { ok: true })
    // ENDED 세션은 마지막 참가자가 이탈할 때만(result.sessionDeleted===true) registry에서
    // 실제로 지워진다 — 그 전까지는 세션이 여전히 존재하므로 game_ended 재방송·channel 정리를
    // 하지 않는다(비-ENDED 경로는 core가 항상 sessionDeleted:true를 반환하므로 회귀가 없다).
    if (result.sessionDeleted) {
        finalizeGameSessionEnd(io, result.session, result.reason, uuid, result.cleanupUuids)
    }
}

/**
 * uuid가 지금 어떤 socket으로든 연결돼 있는지 확인한다(읽기 전용). isCurrentSocketForUuid와
 * 동일한 canonical uuid→socketId 원천(onlineUsersRegistry)을 재사용하지만, "이 socket이
 * uuid의 현재 canonical socket인지"가 아니라 "registry가 가리키는 그 socket이 지금 실제로
 * io에 연결돼 있는지"만 본다 — get_session_snapshot의 roster enrichment 전용이다.
 * resolveSessionParticipantSockets/resolveJokerTeammateSockets(채널 가입 여부까지 요구하는
 * delivery-target 개념)와는 다른 목적이라 재사용하지 않는다.
 */
function isUuidConnected(io, uuid) {
    return getSocketForUuid(io, uuid) !== null
}

/**
 * F-21(AC-03): 그 계정의 **현재 canonical 소켓**(연결돼 있을 때만). 없으면 null.
 *
 * 개인 전송(본인 제출 상태 등)의 유일한 대상 결정 경계다. 채널 가입 여부는 묻지 않는다 —
 * 개인 사건은 채널이 아니라 그 연결로 직접 간다.
 */
function getSocketForUuid(io, uuid) {
    const socketId = onlineUsersRegistry instanceof Map ? onlineUsersRegistry.get(uuid) : undefined
    if (!socketId) return null
    const socket = io?.sockets?.sockets?.get(socketId)
    return socket?.connected === true ? socket : null
}

/**
 * get_session_snapshot 요청-ACK 전용 조회 핸들러입니다. 다른 8개 핸들러와 달리
 * assertSessionNotEnded guard는 적용되지 않습니다 — ENDED 이후에도 최종 결과(phase/winResult/
 * players)를 조회할 수 있어야 합니다. 그러나 current-socket 권한(isCurrentSocketForUuid)은
 * 다른 모든 핸들러와 동일하게 최우선으로 검사합니다 — 읽기 전용이라도 재접속으로 교체된 낡은
 * socket이 스냅샷을 조회할 수는 없습니다. uuid는 인증된 socket에서 전달받은 값만 쓰고, payload는
 * 선택적 gameId만 읽습니다(생략 시 검증을 건너뛰고, 주어지면 canonical session.id와 일치해야
 * 합니다 — 공백/빈 문자열도 "생략"이 아니라 불일치로 취급됩니다).
 */
function handleGetSessionSnapshot(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (gameId !== undefined && typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.getSessionSnapshotForPlayer(uuid, gameId)
    } catch (err) {
        console.error('[세션 스냅샷 조회 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[세션 스냅샷 조회 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        if (result.code === 'FORFEITED_FROM_SESSION') {
            // 유예 만료로 배제된 참가자에게는 "일시적 오류"가 아니라 참여 불가 사유를 알린다 —
            // 이 안내를 받은 클라이언트는 재시도하지 않고 로비로 돌아가야 한다.
            respond(callback, {
                ok: false,
                code: result.code,
                message: '연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다.',
            })
            return
        }
        // GAME_ID_MISMATCH(공백/빈 문자열로 넘어온 경우 포함)는 클라이언트에 그대로 전달한다.
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // 스냅샷을 받을 자격이 확인된 시점이 곧 "돌아왔다"의 서버측 근거다 — resyncSessionRouting을
    // 거치지 않고(예: 같은 소켓이 연결을 유지한 채) 스냅샷만 다시 요청한 클라이언트도 여기서
    // 유예가 풀린다. 이미 취소됐거나 유예가 없으면 no-op이다.
    cancelDisconnectGrace(result.snapshot.gameId, uuid)

    // roster에 실시간 연결 여부만 덧붙인다 — canonical snapshot 자체(result.snapshot)는
    // 변형하지 않고 새 배열/객체로 다시 조립한다(defensive copy 유지).
    const players = result.snapshot.players.map((player) => ({
        ...player,
        isConnected: isUuidConnected(io, player.uuid),
    }))

    // ── F-26(AC-01/AC-02/AC-04/AC-05): 미완료 성공 사건 복원 ─────────────────────
    //
    // 새로 배정하지 않는다. 이 조회가 돌려주는 것은 **이미 이 계정에게 전달된 뒤 완료 ACK를
    // 받지 못한** 기록의 보관 payload뿐이다. 완료된 기록·다른 계정·다른 소속의 기록·내부
    // contract·socket 정보는 어디에도 실리지 않는다.
    //
    // 수명은 기존 완료 창을 그대로 쓰되(isNightSuccessCompletionWindowOpen) **ENDED는 제외**한다 —
    // 결과가 확정된 판에서 다시 연출을 시작하지 않는다는 운영자 확정 경계다. 그래서 허용은
    // NIGHT n · DAY n+1 · TRIBUNAL n+1이다.
    const recoverySession = gameSessionCore.getActiveSessionForDeparture(uuid, result.snapshot.gameId)
    const receiptStore = recoverySession ? nightSuccessReceiptsBySession.get(recoverySession) : null
    const nightSuccessRecovery = []
    if (receiptStore
        && recoverySession.phase !== 'ENDED'
        && isNightSuccessCompletionWindowOpen(recoverySession, receiptStore.nightDayIndex)) {
        const membershipId = recoverySession.players.get(uuid)?.membershipId ?? null
        const pending = collectPendingNightSuccessRecords(receiptStore, uuid, membershipId)
        if (pending.length > 0) {
            // **재가입이 끝나지 않은 조회는 빈 복원 성공으로 답하지 않는다.** 그 순간에는 수신
            // 자격 자체를 확인할 수 없어(채널 미가입) 복원할 사건이 있어도 0건이 된다 —
            // 클라이언트는 그것을 "복원할 것이 없다"로 읽고 다시 묻지 않는다. 같은 범위의
            // 재동기화 작업을 시작(또는 공유)하고 보류를 명시적으로 알린다.
            if (!isEligibleSessionRecipient(recoverySession, socket, uuid)
                && !socket.rooms?.has?.(recoverySession.channelId)
                && gameSessionCore.getActiveSessionRoutingInfo(uuid)?.channelId === recoverySession.channelId) {
                resyncSessionRouting(socket, uuid).catch((err) => {
                    console.error('\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m', err)
                })
                respond(callback, {
                    ok: false,
                    code: 'SESSION_ROUTING_PENDING',
                    message: '게임 정보를 다시 불러오는 중입니다.',
                })
                return
            }
            // 준비가 끝났으면 **현재 자격**을 다시 확인한 뒤에만 결속·복사한다. 여기서부터
            // 응답까지 await가 없으므로 그 사이에 자격이 바뀔 수 없다.
            if (isCurrentSocketForUuid(uuid, socket, io)
                && isEligibleSessionRecipient(recoverySession, socket, uuid)
                && !hasMembershipOutsideSession(recoverySession, uuid)) {
                for (const record of pending) {
                    record.socket = socket
                    record.socketId = socket.id
                    nightSuccessRecovery.push(copyNightSuccessPayload(record.payload))
                }
            }
        }
    }

    respond(callback, {
        ok: true,
        ...result.snapshot,
        players,
        // 복원할 사건이 없으면 **키 자체를 만들지 않는다** — 기존 응답과 완전히 같은 모양을
        // 유지한다(클라이언트는 키 없음을 "복원할 것 없음"으로 읽는 기존 호환 분기를 쓴다).
        ...(nightSuccessRecovery.length > 0 ? { nightSuccessRecovery } : {}),
    })
}

/**
 * F-26(AC-01/AC-02/AC-05): 이 계정의 **미완료·같은 소속·복원 payload가 있는** 기록만 고른다.
 *
 * completed=true는 절대 포함하지 않는다(응답 유실로 클라이언트가 완료를 모르더라도 서버 완료가
 * 권위다 — 다시 연출하지 않는다). 다른 uuid의 기록은 순회 대상 자체가 아니고, 소속이 다른
 * 기록은 이 자리의 사실이 아니다. payload가 없는 기록(모양 오류로 보관되지 않은 경우)도 뺀다.
 */
function collectPendingNightSuccessRecords(store, uuid, membershipId) {
    const pending = []
    for (const byUuid of store.byEvent.values()) {
        const record = byUuid.get(uuid)
        if (!record) continue
        if (record.completed === true) continue
        if (record.membershipId !== membershipId) continue
        if (copyNightSuccessPayload(record.payload) === null) continue
        pending.push(record)
    }
    return pending
}

/**
 * F-21(AC-01/AC-03/AC-04): 진행 중인 판에서 방장이 참가자를 추방한다.
 *
 * 대기방 추방(matchmaking.js::handleKickRoomPlayer)과 **같은 순서**를 지킨다:
 * 형태 → canonical 소켓 → 영수증 → boot → 본인 → 세션/방장/양쪽 소속 → 대상 → 용량 →
 * 커밋 → 영수증 확정 → 통지. 두 명령이 같은 영수증 표를 공유하므로, 방장이 대기방에서
 * 시작해 게임으로 넘어간 뒤에도 자기 요청의 결과를 하나의 조회로 확인할 수 있다.
 *
 * alive=false이지만 아직 참여 중인 대상도 추방할 수 있다 — 사망은 추방 거부 사유가 아니다
 * (A-06). 그 경우 core가 사망을 다시 만들지 않고 참여 종료만 기록한다.
 */
function handleKickGamePlayer(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    const CODES = kickReceiptStore.KICK_ERROR_CODES
    const reject = (code, message) => respond(callback, { ok: false, code, message })

    const validated = kickReceiptStore.validateKickPayload(payload, kickReceiptStore.KICK_COMMANDS.GAME)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const input = validated.value
    const fingerprint = kickReceiptStore.fingerprintKickRequest(kickReceiptStore.KICK_COMMANDS.GAME, input)

    // 권한 판정의 유일한 술어다(다른 9개 핸들러와 같은 것을 쓴다).
    if (!isCurrentSocketForUuid(uuid, socket)) {
        reject(CODES.STALE_SOCKET, '요청을 처리할 수 없습니다.')
        return
    }

    const receiptKey = kickReceiptStore.kickReceiptKey(input.bootEpoch, uuid, input.requestId)
    const recorded = kickReceiptStore.lookupKickReceipt(receiptKey)
    if (recorded) {
        if (recorded.fingerprint !== fingerprint) {
            reject(CODES.REQUEST_ID_REUSED, '이미 사용한 요청 식별자입니다.')
            return
        }
        respond(callback, { ...recorded.result, replayed: true })
        return
    }

    if (input.bootEpoch !== kickReceiptStore.BOOT_EPOCH) {
        reject(CODES.STALE_BOOT, '서버가 재시작되었습니다. 게임 정보를 다시 불러와주세요.')
        return
    }
    // ── 여기부터의 거부는 **결정**이다(대기방 추방과 같은 계약) ──────────────────
    //
    // 형태·연결·boot 실패와 달리 아래 검사들은 "이 요청은 실행되지 않는다"를 서버가 확정한
    // 것이다. 기록하지 않으면 같은 requestId의 재전달이 그때의 현재 상태로 다시 판정된다 —
    // NOT_HOST로 거부된 요청이 방장 승계 뒤에 그대로 실행되는 것이 그 결과다(AC-04).
    //
    // 그래서 **결정을 보존할 수 없으면 결정하지 않는다.** 기록할 자리가 없을 때 확정 거부를
    // 그대로 돌려주면 그 답은 10분 뒤가 아니라 즉시 거짓이 된다(재조회는 UNKNOWN인데 응답은
    // 확정 거부였다). 그 경우에는 명시적으로 **미결정**인 용량 결과를 돌려준다 — 결정된
    // 결과를 조용히 다른 코드로 바꾸는 것이 아니라, 아직 결정하지 않았다고 답하는 것이다.
    // 거부 기록에는 커밋용 자리를 남겨 두는 더 낮은 수위를 쓴다(대기방 추방과 같은 규칙).
    const decideReject = (code, message) => {
        if (!kickReceiptStore.hasKickRejectionCapacity()) {
            reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
            return
        }
        kickReceiptStore.recordKickReceipt(receiptKey, {
            command: kickReceiptStore.KICK_COMMANDS.GAME,
            fingerprint,
            result: { ok: false, code, message },
        })
        reject(code, message)
    }

    if (input.targetUuid === uuid) {
        decideReject(CODES.SELF_KICK, '자신을 추방할 수 없습니다.')
        return
    }

    const session = gameSessionCore.getActiveSessionForDeparture(uuid, input.gameId)
    if (!session) {
        decideReject(CODES.SESSION_NOT_FOUND, '참여 중인 게임을 찾을 수 없습니다.')
        return
    }
    if (session.phase === 'ENDED') {
        // 결과가 확정된 판에서는 추방할 것이 없다. 이미 끝난 판의 roster를 바꾸면 그 판의
        // 전적 레코드와 결과 화면이 서로 다른 명단을 말하게 된다.
        decideReject(CODES.GAME_ALREADY_ENDED, '이미 종료된 게임입니다.')
        return
    }
    // 같은 roomId로 다시 만들어진 방에서 시작된 새 판의 옛 명령을 여기서 끝낸다.
    if ((session.roomInstanceId ?? session.roomId) !== input.roomInstanceId || session.roomId !== input.roomId) {
        decideReject(CODES.SESSION_NOT_FOUND, '참여 중인 게임을 찾을 수 없습니다.')
        return
    }

    const requester = session.players.get(uuid)
    if (!requester) {
        decideReject(CODES.NOT_A_PARTICIPANT, '참여 중인 게임을 찾을 수 없습니다.')
        return
    }
    if ((requester.membershipId ?? null) !== input.requesterMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '게임 정보가 변경되었습니다. 다시 불러와주세요.')
        return
    }
    if (session.hostUuid !== uuid) {
        decideReject(CODES.NOT_HOST, '방장만 추방할 수 있습니다.')
        return
    }

    const target = session.players.get(input.targetUuid)
    if (!target) {
        // 이 판의 roster에 애초에 없던 계정이다("이미 나간 사람"과 구분되는 사유다).
        decideReject(CODES.NOT_A_PARTICIPANT, '이 게임의 참가자가 아닙니다.')
        return
    }
    if (!gameSessionCore.isParticipatingInSession(session, input.targetUuid)) {
        decideReject(CODES.ALREADY_LEFT, '이미 게임에서 나간 참가자입니다.')
        return
    }
    if ((target.membershipId ?? null) !== input.targetMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '대상이 변경되었습니다. 다시 확인해주세요.')
        return
    }

    if (!kickReceiptStore.hasKickReceiptCapacity()) {
        reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
        return
    }

    // ── 커밋 ─────────────────────────────────────────────────────────────────
    const kickedEvent = {
        gameId: session.id,
        roomId: session.roomId,
        roomInstanceId: session.roomInstanceId ?? session.roomId,
        bootEpoch: kickReceiptStore.BOOT_EPOCH,
        targetUuid: input.targetUuid,
        targetMembershipId: target.membershipId ?? null,
        hostUuid: uuid,
        requestId: input.requestId,
    }
    const targetSocket = getCurrentSocketForUuid(io, input.targetUuid)

    const result = {
        ok: true,
        status: 'KICKED',
        gameId: session.id,
        requestId: input.requestId,
        targetUuid: input.targetUuid,
        targetMembershipId: input.targetMembershipId,
    }

    // 영수증은 **core 커밋 직후·모든 방송 이전**에 확정한다(onCommitted 훅). 커밋과 기록
    // 사이에 emit·저장·타이머가 끼면, 그중 하나가 던졌을 때 서버는 이미 참가자를 내보냈는데
    // 기록은 없는 상태가 되어 원 요청자가 결과를 영영 확인할 수 없다(A-08).
    const departed = applyParticipantDeparture(io, session, input.targetUuid, {
        reason: 'KICKED_BY_HOST',
        onCommitted: () => {
            kickReceiptStore.recordKickReceipt(receiptKey, {
                command: kickReceiptStore.KICK_COMMANDS.GAME,
                fingerprint,
                result,
            })
            // 영수증을 확정한 **직후·모든 방송 이전에** 채널에서 뗀다. 대기방 경로와 같은
            // 순서다(notifyRoomDeparture도 채널 정리를 먼저 한다) — 그러지 않으면 이 이탈이
            // 유발하는 사망·참여 변화·단계 판정 방송을 방금 내보낸 당사자가 그대로 받는다.
            // 개인 통지(game_kicked)는 채널이 아니라 그 소켓에 직접 보내므로 영향받지 않는다.
            detachSocketFromChannel(
                targetSocket, session.channelId, '[추방 채널 이탈 실패]', { gameId: session.id },
                // 추방된 대상이 그 사이 같은 방의 새 판에 정상 입장했다면(옛 판은 이미 끝나
                // 정리된 뒤다) 그 연결은 더 이상 이 정리의 것이 아니다. 새 대기방 소속도 같다.
                {
                    ownsChannel: () => ownsSessionChannelNow(targetSocket, input.targetUuid, session.channelId),
                    keepsConnection: () => socketHasLiveMembership(targetSocket, input.targetUuid),
                },
            )
        },
    })
    if (!departed.ok) {
        // 커밋이 실패했다는 것은 아무 상태도 바뀌지 않았다는 뜻이다(훅도 실행되지 않았다).
        // ALREADY_LEFT는 "실행되지 않는다"는 **결정**이므로 대기방과 같은 규칙으로 기록한다.
        // INTERNAL_ERROR는 결과를 알 수 없다는 뜻이라 기록하지 않는다 — 알 수 없는 것을
        // 확정된 거부로 굳히면 재조회가 거짓을 말하게 된다.
        if (departed.code === 'ALREADY_LEFT') {
            decideReject(CODES.ALREADY_LEFT, '이미 게임에서 나간 참가자입니다.')
        } else {
            reject(CODES.INTERNAL_ERROR, '요청을 처리하지 못했습니다.')
        }
        return
    }

    // ── 통지 — 각각 격리한다 ─────────────────────────────────────────────────
    respond(callback, result)
    if (targetSocket) {
        try {
            targetSocket.emit(kickReceiptStore.KICK_EVENTS.GAME_KICKED, kickedEvent)
        } catch (err) {
            console.error('[추방 개인 통지 실패]', { code: 'KICK_NOTIFY_ERROR', gameId: session.id })
        }
    }
    try {
        // 추방된 계정이 이 판 때문에 잡고 있던 대기방 소속·큐를 함께 정리한다.
        matchmaking.cleanupRoomStateForSessionParticipants(io, [input.targetUuid])
    } catch (err) {
        console.error('[추방 시 matchmaking 정리 실패]', err)
    }
}

/**
 * F-21(AC-04): ACK를 놓친 **원 요청자**가 자기 추방 명령의 결과를 확인한다.
 *
 * 새 추방을 만들지 않고 기록만 읽으며, 현재 방장인지·방이 아직 있는지로 과거 결과를 바꾸지
 * 않는다. 기록이 없으면(만료·재시작·알 수 없는 키) 성공도 미실행도 단정하지 않고 UNKNOWN이다.
 * 대기방·게임 두 명령이 같은 표를 쓰므로 조회 경로도 하나뿐이다.
 */
function handleGetKickResult(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    const CODES = kickReceiptStore.KICK_ERROR_CODES
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: CODES.STALE_SOCKET, message: '요청을 처리할 수 없습니다.' })
        return
    }

    const validated = kickReceiptStore.validateKickResultQuery(payload)
    if (!validated.ok) {
        respond(callback, { ok: false, code: validated.code, message: validated.message })
        return
    }
    const { bootEpoch, requestId } = validated.value

    // 키에 인증된 uuid가 들어가므로 다른 계정은 같은 requestId로도 남의 결과를 읽을 수 없다.
    const recorded = kickReceiptStore.lookupKickReceipt(
        kickReceiptStore.kickReceiptKey(bootEpoch, uuid, requestId),
    )
    if (!recorded) {
        respond(callback, { ok: true, status: 'UNKNOWN', bootEpoch, requestId })
        return
    }
    respond(callback, { ...recorded.result, replayed: true, bootEpoch, requestId })
}

/** 이 계정의 현재 canonical 소켓(연결돼 있을 때만). 개인 사건 전달 대상 판정에만 쓴다. */
function getCurrentSocketForUuid(io, uuid) {
    const socketId = onlineUsersRegistry instanceof Map ? onlineUsersRegistry.get(uuid) : undefined
    if (!socketId) return null
    const socket = io?.sockets?.sockets?.get(socketId)
    return socket?.connected === true ? socket : null
}

/** ROLE_REVEAL 확인·낮 투표 준비·NIGHT 행동 제출·JOKER 비밀 채팅·공개 DAY/사망자 채팅·명시적 이탈 이벤트 배선을 담당합니다. */
// F-26b(AC-05): acknowledge_night_action_success가 허용하는 정확한 필드 집합. uuid·
// membershipId·perspectives·targetId·서버 내부 wait 토큰 같은 값은 이 요청에 실리지 않는다 —
// 그런 키가 하나라도 있으면(오타·다른 계약 payload 재사용 등) 형태 오류로 즉시 거부한다.
const NIGHT_SUCCESS_ACK_ALLOWED_KEYS = new Set(['gameId', 'nightDayIndex', 'eventId'])

/**
 * F-26b(AC-05): 지금 이 session의 phase/dayIndex가 밤 nightDayIndex의 사건을 완료할 수 있는
 * 수명 안인가. 수락은 NIGHT n에서만 일어나고, 완료는 그 수락 범위가 유지된 채 NIGHT n·
 * DAY n+1·TRIBUNAL n+1·ENDED n 또는 n+1일 때만 허용한다(다음 NIGHT n+1부터는 보관함 자체가
 * 교체돼 STALE_EVENT가 되지만, 이 검사는 phase/dayIndex 기준으로 같은 경계를 한 번 더 명시한다).
 */
function isNightSuccessCompletionWindowOpen(session, nightDayIndex) {
    if (session.phase === 'NIGHT') return session.dayIndex === nightDayIndex
    if (session.phase === 'DAY' || session.phase === 'TRIBUNAL') return session.dayIndex === nightDayIndex + 1
    if (session.phase === 'ENDED') return session.dayIndex === nightDayIndex || session.dayIndex === nightDayIndex + 1
    return false
}

/**
 * F-26b(AC-05): 밤 성공 사건 소비 완료 ACK. registerGameHandlers가
 * acknowledge_night_action_success로 등록한다 — 완료 여부만 기록하고 턴 진행·판정·대기 해제는
 * 어떤 것도 건드리지 않는다(releaseNightPresentationWait는 여전히 즉시 통과이고, 실제 대기
 * 구현은 F-27a의 몫으로 남는다).
 *
 * callback은 **선택적**이다(계획 계약) — 없거나 함수가 아니면 검증·최초 완료 기록은 그대로
 * 수행하고 응답만 생략한다. frontend/src/domains/game/ingame/store/ingameStore.js의
 * completeNightSuccess는 항상 callback을 넘기지만, 이 핸들러 자체의 계약은 그것과 독립적이다.
 *
 * 검증은 형태(정확히 세 필드) → 연결/canonical 소켓 → 참여 세션 → 완료 보관함의 사건·수명
 * (phase/dayIndex 포함) → 원래 수신자(소켓 객체·id·소속)·현재 채널 자격 순으로 진행하고, 중복
 * 판정은 그 모두를 통과한 **뒤**에 온다. 실패 응답은 INVALID_PAYLOAD·NOT_ELIGIBLE·STALE_EVENT
 * 중 하나이며 사건이나 다른 수신자의 정보를 담지 않는다. 성공 응답은 {ok:true, duplicate}뿐이다 —
 * 최초 완료는 duplicate:false, 같은 수신자의 재요청은 duplicate:true다.
 */
function handleAcknowledgeNightActionSuccess(io, socket, uuid, payload, callback) {
    const reply = typeof callback === 'function' ? (result) => respond(callback, result) : () => {}

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const payloadKeys = Object.keys(payload)
    if (payloadKeys.length !== NIGHT_SUCCESS_ACK_ALLOWED_KEYS.size
        || payloadKeys.some((key) => !NIGHT_SUCCESS_ACK_ALLOWED_KEYS.has(key))) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, nightDayIndex, eventId } = payload
    if (typeof gameId !== 'string' || gameId.length === 0) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isInteger(nightDayIndex) || nightDayIndex < 0) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (typeof eventId !== 'string' || eventId.length === 0) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    if (!isCurrentSocketForUuid(uuid, socket, io)) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }

    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }

    if (!isNightSuccessCompletionWindowOpen(session, nightDayIndex)) {
        reply({ ok: false, code: 'STALE_EVENT', message: '더 이상 유효하지 않은 사건입니다.' })
        return
    }

    const store = nightSuccessReceiptsBySession.get(session)
    if (!store || store.nightDayIndex !== nightDayIndex) {
        reply({ ok: false, code: 'STALE_EVENT', message: '더 이상 유효하지 않은 사건입니다.' })
        return
    }
    const byUuid = store.byEvent.get(eventId)
    if (!byUuid) {
        reply({ ok: false, code: 'STALE_EVENT', message: '더 이상 유효하지 않은 사건입니다.' })
        return
    }
    const record = byUuid.get(uuid)
    if (!record) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }
    // F-26b: 원래 이 사건을 전달받은 바로 그 소켓 객체·id여야 한다 — 재연결로 만든 새 객체나
    // namespace의 같은 id를 가진 다른 객체는 이 완료의 소유자가 아니다.
    if (record.socket !== socket || record.socketId !== socket.id) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if ((session.players.get(uuid)?.membershipId ?? null) !== record.membershipId) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (!isEligibleSessionRecipient(session, socket, uuid)) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (hasMembershipOutsideSession(session, uuid)) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }

    if (record.completed) {
        reply({ ok: true, duplicate: true })
        return
    }
    record.completed = true
    reply({ ok: true, duplicate: false })
}

function registerGameHandlers(io, socket, uuid) {
    /**
     * F-23(AC-04): 배선과 **같은 동기 구간**에서 이 연결의 소유권을 기록한다.
     *
     * socket.js의 registerConnectionHandlers는 handleConnection(첫 await 이전 동기 구간에서
     * onlineUsers를 이 소켓으로 교체한다)을 먼저 부른 뒤 이 함수를 부른다 — 그래서 여기서는
     * registry 매핑과 namespace 등록이 모두 이미 사실이고, 그 사실을 그대로 검증해 남긴다.
     * 실패하면 아무것도 기록하지 않는다(기록 없음 = 제거 후 disconnect 처리 근거 없음).
     */
    recordConnectionOwnership(io, socket, uuid)
    socket.on('acknowledge_role_reveal', (payload, callback) => handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback))
    socket.on('ready_for_day_vote', (payload, callback) => handleAcknowledgeDayVoteReady(io, socket, uuid, payload, callback))
    socket.on('submit_night_action', (payload, callback) => handleSubmitNightAction(socket, uuid, payload, callback))
    socket.on('submit_joker_chat_message', (payload, callback) => handleSubmitJokerChatMessage(io, socket, uuid, payload, callback))
    socket.on('submit_game_chat_message', (payload, callback) => handleSubmitGameChatMessage(io, socket, uuid, payload, callback))
    socket.on('resolve_night', (payload, callback) => handleResolveNight(io, socket, uuid, payload, callback))
    socket.on('cast_day_vote', (payload, callback) => handleSubmitDayVote(io, socket, uuid, payload, callback))
    socket.on('resolve_day_vote', (payload, callback) => handleResolveDayVote(io, socket, uuid, payload, callback))
    socket.on('cast_tribunal_vote', (payload, callback) => handleCastTribunalVote(io, socket, uuid, payload, callback))
    socket.on('resolve_tribunal_vote', (payload, callback) => handleResolveTribunalVote(io, socket, uuid, payload, callback))
    socket.on('leave_game_session', (payload, callback) => handleLeaveGameSession(io, socket, uuid, payload, callback))
    socket.on('get_session_snapshot', (payload, callback) => handleGetSessionSnapshot(io, socket, uuid, payload, callback))
    // F-26b: 밤 성공 사건 소비 완료 ACK. 등록 당시 uuid를 캡처해 F-26a의 개별 전달과 같은
    // 방식으로 인증 신원을 신뢰한다.
    socket.on('acknowledge_night_action_success', (payload, callback) =>
        handleAcknowledgeNightActionSuccess(io, socket, uuid, payload, callback))
    // F-21: 진행 중 추방과, 대기방·게임 공용 결과 재조회. 결과 조회를 여기 한 번만 등록하는
    // 이유는 registerGameHandlers가 게임 참가 여부와 무관하게 모든 연결에 걸리기 때문이다 —
    // 방금 방을 떠난 대기방 방장도 같은 이벤트로 자기 명령의 결과를 확인할 수 있다.
    socket.on(kickReceiptStore.KICK_EVENTS.KICK_GAME_PLAYER, (payload, callback) =>
        handleKickGamePlayer(io, socket, uuid, payload, callback))
    socket.on(kickReceiptStore.KICK_EVENTS.GET_KICK_RESULT, (payload, callback) =>
        handleGetKickResult(io, socket, uuid, payload, callback))
}

/**
 * 참가자 disconnect를 처리합니다 — 세션의 phase에 따라 경로가 둘로 갈립니다.
 *
 * 게임이 실제로 존재하는 동안(ROLE_REVEAL/DAY/NIGHT/TRIBUNAL) 세션을 종료하지 않고 그 참가자에게만 재접속
 * 유예를 겁니다(beginDisconnectGrace). 남은 참가자의 페이즈·타이머·턴은 어떤 것도 여기서
 * 멈추지 않으며, 유예 안에 돌아오지 않은 참가자만 나중에 사망으로 확정됩니다.
 *
 * ENDED 또는 활성 세션이 없는 경우에만 기존 정리 경로를 사용합니다. ROLE_REVEAL 중 끊김도
 * 첫 DAY가 열리는 top-level 경계까지 유예해 시작 직전 일시 단절로 전체 세션을 잃지 않습니다.
 *
 * ABA 방지: 게임 시작 시 참가자 Socket에 결합해 둔 canonical gameId(socket.data.activeGameId,
 * matchmaking.js의 handleStartGame이 설정)를 expectedGameId로 종료 core에 전달한다. 결합이
 * 없는 Socket(한 번도 게임에 참여한 적 없는 Socket)의 disconnect는 애초에 종료 core를
 * 호출하지 않는다 — 세션 A를 명시적으로 종료한 뒤에도 이 결합은 지워지지 않고 A를 가리킨
 * 채로 남으므로(handleLeaveGameSession 참고), 같은 uuid가 다른 Socket으로 세션 B를 새로
 * 시작한 뒤 도착하는 이 Socket의 지연 disconnect는 STALE_SESSION_MISMATCH로 조용히
 * no-op된다. 같은 Socket이 이후 새 세션을 시작하면 결합값이 그 세션으로 갱신되므로(다시
 * matchmaking.js의 handleStartGame), 그 이후의 disconnect는 새 세션의 유예를 정상 시작한다.
 *
 * game_ended payload는 { gameId, reason }만 담습니다. 수신자에 따라 달라지는 값이
 * 없으므로(참가자 uuid/nickname/role 등 어떤 식별 정보도 없음) game_started처럼
 * 참가자별로 다른 payload를 개별 전달할 필요가 없습니다 — 이미 남은 참가자들이 전부
 * 가입해 있는 기존 channel(session.channelId)에 한 번만 방송하면 충분하고, 이 편이
 * 더 단순하고 정확합니다.
 */
async function onDisconnect(io, socket, uuid) {
    /**
     * F-23(AC-04): 활성 요청 권한을 **무조건 재사용하지 않는다**.
     *
     * 실제 Socket.IO는 disconnect를 emit하기 전에 이미 namespace에서 이 소켓을 제거하고
     * connected=false로 바꾼다 — 활성 요청과 같은 기준(namespace에 있고 그 객체가 나)을 그대로
     * 쓰면 정상적인 새로고침·탭 종료가 전부 stale이 되어 유예도 종료도 일어나지 않는다.
     * 제거 후에는 **등록 시 검증해 둔 연결 소유권**만이 근거다(canProcessDisconnectFor 참고).
     */
    if (!canProcessDisconnectFor(io, socket, uuid)) return
    // 이 기록은 여기서 한 번만 소비한다 — 같은 옛 연결의 늦은 중복 disconnect는 두 번
    // 처리되지 않고, 그 사이 생긴 새 연결의 기록은 건드리지 않는다.
    consumeConnectionOwnership(socket, uuid)

    const expectedGameId = socket?.data?.activeGameId
    if (expectedGameId === undefined) return

    // 진행 중인 세션(ROLE_REVEAL/DAY/NIGHT/TRIBUNAL)에서는 종료하지 않고 재접속 유예만 건다 —
    // 남은 참가자의 게임은 이 disconnect로 어떤 영향도 받지 않고 그대로 이어진다. 낡은 소켓의
    // 지연 disconnect는 위의 isCurrentSocketForUuid에서, 다른 세션을 가리키는 결합은
    // getDisconnectGraceTarget의 expectedGameId 대조에서 각각 걸러진다(둘 다 기존 가드와 동일).
    const graceTarget = gameSessionCore.getDisconnectGraceTarget(uuid, expectedGameId)
    if (graceTarget) {
        beginDisconnectGrace(io, graceTarget.session, uuid)
        return
    }

    // Already-dead participants need no elimination timer, but still retain their
    // active game and reconnect rights. A missing grace target is not evidence that
    // the game ended: falling through here used to delete every participant's session.
    const reconnectState = gameSessionCore.getSessionSnapshotForPlayer(uuid, expectedGameId)
    if (reconnectState.ok && ['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL'].includes(reconnectState.snapshot.phase)) return

    let result
    try {
        result = gameSessionCore.endGameSessionForPlayer(uuid, 'PARTICIPANT_LEFT', expectedGameId)
    } catch (err) {
        console.error('[GameSession 종료 처리 에러]', err)
        return
    }
    if (!result.ok) return
    // handleLeaveGameSession과 동일한 이유로, 마지막 참가자 이탈일 때만 실제 정리를 수행한다.
    if (!result.sessionDeleted) return

    finalizeGameSessionEnd(io, result.session, result.reason, uuid, result.cleanupUuids)
}

/** 활성 GameSession registry의 read-only presence snapshot을 그대로 전달합니다. */
function getActiveGamePresenceSnapshot() {
    return gameSessionCore.getActiveGamePresenceSnapshot()
}

module.exports = {
    registerGameHandlers,
    onDisconnect,
    setOnlineUsersRegistry,
    // F-21(A-10): 전적 커밋 이후의 개인 캐시 무효화 전송기. registry와 같은 곳에서 주입된다.
    setEmitToUser,
    isCurrentSocketForUuid,
    resyncSessionRouting,
    getActiveGamePresenceSnapshot,
    // F-21: 이벤트명·오류 코드는 kickReceiptStore가 소유한다. 호출부·시험이 문자열을 복붙하지
    // 않도록 그대로 다시 내보낸다(matchmaking.js의 ROOM_SETTINGS_* 관례와 동일).
    KICK_EVENTS: kickReceiptStore.KICK_EVENTS,
    KICK_ERROR_CODES: kickReceiptStore.KICK_ERROR_CODES,
    __resetStateForTests,
    __getOnlineUsersRegistryForTests,
    // 테스트에서 socket.on 배선 없이 핸들러를 직접 호출하기 위한 통로입니다(matchmaking.js의
    // __testables 관례와 동일). 런타임 코드에서는 참조하지 않습니다.
    __testables: {
        handleAcknowledgeRoleReveal,
        handleAcknowledgeDayVoteReady,
        handleSubmitNightAction,
        handleSubmitJokerChatMessage,
        handleSubmitGameChatMessage,
        handleResolveNight,
        // F-25b: 수동 resolve_night와 자동 밤 최종화가 공유하는 유일한 확정 경계.
        finalizeNightForSession,
        endNightTurn,
        handleSubmitDayVote,
        handleResolveDayVote,
        handleCastTribunalVote,
        handleResolveTribunalVote,
        handleLeaveGameSession,
        handleGetSessionSnapshot,
        // F-21: kick_game_player / get_kick_result가 그대로 부르는 실제 경로와 공통 이탈 경계.
        handleKickGamePlayer,
        handleGetKickResult,
        applyParticipantDeparture,
        finalizeGameSessionEnd,
        persistTerminalSession,
        // F-21(AC-05/AC-06): 채널 이탈의 완료 후 재검사·되돌리기·전달 제외를 실제 경로로
        // 재현하기 위한 경계(구현은 socket/channelMembership.js가 소유한다).
        detachSocketFromChannel,
        // F-21(A-09): 불변 레코드의 재시도 작업 표와 그 타이머 주입구. 시험이 실제 1/5/30초를
        // 기다리지 않고도 "같은 record로 다시 저장한다"를 확인할 수 있게 한다.
        __getTerminalPersistRunsForTests: () => [...terminalPersistRuns.values()],
        __setTerminalPersistTimersForTests,
        resolveJokerTeammateSockets,
        resolveChatRecipientSockets,
        resolveSessionParticipantSockets,
        // F-23(AC-04): 게임 방송의 유일한 경계와 그 자격 판정. 시험이 원시 io.to()로 흉내내면
        // 어떤 제외도 지나지 않아 "제외가 동작하는가"를 전혀 검사하지 못한다.
        emitToGameChannel,
        isEligibleSessionRecipient,
        // F-23(AC-04): 종료 전용 수신 문맥과 disconnect 처리 권한. 시험이 core→finalizer
        // 수명 계약과 "제거된 소켓의 disconnect"를 실제 경계로 확인할 수 있게 한다.
        buildSessionEndContext,
        canProcessDisconnectFor,
        recordConnectionOwnership,
        startNightTurnSequence,
        stopNightTurnSequence,
        // F-25: 역할 확정 직후의 내부 사건·수신 대상 계약과 즉시 통과 대기. 시험이 방어 복사와
        // 토큰 불일치 no-op을 실제 경계에서 확인할 수 있게 한다(공개 소켓 계약은 바뀌지 않는다).
        buildNightPresentationContract,
        beginNightPresentationWait,
        releaseNightPresentationWait,
        isNightPresentationWaitActive,
        NIGHT_TURN_STAGES,
        // F-26a: 역할별 성공 사건의 개인 payload 조립·전달 경계. 시험이 허용 키·재검증·중복
        // 방지를 실제 경로로 확인할 수 있게 한다.
        buildNightSuccessPayload,
        emitNightSuccessEvents,
        // F-26b: 밤 성공 사건 완료 ACK 핸들러와 완료 수신 보관함. 시험이 등록된 리스너를 통해
        // 도달하는지, 그리고 세션별 완료 기록의 수명을 실제 경계로 확인할 수 있게 한다.
        handleAcknowledgeNightActionSuccess,
        __getNightSuccessReceiptsForTests: (session) => nightSuccessReceiptsBySession.get(session) ?? null,
        computeEmptyTurnDelayMs,
        resolveNightTurnDurationMs,
        startDayPhaseTimer,
        stopDayPhaseTimer,
        beginDisconnectGrace,
        cancelDisconnectGrace,
        expireDisconnectGrace,
        getDisconnectGraceRun,
        // F-11: handleSubmitDayVote가 참조하는 저장소 호출을 순수 단위 테스트에서 갈아끼우기
        // 위한 통로입니다. fn을 생략(undefined)하면 실제 voteParticipationRepository로
        // 되돌립니다. 런타임 코드에서는 참조하지 않습니다.
        __setRecordVoteParticipationForTests(fn) {
            recordVoteParticipationImpl = fn ?? voteParticipationRepository.recordValidDayVoteParticipation
        },
        // F-12: persistTerminalSession/handleSubmitDayVote가 참조하는 업적 평가 호출을 순수
        // 단위 테스트에서 갈아끼우기 위한 통로입니다. fn을 생략(undefined)하면 실제
        // achievementService로 되돌립니다. 런타임 코드에서는 참조하지 않습니다.
        __setEvaluateAchievementsForTests(fn) {
            evaluateAchievementsImpl = fn ?? achievementService.evaluateAndGrantForUser
        },
    },
}
