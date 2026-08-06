const test = require('node:test')
const assert = require('node:assert/strict')

const socket = require('../socket')
const matchmaking = require('../matchmaking')
const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')

test('disconnect 시 registerDisconnectHandler가 gameSession.onDisconnect를 실제로 호출한다 (DB 접근 없음)', (t) => {
    matchmaking.__resetStateForTests() // matchmaking.onDisconnect가 실행되므로 위생상 초기화

    const onDisconnectMock = t.mock.method(gameSessionSocketLayer, 'onDisconnect', async () => {})
    const handlers = {}
    const fakeSocket = {
        id: 'socket-1',
        // forcedLogout:true → handleDisconnect가 presence/DB 부수효과 없이 즉시 반환한다.
        data: { user: { uuid: 'uuid-1' }, forcedLogout: true },
        on(event, cb) { handlers[event] = cb },
    }
    const fakeIo = { sockets: { sockets: new Map([[fakeSocket.id, fakeSocket]]) } }

    // registerConnectionHandlers가 아니라 registerDisconnectHandler를 직접 호출한다 —
    // handleConnection이 아예 실행되지 않으므로 connection 경로의 DB 부수효과가 없다.
    socket.__testables.registerDisconnectHandler(fakeIo, fakeSocket, 'uuid-1')
    handlers.disconnect()

    assert.equal(onDisconnectMock.mock.calls.length, 1)
    assert.equal(onDisconnectMock.mock.calls[0].arguments[0], fakeIo)
    assert.equal(onDisconnectMock.mock.calls[0].arguments[1], fakeSocket)
    assert.equal(onDisconnectMock.mock.calls[0].arguments[2], 'uuid-1')
})

// ---------------------------------------------------------------------------
// forcedLogout disconnect 배선/core 통합 테스트 (0절 정책의 근거 보강)
// ---------------------------------------------------------------------------

test('forcedLogout으로 강제 종료된 소켓의 disconnect는 실제 활성 GameSession을 종료시킨다', async (t) => {
    // 위 테스트는 onDisconnect를 mock으로 대체해 "호출 여부"만 확인했다 — 이 테스트는 fake
    // io/socket과 실제 gameSessionCore registry를 함께 구동해, forcedLogout 경로에서
    // registerDisconnectHandler → gameSession.onDisconnect 배선이 실제로 GameSession
    // registry를 정리하는지까지 확인하는 통합 테스트다(실제 Socket.IO 서버·네트워크를 쓰는
    // end-to-end 테스트는 아니다). 이 파일은 game-core/matchmaking 두 registry를 모두
    // 건드리므로 격리를 위해 명시적으로 초기화한다.
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    t.after(() => {
        gameSessionCore.__resetStateForTests()
        matchmaking.__resetStateForTests()
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
        // 다른 기기/탭 로그인으로 강제 종료된 소켓(existingSocket.disconnect(true))을 흉내낸다.
        // activeGameId는 실제로는 matchmaking.js의 handleStartGame이 게임 시작 시 심어주는
        // 값이다(ABA 방지 결합) — 이 테스트는 matchmaking을 거치지 않고 game-core를 직접
        // 구동하므로 그 결합을 여기서 직접 재현한다.
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

    // onDisconnect의 canonical predicate는 forcedLogout이 아니라 onlineUsers registry로만
    // 판정된다(0절 정책의 근거) — 이 소켓이 여전히 uuid의 registry-canonical 소켓임을
    // 명시적으로 재현한다(다른 소켓으로 대체되지 않은, 강제 로그아웃만 된 케이스).
    socket.__getOnlineUsersForTests().set('forced-a', fakeSocket.id)

    socket.__testables.registerDisconnectHandler(fakeIo, fakeSocket, 'forced-a')
    handlers.disconnect()
    await Promise.resolve() // gameSession.onDisconnect는 await 없이 동기적으로 registry를 정리하지만, 방어적으로 한 틱 흘려보낸다.

    const snapshotAfter = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshotAfter.gameSessions.some(([gameId]) => gameId === prepared.session.id), false)
    assert.equal(snapshotAfter.playerSession.some(([uuid]) => uuid === 'forced-a' || uuid === 'forced-b'), false)
    assert.equal(snapshotAfter.roomGameSession.some(([roomId]) => roomId === 'room-forced-logout'), false)
})
