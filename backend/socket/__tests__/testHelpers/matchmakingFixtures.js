// game-core/gameSession은 순수 registry 모듈이라(외부 의존은 node:crypto뿐) 이 파일이
// 직접 require해도 순환이 생기지 않는다 — 아래 setupReadyRoomForStart 주석이 말하는
// "matchmaking.js를 require하지 않는다"는 제약과는 별개다.
const gameSessionCore = require('../../../game-core/gameSession')

/** callback을 받는 핸들러를 Promise로 감싼다(ack 콜백을 test에서 await하기 위함). */
function callAsPromise(handler, ...args) {
    return new Promise((resolve) => handler(...args, resolve))
}

/**
 * 실제 socket.io 서버 없이 emit/join/leave/to/connected만 흉내내는 최소 fake Socket.
 * joinGate를 넘기면 join()이 그 Promise가 풀릴 때까지 대기한다 — join 대기 중 다른 요청이
 * 상태를 바꾸는 레이스(정원 경쟁, 방 삭제/교체, disconnect 등)를 결정적으로 재현하기 위함이다.
 */
function createFakeSocket(uuid, { id = `sock-${uuid}`, joinShouldReject = false, joinGate = null, emitShouldThrowOn = null } = {}) {
    // join/leave가 이 Set 하나만 갱신한다 — currentRooms(기존 테스트가 참조)와 rooms(프로덕션
    // 코드가 socket.rooms.has(roomId)로 참조하는 실제 Socket.IO 속성명)가 항상 같은 Set을
    // 가리키므로 어느 이름으로 읽어도 동일한 결과를 본다.
    const rooms = new Set()
    // event → Set<handler> — on/off/trigger가 이 Map 하나만 갱신한다(JOKER 채팅 listener
    // 등록/해제·배선 테스트 전용, 기존 emit/to/join/leave 계약과는 독립적이다).
    const listeners = new Map()
    // F-13(AC-05): 참가 경로가 사용자 조회와 계정 프로필 조회를 Promise.all로 함께
    // 기다리게 되면서, join() 호출까지 필요한 microtask 틱 수가 호출부마다 달라질 수
    // 있다 — 정확한 틱 수를 세는 대신, join()이 실제로 호출된 순간(joinGate 대기에 들어가기
    // 직전)을 이 Promise로 신호해 테스트가 결정적으로 대기할 수 있게 한다.
    let resolveJoinCalled
    const joinCalled = new Promise((resolve) => { resolveJoinCalled = resolve })
    const socket = {
        id,
        data: { user: { uuid } },
        emitted: [],
        joined: [],
        left: [],
        joinCalled,
        // join/leave 로그(joined·left)와 별개로, "지금 실제로 어느 room에 들어가 있는지"를
        // Set으로도 추적한다. join 후 실패해 곧바로 leave하는 경로를 검증할 때 로그 배열만으로는
        // "결국 그 room에 남아있지 않다"를 정확히 표현하기 어렵기 때문이다.
        currentRooms: rooms,
        rooms,
        // 프로퍼티로 두어 테스트 중간에 socket.joinShouldReject = false / socket.connected = false
        // 처럼 값을 바꿀 수 있게 한다(클로저로 캡처하면 나중에 바꿔도 반영되지 않음).
        joinShouldReject,
        connected: true,
        // 프로퍼티로 두어 테스트 중간에 socket.emitShouldThrowOn = 'event' 처럼 값을 바꿀 수
        // 있게 한다 — 특정 event로 emit할 때만 throw해 개별 recipient 전달 실패를 흉내낸다.
        emitShouldThrowOn,
        async join(roomId) {
            resolveJoinCalled()
            if (joinGate) await joinGate
            if (socket.joinShouldReject) throw new Error('join 실패(테스트 주입)')
            socket.joined.push(roomId)
            rooms.add(roomId)
        },
        async leave(roomId) {
            socket.left.push(roomId)
            rooms.delete(roomId)
        },
        emit(event, payload) {
            if (socket.emitShouldThrowOn === event) {
                throw new Error(`emit 실패(테스트 주입): ${event}`)
            }
            socket.emitted.push({ event, payload })
        },
        to(roomId) {
            return {
                emit(event, payload) {
                    socket.emitted.push({ event, payload, broadcastTo: roomId })
                },
            }
        },
        on(event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set())
            listeners.get(event).add(handler)
        },
        off(event, handler) {
            listeners.get(event)?.delete(handler)
        },
        trigger(event, ...args) {
            for (const handler of listeners.get(event) ?? []) handler(...args)
        },
        listenerCount(event) {
            return listeners.get(event)?.size ?? 0
        },
    }
    return socket
}

function createFakeIo(sockets = []) {
    const socketMap = new Map(sockets.map((s) => [s.id, s]))
    const broadcasts = []
    return {
        sockets: { sockets: socketMap },
        broadcasts,
        emit(event, payload) {
            // io.emit()은 특정 room이 아니라 연결된 모든 소켓에 보내는 전역 브로드캐스트다.
            // roomId를 null로 남겨 room 단위 브로드캐스트(to().emit())와 구분해서 기록한다.
            broadcasts.push({ roomId: null, event, payload })
        },
        to(roomId) {
            return {
                emit(event, payload) {
                    broadcasts.push({ roomId, event, payload })
                },
            }
        },
        in(roomId) {
            return {
                socketsLeave(targetRoomId) {
                    for (const s of socketMap.values()) s.rooms?.delete(targetRoomId)
                },
            }
        },
    }
}

function validSettingsPayload(overrides = {}) {
    return {
        accessType: 'open',
        maxPlayers: 8,
        jokerCount: 2,
        lightsOut: false,
        soulBetting: false,
        dayDiscussionTime: 60,
        dayVoteTime: 60,
        nightActionTime: 90,
        voteReveal: true,
        ...overrides,
    }
}

function countingCallback() {
    let calls = 0
    let response = null
    const callback = (res) => { calls += 1; response = res }
    return { callback, getCalls: () => calls, getResponse: () => response }
}

/**
 * start_game 성공 시나리오 공통 셋업 — host 1명 + joiner 1명, 정원 4/광대 1, 전원 준비.
 * handleCreateRoom/handleJoinRoomByCode/handleSetReady를 인자로 받는다 — 이 파일은
 * matchmaking.js를 require하지 않으므로(순환 의존 없음), 호출하는 테스트 파일이
 * matchmaking.__testables에서 꺼낸 실제 함수를 그대로 전달해야 한다.
 */
async function setupReadyRoomForStart(io, hostUuid, joinerUuid, { handleCreateRoom, handleJoinRoomByCode, handleSetReady }) {
    const hostSocket = io.sockets.sockets.get(`sock-${hostUuid}`) ?? createFakeSocket(hostUuid)
    io.sockets.sockets.set(hostSocket.id, hostSocket)
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerSocket = createFakeSocket(joinerUuid)
    io.sockets.sockets.set(joinerSocket.id, joinerSocket)
    await handleJoinRoomByCode(io, joinerSocket, joinerUuid, created.room.roomCode)
    await callAsPromise(handleSetReady, io, hostSocket, hostUuid, { isReady: true })
    await callAsPromise(handleSetReady, io, joinerSocket, joinerUuid, { isReady: true })
    return { hostSocket, joinerSocket, room: created.room }
}

/**
 * "활성 gameId를 가진 playerSession을 소유한 계정" 상태를 만든다 — game-core를 실제로
 * 구동해 GameSession을 커밋하므로 playerSession 매핑도 정상 경로와 동일하게 채워진다.
 * 테스트가 세션 내부 Map을 직접 심지 않게 하려는 것이 이 헬퍼의 목적이다.
 *
 * matchmaking의 대기방 상태(gameRooms/playerRoom)는 건드리지 않는다 — 인게임 게이트가
 * 대기방 소속과 무관하게 걸린다는 것을 그대로 드러내기 위함이다.
 *
 * @returns {object} 커밋된 session (session.id가 곧 활성 gameId다)
 */
function seedActiveGameForAccount(uuids, { roomId = 'room-active-game', jokerCount = 1 } = {}) {
    const players = new Map(uuids.map((uuid) => [uuid, { uuid, nickname: `nick-${uuid}`, isReady: true }]))
    const prepared = gameSessionCore.prepareGameSession({ id: roomId, players, settings: { jokerCount } })
    gameSessionCore.commitGameSession(prepared.session)
    return prepared.session
}

module.exports = {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    countingCallback,
    setupReadyRoomForStart,
    seedActiveGameForAccount,
}
