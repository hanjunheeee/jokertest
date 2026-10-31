const gameSessionCore = require('../../../game-core/gameSession')

function callAsPromise(handler, ...args) {
    return new Promise((resolve) => handler(...args, resolve))
}

function createFakeSocket(uuid, { id = `sock-${uuid}`, joinShouldReject = false, joinGate = null, emitShouldThrowOn = null } = {}) {
    const rooms = new Set()
    const listeners = new Map()
    let resolveJoinCalled
    const joinCalled = new Promise((resolve) => { resolveJoinCalled = resolve })
    let broadcastDepth = 0
    const socket = {
        id,
        nsp: { sockets: null },
        data: { user: { uuid } },
        emitted: [],
        received: [],
        countReceived(event) {
            return socket.received.filter((entry) => entry.event === event).length
        },
        joined: [],
        left: [],
        joinCalled,
        currentRooms: rooms,
        rooms,
        joinShouldReject,
        connected: true,
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
            const entry = broadcastDepth > 0
                ? { event, payload, viaBroadcast: true }
                : { event, payload }
            socket.emitted.push(entry)
            socket.received.push(entry)
        },
        receiveBroadcast(event, payload) {
            broadcastDepth += 1
            try {
                socket.emit(event, payload)
            } finally {
                broadcastDepth -= 1
            }
        },
        to(roomId) {
            return {
                emit(event, payload) {
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
    socket.nsp.sockets = new Map([[socket.id, socket]])
    return socket
}

function createFakeIo(sockets = []) {
    const socketMap = new Map(sockets.map((s) => [s.id, s]))
    const broadcasts = []

    const isMember = (socket, channel) =>
        socket.id === channel || socket.rooms?.has?.(channel) === true

    const deliver = (roomId, event, payload, exceptChannels = new Set(), senderId = null) => {
        for (const s of [...socketMap.values()]) {
            if (typeof s?.id !== 'string') continue
            if (typeof senderId === 'string' && isMember(s, senderId)) continue
            if (s.connected === false) continue
            if (roomId !== null && !isMember(s, roomId)) continue
            let excluded = false
            for (const channel of exceptChannels) {
                if (isMember(s, channel)) { excluded = true; break }
            }
            if (excluded) continue
            const receive = typeof s.receiveBroadcast === 'function' ? s.receiveBroadcast : s.emit
            if (typeof receive !== 'function') continue
            try {
                receive.call(s, event, payload)
            } catch {
            }
        }
    }

    const io = {
        sockets: { sockets: socketMap },
        broadcasts,
        emit(event, payload) {
            broadcasts.push({ roomId: null, event, payload })
            deliver(null, event, payload)
        },
        to(roomId) {
            const makeOperator = (exceptChannels) => ({
                except(ids) {
                    const next = new Set(exceptChannels)
                    for (const id of Array.isArray(ids) ? ids : [ids]) next.add(id)
                    return makeOperator(next)
                },
                emit(event, payload) {
                    broadcasts.push({
                        roomId, event, payload,
                        ...(exceptChannels.size > 0 ? { excluded: [...exceptChannels].sort() } : {}),
                    })
                    deliver(roomId, event, payload, exceptChannels)
                },
            })
            return makeOperator(new Set())
        },
        in(roomId) {
            return {
                socketsLeave(targetRoomId) {
                    for (const s of socketMap.values()) {
                        if (!isMember(s, roomId)) continue
                        s.rooms?.delete(targetRoomId)
                    }
                },
            }
        },
    }

    const attach = (socket) => {
        if (!socket || typeof socket !== 'object') return socket
        socket.deliverBroadcast = (roomId, event, payload, senderId) =>
            deliver(roomId, event, payload, new Set(), senderId)
        if (!socket.nsp || typeof socket.nsp !== 'object') socket.nsp = {}
        socket.nsp.sockets = socketMap
        return socket
    }
    for (const s of socketMap.values()) attach(s)
    const originalSet = socketMap.set.bind(socketMap)
    const originalDelete = socketMap.delete.bind(socketMap)
    socketMap.set = (id, socket) => {
        for (const [key, existing] of [...socketMap]) {
            if (existing === socket && key !== id) originalDelete(key)
        }
        return originalSet(id, attach(socket))
    }

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

function roomRequestPayload(room, { isReady, settingsVersion } = {}) {
    const isRoomObject = typeof room === 'object' && room !== null
    const payload = {
        roomId: isRoomObject ? room.roomId : room,
        expectedSettingsVersion: settingsVersion
            ?? (isRoomObject ? room.settingsVersion : undefined)
            ?? 1,
    }
    if (isReady !== undefined) payload.isReady = isReady
    return payload
}

function readyPayload(room, isReady = true, options = {}) {
    return roomRequestPayload(room, { ...options, isReady })
}

function startPayload(room, options = {}) {
    return roomRequestPayload(room, options)
}

function countingCallback() {
    let calls = 0
    let response = null
    const callback = (res) => { calls += 1; response = res }
    return { callback, getCalls: () => calls, getResponse: () => response }
}

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
