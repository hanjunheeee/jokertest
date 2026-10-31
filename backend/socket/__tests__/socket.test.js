const test = require('node:test')
const assert = require('node:assert/strict')

const socket = require('../socket')
const matchmaking = require('../matchmaking')
const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const sessionLifecycle = require('../../auth/sessionLifecycle')
const presenceService = require('../../service/presence.service')
const { createFakeSocket, createFakeIo } = require('./testHelpers/matchmakingFixtures')

test('disconnect 시 registerDisconnectHandler가 gameSession.onDisconnect를 실제로 호출한다 (DB 접근 없음)', (t) => {
    matchmaking.__resetStateForTests() // matchmaking.onDisconnect가 실행되므로 위생상 초기화

    const onDisconnectMock = t.mock.method(gameSessionSocketLayer, 'onDisconnect', async () => {})
    const handlers = {}
    const fakeSocket = {
        id: 'socket-1',
        data: { user: { uuid: 'uuid-1' }, forcedLogout: true },
        on(event, cb) { handlers[event] = cb },
    }
    const fakeIo = { sockets: { sockets: new Map([[fakeSocket.id, fakeSocket]]) } }

    socket.__testables.registerDisconnectHandler(fakeIo, fakeSocket, 'uuid-1')
    handlers.disconnect()

    assert.equal(onDisconnectMock.mock.calls.length, 1)
    assert.equal(onDisconnectMock.mock.calls[0].arguments[0], fakeIo)
    assert.equal(onDisconnectMock.mock.calls[0].arguments[1], fakeSocket)
    assert.equal(onDisconnectMock.mock.calls[0].arguments[2], 'uuid-1')
})

test('forcedLogout으로 강제 종료된 소켓도 활성 GameSession을 종료하지 않고 재접속 유예를 시작한다', async (t) => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(socket.__getOnlineUsersForTests())
    t.after(() => {
        gameSessionCore.__resetStateForTests()
        matchmaking.__resetStateForTests()
        gameSessionSocketLayer.__resetStateForTests()
        socket.__getOnlineUsersForTests().delete('forced-a')
    })

    const room = {
        id: 'room-forced-logout',
        players: new Map([
            ['forced-a', { uuid: 'forced-a', nickname: 'A', isReady: true }],
            ['forced-b', { uuid: 'forced-b', nickname: 'B', isReady: true }],
        ]),
        settings: { jokerCount: 0 },
    }
    const prepared = gameSessionCore.prepareGameSession(room)
    assert.equal(prepared.ok, true)
    gameSessionCore.commitGameSession(prepared.session)

    const handlers = {}
    const fakeSocket = {
        id: 'socket-forced-a',
        data: { user: { uuid: 'forced-a' }, forcedLogout: true, activeGameId: prepared.session.id },
        rooms: new Set([prepared.session.channelId]),
        on(event, cb) { handlers[event] = cb },
    }
    const otherSocket = {
        id: 'socket-forced-b',
        data: { user: { uuid: 'forced-b' } },
        rooms: new Set([prepared.session.channelId]),
    }
    const allSockets = [fakeSocket, otherSocket]
    const fakeIo = {
        sockets: { sockets: new Map([[fakeSocket.id, fakeSocket], [otherSocket.id, otherSocket]]) },
        to() {
            return { emit() {} }
        },
        in() {
            return {
                socketsLeave(targetRoomId) {
                    for (const s of allSockets) s.rooms?.delete(targetRoomId)
                },
            }
        },
    }

    socket.__getOnlineUsersForTests().set('forced-a', fakeSocket.id)

    socket.__testables.registerDisconnectHandler(fakeIo, fakeSocket, 'forced-a')
    handlers.disconnect()
    await Promise.resolve() // gameSession.onDisconnect는 await 없이 동기적으로 registry를 정리하지만, 방어적으로 한 틱 흘려보낸다.

    const snapshotAfter = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshotAfter.gameSessions.some(([gameId]) => gameId === prepared.session.id), true)
    assert.equal(snapshotAfter.playerSession.some(([uuid]) => uuid === 'forced-a'), true)
    assert.equal(snapshotAfter.roomGameSession.some(([roomId]) => roomId === 'room-forced-logout'), true)
    assert.notEqual(
        gameSessionSocketLayer.__testables.getDisconnectGraceRun(prepared.session.id, 'forced-a'),
        undefined,
    )
})

function stubExternalConnectionBoundaries(t) {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }))
    t.mock.method(presenceService, 'setPresence', async () => {})
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    t.mock.method(matchmaking, 'resyncRoomChannelOnReconnect', async () => {})
}

function commitSessionForConnection(roomId, uuids) {
    const prepared = gameSessionCore.prepareGameSession({
        id: roomId,
        players: new Map(uuids.map((uuid) => [uuid, { uuid, nickname: `nick-${uuid}`, isReady: true }])),
        settings: { jokerCount: 0 },
    })
    assert.equal(prepared.ok, true)
    gameSessionCore.commitGameSession(prepared.session)
    return prepared.session
}

function requestSnapshotThroughListener(fakeSocket, payload) {
    return new Promise((resolve) => {
        fakeSocket.trigger('get_session_snapshot', payload, resolve)
    })
}

function resetConnectionTestState() {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    socket.__getOnlineUsersForTests().clear()
    gameSessionSocketLayer.setOnlineUsersRegistry(socket.__getOnlineUsersForTests())
}

test('F-26(AC-06): registerConnectionHandlers는 canonical 등록 → 채널 재가입 → 조회 배선을 그 순서로 잇고, 같은 범위의 재가입은 join 한 번으로 합쳐진다', async (t) => {
    resetConnectionTestState()
    stubExternalConnectionBoundaries(t)
    t.after(resetConnectionTestState)

    const session = commitSessionForConnection('room-f26-order', ['f26o-a', 'f26o-b'])

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const fakeSocket = createFakeSocket('f26o-a', { joinGate })
    const io = createFakeIo([fakeSocket])

    socket.__testables.registerConnectionHandlers(io, fakeSocket)

    assert.equal(socket.__getOnlineUsersForTests().get('f26o-a'), fakeSocket.id)
    assert.equal(fakeSocket.listenerCount('get_session_snapshot'), 1)
    assert.equal(fakeSocket.listenerCount('acknowledge_night_action_success'), 1)

    await fakeSocket.joinCalled
    assert.equal(fakeSocket.rooms.has(session.channelId), false, '전제: join이 아직 보류 중이어야 한다')

    const shared = gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26o-a')
    releaseJoin()
    await shared

    assert.deepEqual(fakeSocket.joined, [session.channelId], '같은 범위의 재가입이 두 번 join했다')
    assert.equal(fakeSocket.rooms.has(session.channelId), true)
    assert.deepEqual(fakeSocket.left, [], '정상 재가입이 스스로 되돌려졌다')
    assert.equal(fakeSocket.data.activeGameId, session.id)

    const response = await requestSnapshotThroughListener(fakeSocket, { gameId: session.id })
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.equal(response.gameId, session.id)
    assert.deepEqual(response.nightSuccessRecovery, [], '복원할 사건이 없는 응답에 빈 배열이 없다')
})

test('F-26(AC-01): 재가입이 끝나지 않은 조회는 복원할 사건이 없어도 빈 성공으로 답하지 않는다', async (t) => {
    resetConnectionTestState()
    stubExternalConnectionBoundaries(t)
    t.after(resetConnectionTestState)

    const session = commitSessionForConnection('room-f26-empty-pending', ['f26e-a', 'f26e-b'])

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const fakeSocket = createFakeSocket('f26e-a', { joinGate })
    const io = createFakeIo([fakeSocket])
    socket.__testables.registerConnectionHandlers(io, fakeSocket)
    await fakeSocket.joinCalled
    assert.equal(fakeSocket.rooms.has(session.channelId), false, '전제: join이 아직 보류 중이어야 한다')

    const pending = await requestSnapshotThroughListener(fakeSocket, { gameId: session.id })
    assert.equal(pending.ok, false, JSON.stringify(pending))
    assert.equal(pending.code, 'SESSION_ROUTING_PENDING')
    assert.equal(Object.hasOwn(pending, 'self'), false, '보류 응답이 snapshot 본문을 실었다')
    assert.deepEqual(fakeSocket.joined, [], '보류 조회가 두 번째 join을 만들었다')

    releaseJoin()
    await new Promise((resolve) => setImmediate(resolve))

    const ready = await requestSnapshotThroughListener(fakeSocket, { gameId: session.id })
    assert.equal(ready.ok, true, JSON.stringify(ready))
    assert.deepEqual(ready.nightSuccessRecovery, [], '준비가 끝난 뒤에도 빈 배열이 실리지 않았다')
})

test('F-26(AC-03): 재가입이 거부되면 그 작업만 해제되어 다음 요구가 새 join을 시작할 수 있다', async (t) => {
    resetConnectionTestState()
    stubExternalConnectionBoundaries(t)
    t.after(resetConnectionTestState)

    const session = commitSessionForConnection('room-f26-retry', ['f26r-a', 'f26r-b'])

    const fakeSocket = createFakeSocket('f26r-a', { joinShouldReject: true })
    const io = createFakeIo([fakeSocket])
    socket.__testables.registerConnectionHandlers(io, fakeSocket)

    await fakeSocket.joinCalled
    await gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26r-a').catch(() => {})
    assert.equal(fakeSocket.rooms.has(session.channelId), false)

    fakeSocket.joinShouldReject = false
    await gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26r-a')
    assert.equal(fakeSocket.rooms.has(session.channelId), true, '거부된 작업이 다음 재가입을 영구히 막았다')
    assert.equal(fakeSocket.data.activeGameId, session.id)
})

test('F-26(AC-03): 재가입 보류 중 새 canonical 연결이 등록되면 옛 작업의 완료가 새 연결의 채널·activeGameId를 건드리지 않는다', async (t) => {
    resetConnectionTestState()
    stubExternalConnectionBoundaries(t)
    t.after(resetConnectionTestState)

    const session = commitSessionForConnection('room-f26-replace', ['f26p-a', 'f26p-b'])

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const oldSocket = createFakeSocket('f26p-a', { id: 'sock-f26p-a-old', joinGate })
    const io = createFakeIo([oldSocket])
    socket.__getOnlineUsersForTests().set('f26p-a', oldSocket.id)
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(oldSocket, 'f26p-a')
    await oldSocket.joinCalled

    const newSocket = createFakeSocket('f26p-a')
    io.sockets.sockets.set(newSocket.id, newSocket)
    socket.__testables.registerConnectionHandlers(io, newSocket)
    await newSocket.joinCalled
    await gameSessionSocketLayer.resyncSessionRouting(newSocket, 'f26p-a')
    assert.equal(newSocket.rooms.has(session.channelId), true, '전제: 새 연결이 정상 재가입해야 한다')

    releaseJoin()
    await resyncing

    assert.equal(oldSocket.rooms.has(session.channelId), false, '남이 된 연결이 경기 채널에 남았다')
    assert.deepEqual(oldSocket.left, [session.channelId])
    assert.equal(newSocket.rooms.has(session.channelId), true, '옛 정리가 새 연결의 채널 가입을 지웠다')
    assert.equal(newSocket.data.activeGameId, session.id, '옛 정리가 새 연결의 activeGameId를 지웠다')
    assert.equal(socket.__getOnlineUsersForTests().get('f26p-a'), newSocket.id)
})

test('F-26(AC-03): canonical이 아닌 옛 연결의 재동기화는 유예 취소도 채널 가입도 시작하지 않는다', async (t) => {
    resetConnectionTestState()
    stubExternalConnectionBoundaries(t)
    t.after(resetConnectionTestState)

    const session = commitSessionForConnection('room-f26-entry', ['f26c-a', 'f26c-b'])

    const staleSocket = createFakeSocket('f26c-a', { id: 'sock-f26c-a-old' })
    const io = createFakeIo([staleSocket])
    socket.__getOnlineUsersForTests().set('f26c-a', staleSocket.id)
    gameSessionSocketLayer.registerGameHandlers(io, staleSocket, 'f26c-a')
    staleSocket.data.activeGameId = session.id
    io.sockets.sockets.delete(staleSocket.id)
    staleSocket.connected = false
    await gameSessionSocketLayer.onDisconnect(io, staleSocket, 'f26c-a')
    assert.notEqual(
        gameSessionSocketLayer.__testables.getDisconnectGraceRun(session.id, 'f26c-a'), undefined,
        '전제: 재접속 유예가 돌고 있어야 한다',
    )

    const currentSocket = createFakeSocket('f26c-a')
    io.sockets.sockets.set(currentSocket.id, currentSocket)
    socket.__getOnlineUsersForTests().set('f26c-a', currentSocket.id)

    staleSocket.connected = true
    io.sockets.sockets.set(staleSocket.id, staleSocket)
    await gameSessionSocketLayer.resyncSessionRouting(staleSocket, 'f26c-a')

    assert.deepEqual(staleSocket.joined, [], '남이 된 연결이 경기 채널 가입을 시작했다')
    assert.equal(staleSocket.rooms.has(session.channelId), false)
    assert.notEqual(
        gameSessionSocketLayer.__testables.getDisconnectGraceRun(session.id, 'f26c-a'), undefined,
        '남이 된 연결의 재동기화가 남의 재접속 유예를 취소했다',
    )

    await gameSessionSocketLayer.resyncSessionRouting(currentSocket, 'f26c-a')
    assert.equal(currentSocket.rooms.has(session.channelId), true)
    assert.equal(
        gameSessionSocketLayer.__testables.getDisconnectGraceRun(session.id, 'f26c-a'), undefined,
        '양성 대조: 현재 연결의 재동기화가 유예를 취소하지 못했다',
    )
})

test('F-26(AC-03): join 도중 같은 객체의 socket.id가 재발급되면 옛 작업은 자기 가입을 확정하지 않는다', async (t) => {
    resetConnectionTestState()
    stubExternalConnectionBoundaries(t)
    t.after(resetConnectionTestState)

    const session = commitSessionForConnection('room-f26-sid', ['f26i-a', 'f26i-b'])

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const fakeSocket = createFakeSocket('f26i-a', { joinGate })
    const io = createFakeIo([fakeSocket])
    socket.__getOnlineUsersForTests().set('f26i-a', fakeSocket.id)
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26i-a')
    await fakeSocket.joinCalled

    io.sockets.sockets.delete(fakeSocket.id)
    fakeSocket.id = 'sock-f26i-a-reissued'
    io.sockets.sockets.set(fakeSocket.id, fakeSocket)
    socket.__getOnlineUsersForTests().set('f26i-a', fakeSocket.id)

    releaseJoin()
    await resyncing

    assert.deepEqual(fakeSocket.left, [session.channelId],
        'sid 재발급이 옛 작업의 재검사에 전혀 드러나지 않았다')
    assert.equal(fakeSocket.rooms.has(session.channelId), true,
        '옛 작업의 놓기가 현재 연결의 정당한 채널 소속까지 지웠다')
})

test('F-26(AC-03): 비동기 구간 뒤 이 소켓의 최신 작업이 아니게 된 호출은 아무 것도 하지 않는다', async (t) => {
    resetConnectionTestState()
    stubExternalConnectionBoundaries(t)
    t.after(resetConnectionTestState)

    const session = commitSessionForConnection('room-f26-token', ['f26t-a', 'f26t-b'])

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const fakeSocket = createFakeSocket('f26t-a', { joinGate })
    const io = createFakeIo([fakeSocket])
    socket.__getOnlineUsersForTests().set('f26t-a', fakeSocket.id)
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26t-a')
    await fakeSocket.joinCalled

    session.players.get('f26t-a').membershipId = 'mem-f26t-a-2'
    fakeSocket.join = async (roomId) => {
        fakeSocket.joined.push(roomId)
        fakeSocket.rooms.add(roomId)
    }
    await gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26t-a')
    assert.equal(fakeSocket.rooms.has(session.channelId), true, '전제: 새 작업이 재가입을 끝내야 한다')

    releaseJoin()
    await resyncing

    assert.deepEqual(fakeSocket.left, [],
        '최신 작업이 아닌 옛 호출이 새 작업이 만든 채널 가입을 되돌렸다')
    assert.equal(fakeSocket.rooms.has(session.channelId), true)
    assert.equal(fakeSocket.data.activeGameId, session.id,
        '최신 작업이 아닌 옛 호출이 activeGameId를 되돌렸다')
})
