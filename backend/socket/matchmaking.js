const crypto = require('crypto')
const userRepository = require('../repositories/user.repositories')
const { generateRoomCode, generateUniqueRoomCode } = require('../utils/roomCode')
const { validateCreateRoomPayload } = require('../utils/createRoomValidation')

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
// NOTE: 게임 시작(handleStartGame)은 원래 gameSession.startGameFromRoom을 호출해야 하는데,
// game-core/gameSession은 아직 없는 상태(인게임 단계에서 만들 예정)다. 그래서 이번 슬라이스는
// 방장 권한·인원·준비 상태 가드만 검증하고, 전부 통과해도 항상 GAME_CORE_NOT_READY로 응답한다
// — 방·참가자 상태를 바꾸거나 게임 시작을 알리는 코드는 의도적으로 어디에도 두지 않는다.

const OFFICIAL_MIN_PLAYERS = 5
const OFFICIAL_ROOM_SIZES = [10, 8, 6, 5]
const DEVELOPMENT_ROOM_SIZES = [10, 8, 6, 5, 2, 1]

// 초기 서비스의 낮은 동시접속자 수를 고려해 랜덤 매칭을 의도적으로 비활성화한다.
// 큐 등록/매칭 성사 로직 자체는 지우지 않고 아래에 그대로 남겨둔다 — 이 상수만 true로
// 되돌리면 재활성화할 수 있다. 재활성화 시 큐 정책(수동 방 생성과의 관계 등)은 별도 검토 필요.
const RANDOM_MATCHMAKING_ENABLED = false

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
const pendingRoomTransitions = new Set()

function registerMatchmakingHandlers(io, socket, uuid) {
    socket.on('join_matchmaking', () =>
        handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    )
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    socket.on('join_room_by_code', ({ roomCode } = {}) =>
        handleJoinRoomByCode(io, socket, uuid, roomCode).catch((err) =>
            console.error('\x1b[31m[방 코드 참가 에러]\x1b[0m', err)
        )
    )
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
    socket.on('start_game', (payload, callback) =>
        handleStartGame(io, socket, uuid, callback).catch((err) =>
            console.error('\x1b[31m[게임 시작 에러]\x1b[0m', err)
        )
    )
    socket.on('set_ready', (payload, callback) => handleSetReady(io, socket, uuid, payload, callback))
    socket.on('leave_room',        () => removeFromRoom(io, socket, uuid))
}

function onDisconnect(io, uuid) {
    matchmakingQueue.delete(uuid)
    removeFromRoom(io, null, uuid)
}

async function handleJoinMatchmaking(io, socket, uuid) {
    if (!RANDOM_MATCHMAKING_ENABLED) {
        // 현재 UI에는 진입 경로가 없지만, 소켓 이벤트는 클라이언트가 직접 emit할 수도 있어
        // 서버에서 명시적으로 막고 그 사실을 알린다(조용히 무시하지 않음).
        socket.emit('matchmaking_disabled', { message: '현재 빠른 매칭은 지원하지 않습니다.' })
        return
    }

    if (playerRoom.has(uuid)) return

    const user = await userRepositoryRef.findByUuid(uuid)
    if (!user) return

    matchmakingQueue.set(uuid, { uuid, nickname: user.nickname, socketId: socket.id })
    socket.emit('matchmaking_queued', { position: matchmakingQueue.size })

    if (matchmakingQueue.size < getMinPlayers()) return

    const queuedPlayers = [...matchmakingQueue.values()]
    const roomSize = getSupportedRoomSizes().find((size) => queuedPlayers.length >= size)
    if (!roomSize) return

    const players = queuedPlayers.slice(0, roomSize)
    players.forEach((player) => matchmakingQueue.delete(player.uuid))

    const roomId     = crypto.randomUUID()
    const roomCode   = generateRoomCode()
    const hostUuid   = players[0].uuid
    const playersMap = new Map(players.map((p) => [p.uuid, { uuid: p.uuid, nickname: p.nickname }]))

    gameRooms.set(roomId, { id: roomId, code: roomCode, hostUuid, players: playersMap })
    players.forEach((p) => playerRoom.set(p.uuid, roomId))

    const playerList = players.map((p) => ({ uuid: p.uuid, nickname: p.nickname }))

    players.forEach(({ socketId }) => {
        const s = io.sockets.sockets.get(socketId)
        if (!s) return
        s.join(roomId)
        s.emit('match_found', { roomId, roomCode, players: playerList, hostUuid })
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
    return players.every((player) => player.isReady === true)
}

function buildRoomPayload(room) {
    return {
        roomId: room.id,
        roomCode: room.code,
        players: [...room.players.values()],
        hostUuid: room.hostUuid,
        canStart: computeCanStart(room),
    }
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

    // await(사용자 조회) 이전, 아직 동기 실행 구간에서 예약한다. JS는 단일 스레드라 이
    // 지점까지는 다른 요청이 끼어들 수 없어, 같은 uuid의 두 번째 create_room/join_room_by_code도
    // 반드시 위의 pendingRoomTransitions.has(uuid) 검사에서 걸러진다(더블클릭/동시 요청 방지).
    pendingRoomTransitions.add(uuid)

    handleCreateRoomAfterReservation(io, socket, uuid, validation.value, callback)
}

async function handleCreateRoomAfterReservation(io, socket, uuid, { accessType, settings }, callback) {
    let roomId = null
    let joined = false
    let room = null

    try {
        const user = await userRepositoryRef.findByUuid(uuid)
        if (!user) {
            callback({ ok: false, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }

        // await 도중 다른 요청(코드 참가 등)으로 이미 방에 들어갔을 수 있어 최신 상태로 다시 확인한다.
        if (playerRoom.has(uuid)) {
            callback({ ok: false, message: '이미 참여 중인 방이 있습니다.' })
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
            code: null, // Socket room 가입 이후에 확정한다(아래 참고)
            hostUuid: uuid,
            title: `${user.nickname}의 방`,
            accessType,
            // 새로 생성된 방의 방장도 다른 참가자와 동일하게 준비 안 됨 상태로 시작한다
            // (방장이라고 자동으로 준비된 것으로 취급하지 않는다).
            players: new Map([[uuid, { uuid, nickname: user.nickname, isReady: false }]]),
            settings,
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
        gameRooms.set(roomId, room)
        playerRoom.set(uuid, roomId)
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
        pendingRoomTransitions.delete(uuid)
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
    // null/문자열/배열 등 예상 밖 형태는 구조분해 예외 없이 명시적으로 거부한다.
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        socket.emit('room_join_failed', { message: '잘못된 요청입니다.' })
        return
    }
    const { roomId } = payload
    if (typeof roomId !== 'string' || !roomId) {
        socket.emit('room_join_failed', { message: '잘못된 요청입니다.' })
        return
    }

    const room = gameRooms.get(roomId)
    // 클라이언트의 버튼 상태는 권한 경계가 아니다. 조작된 roomId 요청으로 코드 방에
    // 우회 입장하지 못하도록 서버가 실제 Room의 공개 여부를 반드시 다시 확인한다.
    if (!room || room.accessType !== 'open') {
        socket.emit('room_join_failed', { message: '공개 방을 찾을 수 없습니다.' })
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
    const normalizedCode = String(roomCode ?? '').trim()
    if (!normalizedCode) {
        socket.emit('room_join_failed', { message: '방 코드를 입력해주세요.' })
        return
    }

    // 진입 시점 동기 확인 — 여기서 걸러지는 요청은 예약(pendingRoomTransitions)조차 하지 않는다.
    if (playerRoom.has(uuid)) {
        socket.emit('room_join_failed', { message: '이미 참여 중인 방이 있습니다.' })
        return
    }
    if (pendingRoomTransitions.has(uuid)) {
        socket.emit('room_join_failed', { message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    if (matchmakingQueue.has(uuid)) {
        socket.emit('room_join_failed', { message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return
    }

    // create_room과 같은 잠금을 공유한다 — await 이전 동기 구간에서 예약해야 동시 요청을 막을 수 있다.
    pendingRoomTransitions.add(uuid)

    // catch 블록에서 "join은 됐는데 커밋 전에 실패했는지"를 구분해 Socket room을 정리해야
    // 하므로, try 안의 지역 변수가 아니라 바깥 스코프에 둔다.
    let joinedRoomId = null
    let committed = false

    try {
        const user = await userRepositoryRef.findByUuid(uuid)
        if (!user) {
            socket.emit('room_join_failed', { message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }

        // await 이후 재검사 — 조회하는 동안 다른 요청으로 이미 방에 들어갔을 수 있다.
        if (playerRoom.has(uuid)) {
            socket.emit('room_join_failed', { message: '이미 참여 중인 방이 있습니다.' })
            return
        }

        const room = [...gameRooms.values()].find((candidate) => candidate.code === normalizedCode)
        if (!room) {
            socket.emit('room_join_failed', { message: '방을 찾을 수 없습니다.' })
            return
        }

        // Map 커밋 전에 실제 Socket.IO room 가입부터 끝낸다(create_room과 동일한 이유).
        await socket.join(room.id)
        joinedRoomId = room.id

        // create_room과 같은 이유로, join을 기다리는 동안 연결이 끊겼을 가능성을 확인한다.
        if (!socket.connected) {
            await leaveSocketRoomSafely(socket, room.id, '[코드 참가 정리 실패]')
            joinedRoomId = null
            socket.emit('room_join_failed', { message: '연결이 끊어져 방에 참여하지 못했습니다.' })
            return
        }

        // join 대기 중 방이 삭제됐거나(예: 방장이 delete_room) 같은 id로 다른 객체가
        // 들어섰을 가능성을 점검한다 — playerRoom 매핑만으로는 이 변화를 알 수 없다.
        if (gameRooms.get(room.id) !== room) {
            await leaveSocketRoomSafely(socket, room.id, '[코드 참가 정리 실패]')
            joinedRoomId = null
            socket.emit('room_join_failed', { message: '방을 찾을 수 없습니다.' })
            return
        }

        // 공개방 목록에서 특정 roomId를 선택해 들어온 요청이라면, 코드로 다시 찾은 이 방이
        // 정말 그 방이 맞는지(그리고 여전히 공개 방인지) 커밋 직전에 재검증한다. 대기하는
        // 동안 원래 선택한 방이 삭제되고 우연히 같은 코드를 가진 다른 방(비공개일 수도
        // 있음)이 새로 생겼다면, 위의 id 동일성 검사만으로는 걸러지지 않는다 — 그 다른
        // 방도 새로 찾은 room 참조와 gameRooms의 참조가 일치해 정상 방처럼 보이기 때문이다.
        if (expectedRoom && (room.id !== expectedRoom.roomId || room.accessType !== expectedRoom.accessType)) {
            await leaveSocketRoomSafely(socket, room.id, '[코드 참가 정리 실패]')
            joinedRoomId = null
            socket.emit('room_join_failed', { message: '공개 방을 찾을 수 없습니다.' })
            return
        }

        // join 대기 중 다른 경로로 이미 다른 방에 들어갔을 수 있어 다시 확인한다.
        if (playerRoom.has(uuid)) {
            await leaveSocketRoomSafely(socket, room.id, '[코드 참가 정리 실패]')
            joinedRoomId = null
            socket.emit('room_join_failed', { message: '이미 참여 중인 방이 있습니다.' })
            return
        }

        // settings가 없는 방은 랜덤 매칭이 만든 구버전 방이다(이번 작업이 그 경로를 건드리지
        // 않기 때문). 두 종류의 방이 이 정원 검사를 공유하므로 임시 fallback을 둔다 —
        // 향후 모든 방 구조가 settings로 통일되면 이 fallback은 제거할 수 있다.
        const maxRoomSize = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        // join 이후의 최신 인원 수로 마지막 한 자리를 다시 검사한다 — 여러 명이 동시에
        // 마지막 자리를 두고 경쟁할 때 정원을 넘기지 않기 위한 마지막 방어선이다.
        if (room.players.size >= maxRoomSize) {
            await leaveSocketRoomSafely(socket, room.id, '[코드 참가 정리 실패]')
            joinedRoomId = null
            socket.emit('room_join_failed', { message: '방이 가득 찼습니다.' })
            return
        }

        // 마지막 검사와 Map 커밋 사이에는 await를 두지 않는다 — 그 틈에 다른 요청이
        // 끼어들면 방금 한 정원 검사가 무의미해지기 때문이다.
        // 새로 참가하는 사용자도 항상 준비 안 됨 상태로 시작한다(이전 방 참여 이력과 무관).
        const player = { uuid, nickname: user.nickname, isReady: false }
        room.players.set(uuid, player)
        playerRoom.set(uuid, room.id)
        committed = true

        socket.emit('room_joined', buildRoomPayload(room))
        socket.to(room.id).emit('player_joined_room', { player, canStart: computeCanStart(room) })
        emitPublicRoomList(io)
    } catch (err) {
        console.error('[코드 참가 에러]', err)
        // 위의 명시적 실패 경로들은 각자 leave까지 마쳤다. 여기 도달했다는 건 예상 못한
        // 예외라는 뜻이므로, join은 됐지만(joinedRoomId 존재) 아직 커밋 전이라면 Socket
        // room에 남아있는 상태다 — 커밋 여부와 무관하게 정리를 놓치지 않도록 확인한다.
        if (joinedRoomId && !committed) {
            await leaveSocketRoomSafely(socket, joinedRoomId, '[코드 참가 정리 실패]')
        }
        socket.emit('room_join_failed', { message: '방에 참여하지 못했습니다. 잠시 후 다시 시도해주세요.' })
    } finally {
        pendingRoomTransitions.delete(uuid)
    }
}

/**
 * 현재 사용자가 속한 방 정보를 조회합니다(읽기 전용, 어떤 상태도 바꾸지 않음).
 * create_room의 ack가 유실/타임아웃됐을 때 클라이언트가 실제 생성 여부를 확인하는 용도로 쓰인다.
 * @returns {void} callback({ok:true, room:object|null, pending?:true})
 */
function handleGetCurrentRoom(uuid, callback) {
    if (typeof callback !== 'function') return

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
        callback({ ok: true, room: null })
        return
    }

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

    io.to(roomId).emit('room_deleted', {})

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
    emitPublicRoomList(io)
}

/**
 * 인증된 사용자 본인의 준비 상태를 변경합니다(Socket.IO acknowledgement 방식).
 * payload에 대상 uuid를 받지 않는다 — 본인 외의 참가자 상태를 바꿀 방법 자체를 이벤트
 * 설계에서 없앤 것이다(신뢰 경계는 socket.data.user.uuid, 즉 이 함수의 uuid 인자 하나뿐).
 * @param {unknown} payload - { isReady: boolean } 형태만 허용(신뢰하지 않음, 상태 변경 전에 검증)
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
    const { isReady } = payload
    if (typeof isReady !== 'boolean') {
        callback({ ok: false, message: '잘못된 요청입니다.' })
        return
    }

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    const player = room?.players.get(uuid)
    if (!room || !player) {
        callback({ ok: false, message: '참여 중인 방이 없습니다.' })
        return
    }

    // 요청한 값이 이미 현재 값과 같으면 상태 변경도 방송도 하지 않는다(멱등 계약) — 같은
    // 요청이 여러 번 와도 결과가 달라지지 않고, 불필요한 알림으로 다른 참가자 화면이
    // 깜빡이는 것도 막는다.
    if (player.isReady === isReady) {
        callback({ ok: true, isReady: player.isReady, canStart: computeCanStart(room) })
        return
    }

    player.isReady = isReady
    const canStart = computeCanStart(room)
    socket.to(roomId).emit('player_ready_changed', { uuid, isReady, canStart })
    callback({ ok: true, isReady, canStart })
}

/**
 * 방장의 게임 시작 요청을 검증합니다(Socket.IO acknowledgement 방식 — 예전에는 실패를
 * game_start_failed 이벤트로 별도 emit했으나, 요청 하나에 응답 하나가 정확히 대응하도록
 * ack 계약으로 바꿨다). 이 슬라이스에는 실제로 게임을 시작시키는 처리(game-core/gameSession)가
 * 없으므로, 아래 가드를 전부 통과해도 항상 { ok:false, code:'GAME_CORE_NOT_READY' }로 응답하고
 * 방·참가자 상태는 어떤 경우에도 바꾸지 않는다 — 과거에 있던 "GameSession 없이 방을 지우고
 * 시작을 알리는" 임시 처리는 완전히 삭제했으며, 이후 다시 실행되지 않는다. io/socket 인자는
 * 지금은 쓰이지 않지만, 다음 GameSession 슬라이스에서 성공 시 game_started를 방송하려면
 * 필요해질 것이므로 시그니처에 남겨둔다.
 * @param {(response:{ok:false,code:string,message:string})=>void} callback
 */
async function handleStartGame(io, socket, uuid, callback) {
    // 응답을 받을 수 없는 요청은 다른 검사보다 먼저 확인한다 — 어떤 상태도 바꾸지 않는다.
    if (typeof callback !== 'function') return

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    if (!room) {
        callback({ ok: false, code: 'ROOM_NOT_FOUND', message: '참여 중인 방을 찾을 수 없습니다.' })
        return
    }
    if (room.hostUuid !== uuid) {
        callback({ ok: false, code: 'NOT_HOST', message: '방장만 게임을 시작할 수 있습니다.' })
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
    if (!players.every((player) => player.isReady === true)) {
        callback({
            ok: false,
            code: 'PLAYERS_NOT_READY',
            message: '아직 준비하지 않은 참가자가 있습니다.',
        })
        return
    }

    // 여기까지 왔다면 시작 조건은 전부 충족했지만, 실제로 게임을 시작시키는 처리
    // (game-core/gameSession)는 다음 슬라이스에서 새로 작성한다. 방·참가자 상태를 바꾸는
    // 코드, game_started를 방송하는 코드는 의도적으로 이 함수 어디에도 두지 않는다.
    callback({
        ok: false,
        code: 'GAME_CORE_NOT_READY',
        message: '게임 코어를 준비 중입니다. 잠시만 기다려주세요.',
    })
}

function removeFromRoom(io, socket, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room) return

    room.players.delete(uuid)
    playerRoom.delete(uuid)
    if (socket) socket.leave(roomId)

    if (room.players.size === 0) {
        gameRooms.delete(roomId)
        emitPublicRoomList(io)
        return
    }

    if (room.hostUuid === uuid) {
        // 방장이 바뀌어도 남은 참가자들의 isReady는 손대지 않는다 — 방장 권한 이전과
        // 준비 상태는 서로 독립적인 개념이라, 새 방장도 이전에 준비했던 상태 그대로 유지된다.
        room.hostUuid = room.players.keys().next().value
        io.to(roomId).emit('host_changed', { hostUuid: room.hostUuid, canStart: computeCanStart(room) })
    }

    io.to(roomId).emit('player_left_room', { uuid, canStart: computeCanStart(room) })
    emitPublicRoomList(io)
}

/** 테스트 전용: 모듈 내부 상태를 초기화합니다. 런타임 코드에서는 호출하지 마세요. */
function __resetStateForTests() {
    matchmakingQueue.clear()
    gameRooms.clear()
    playerRoom.clear()
    pendingRoomTransitions.clear()
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
            { ...room, players: [...room.players.entries()] },
        ]),
        playerRoom: [...playerRoom.entries()],
        pendingRoomTransitions: [...pendingRoomTransitions],
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
}

module.exports = {
    registerMatchmakingHandlers,
    onDisconnect,
    __resetStateForTests,
    __getStateSnapshotForTests,
    __seedMatchmakingQueueForTests,
    __seedRoomForTests,
    __seedPlayerRoomForTests,
    __removeRoomForTests,
    __setUserRepositoryForTests,
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
        leaveSocketRoomSafely,
    },
}
