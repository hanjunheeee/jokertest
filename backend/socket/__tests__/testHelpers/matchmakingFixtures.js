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
        /**
         * F-23(AC-04): 이 소켓이 **실제로 받은** 사건. emitted(발신자의 전송/방송 시도 기록)와
         * 엄격히 구분한다 — 예전 fixture는 방송을 broadcasts에만 적고 수신 소켓에는 전혀
         * 전달하지 않아서, "제외된 소켓의 수신 0"이 프로덕션의 사실이 아니라 fixture의 사실이었다.
         */
        received: [],
        /** 지정 이벤트를 실제로 몇 번 받았는가. */
        countReceived(event) {
            return socket.received.filter((entry) => entry.event === event).length
        },
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
            // F-23(AC-04): 직접 전달도 **실제 수신**으로 기록한다. 방송 시도 기록(emitted의
            // broadcastTo, io.broadcasts)과 구분되는 별도 목록이라, "이 소켓이 실제로 받았는가"를
            // 시험이 한 기준으로 셀 수 있다.
            socket.received.push({ event, payload })
        },
        /**
         * F-23(AC-04): io/발신 소켓의 **방송**으로 이 소켓에 도착한 사건.
         *
         * 수신 기록은 남기되 `viaBroadcast: true`로 표시한다 — "이 사건이 특정 소켓에만 개별
         * 전달됐는가"를 보는 기존 은폐 시험(gameSession.nightTurns)이 방송과 표적 전달을
         * 계속 구별할 수 있어야 하기 때문이다. 전달 자체는 실제 emit과 동일하게 기록된다.
         */
        receiveBroadcast(event, payload) {
            if (socket.emitShouldThrowOn === event) {
                throw new Error(`emit 실패(테스트 주입): ${event}`)
            }
            socket.emitted.push({ event, payload, viaBroadcast: true })
            socket.received.push({ event, payload, viaBroadcast: true })
        },
        to(roomId) {
            return {
                emit(event, payload) {
                    // 발신자의 **방송 시도** 기록이다(기존 계약 그대로 보존한다). 실제 수신자
                    // 전달은 아래 io가 담당한다 — 여기서 기록만 남기고 socket.io를 통해
                    // 연결된 수신자에게도 실제로 흘려보낸다.
                    socket.emitted.push({ event, payload, broadcastTo: roomId })
                    socket.deliverBroadcast?.(roomId, event, payload, socket.id)
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

    /**
     * F-23(AC-04): 방송을 **실제 수신자에게 전달**한다.
     *
     * 예전 fixture는 broadcasts 배열에 기록만 남기고 어떤 소켓의 emit도 부르지 않았다. 그래서
     * "제외된 소켓은 받지 않는다"는 시험이 프로덕션의 사실이 아니라 fixture의 사실이었고,
     * 반대로 제외 로직이 통째로 사라져도 시험은 그대로 통과했다.
     *
     * 지금은 현재 채널 가입자·연결 상태·except 제외·발신자 제외를 실제로 반영해 각 수신자의
     * emit을 부른다. 같은 사건은 한 수신자에게 한 번만 간다. 한 수신자의 전송 예외가 다른
     * 정상 수신자를 누락시키지 않는다(프로덕션의 개별 전달 관례와 같다).
     *
     * @param {string|null} roomId null이면 연결된 모든 소켓(io.emit)이 대상이다.
     */
    const deliver = (roomId, event, payload, excludedIds = new Set(), senderId = null) => {
        for (const s of [...socketMap.values()]) {
            if (typeof s?.id !== 'string') continue
            if (s.id === senderId) continue
            if (excludedIds.has(s.id)) continue
            if (s.connected === false) continue
            if (roomId !== null && !s.rooms?.has?.(roomId)) continue
            const receive = typeof s.receiveBroadcast === 'function' ? s.receiveBroadcast : s.emit
            if (typeof receive !== 'function') continue
            try {
                receive.call(s, event, payload)
            } catch {
                // 한 수신자의 실패가 나머지 전달을 멈추지 않는다(emitShouldThrowOn 주입 포함).
            }
        }
    }

    const io = {
        sockets: { sockets: socketMap },
        broadcasts,
        emit(event, payload) {
            // io.emit()은 특정 room이 아니라 연결된 모든 소켓에 보내는 전역 브로드캐스트다.
            // roomId를 null로 남겨 room 단위 브로드캐스트(to().emit())와 구분해서 기록한다.
            broadcasts.push({ roomId: null, event, payload })
            deliver(null, event, payload)
        },
        to(roomId) {
            // F-21(AC-06): 실제 Socket.IO의 BroadcastOperator처럼 except()로 좁힐 수 있다.
            // 떼지 못한 채널 구독을 전달에서 빼는 경로(channelMembership.emitToChannel)를
            // 시험이 **실제로 관측**할 수 있어야 한다 — 없으면 프로덕션이 제외 불가 경로로
            // 퇴화하고 시험은 그것을 정상으로 읽는다.
            const makeOperator = (excluded) => ({
                except(ids) {
                    const next = new Set(excluded)
                    for (const id of Array.isArray(ids) ? ids : [ids]) next.add(id)
                    return makeOperator(next)
                },
                emit(event, payload) {
                    broadcasts.push({
                        roomId, event, payload,
                        ...(excluded.size > 0 ? { excluded: [...excluded].sort() } : {}),
                    })
                    deliver(roomId, event, payload, excluded)
                },
            })
            return makeOperator(new Set())
        },
        in(roomId) {
            return {
                socketsLeave(targetRoomId) {
                    for (const s of socketMap.values()) s.rooms?.delete(targetRoomId)
                },
            }
        },
    }

    /**
     * socket.to(room).emit()의 실제 전달을 io가 대신 수행한다(발신자는 제외).
     *
     * 소켓은 자기 혼자서는 다른 수신자를 알 수 없으므로, io에 등록될 때 이 연결기를 심는다.
     * 시험 중간에 io.sockets.sockets.set(...)으로 추가·교체되는 소켓도 같은 전달기를 갖는다.
     */
    const attach = (socket) => {
        if (!socket || typeof socket !== 'object') return socket
        socket.deliverBroadcast = (roomId, event, payload, senderId) =>
            deliver(roomId, event, payload, new Set(), senderId)
        return socket
    }
    for (const s of socketMap.values()) attach(s)
    const originalSet = socketMap.set.bind(socketMap)
    socketMap.set = (id, socket) => originalSet(id, attach(socket))

    return io
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

/**
 * F-20(AC-04): 실제 클라이언트가 보내는 set_ready/start_game payload.
 *
 * roomId·expectedSettingsVersion은 서버가 **필수**로 요구한다(빠지면 INVALID_REQUEST).
 * 테스트가 그 값을 서버 상태에서 몰래 읽어 채우면 계약을 검증하지 못하므로, 방을 만든
 * 쪽이 알고 있는 방 응답(또는 명시한 roomId·버전)에서만 만든다.
 *
 * @param {{roomId:string, settingsVersion?:number}|string} room - 방 응답 또는 roomId
 * @param {{isReady?:boolean, settingsVersion?:number}} [options]
 */
function roomRequestPayload(room, { isReady, settingsVersion } = {}) {
    const isRoomObject = typeof room === 'object' && room !== null
    const payload = {
        roomId: isRoomObject ? room.roomId : room,
        // 방 응답이 버전을 싣고 있으면 그 값이 곧 "이 화면이 보고 있는 설정"이다.
        expectedSettingsVersion: settingsVersion
            ?? (isRoomObject ? room.settingsVersion : undefined)
            ?? 1,
    }
    if (isReady !== undefined) payload.isReady = isReady
    return payload
}

/** set_ready payload — roomRequestPayload에 isReady를 더한 것이다. */
function readyPayload(room, isReady = true, options = {}) {
    return roomRequestPayload(room, { ...options, isReady })
}

/** start_game payload. */
function startPayload(room, options = {}) {
    return roomRequestPayload(room, options)
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
    await callAsPromise(handleSetReady, io, hostSocket, hostUuid, readyPayload(created.room))
    await callAsPromise(handleSetReady, io, joinerSocket, joinerUuid, readyPayload(created.room))
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
    roomRequestPayload,
    readyPayload,
    startPayload,
    countingCallback,
    setupReadyRoomForStart,
    seedActiveGameForAccount,
}
