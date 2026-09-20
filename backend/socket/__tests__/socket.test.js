const test = require('node:test')
const assert = require('node:assert/strict')

const socket = require('../socket')
const matchmaking = require('../matchmaking')
const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
// F-26(AC-06): 연결 등록 진입점을 실제로 돌리려면 인증·presence 같은 **외부 경계만** 대역으로
// 두면 된다. 그 두 모듈의 메서드만 갈아끼우고 registerConnectionHandlers·resyncSessionRouting·
// registerGameHandlers는 생산 코드 그대로 실행한다.
const sessionLifecycle = require('../../auth/sessionLifecycle')
const presenceService = require('../../service/presence.service')
const { createFakeSocket, createFakeIo } = require('./testHelpers/matchmakingFixtures')

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

test('forcedLogout으로 강제 종료된 소켓도 활성 GameSession을 종료하지 않고 재접속 유예를 시작한다', async (t) => {
    // 위 테스트는 onDisconnect를 mock으로 대체해 "호출 여부"만 확인했다 — 이 테스트는 fake
    // io/socket과 실제 gameSessionCore registry를 함께 구동해, forcedLogout 경로에서
    // registerDisconnectHandler → gameSession.onDisconnect 배선이 실제로 GameSession
    // registry를 정리하는지까지 확인하는 통합 테스트다(실제 Socket.IO 서버·네트워크를 쓰는
    // end-to-end 테스트는 아니다). 이 파일은 game-core/matchmaking 두 registry를 모두
    // 건드리므로 격리를 위해 명시적으로 초기화한다.
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
    assert.equal(snapshotAfter.gameSessions.some(([gameId]) => gameId === prepared.session.id), true)
    assert.equal(snapshotAfter.playerSession.some(([uuid]) => uuid === 'forced-a'), true)
    assert.equal(snapshotAfter.roomGameSession.some(([roomId]) => roomId === 'room-forced-logout'), true)
    assert.notEqual(
        gameSessionSocketLayer.__testables.getDisconnectGraceRun(prepared.session.id, 'forced-a'),
        undefined,
    )
})

// ---------------------------------------------------------------------------
// F-26(AC-03/AC-06) · 연결 등록 순서와 **같은 범위의 재가입 공유**
//
// 재접속 복원은 이 진입점에서 시작한다: canonical 등록(handleConnection의 첫 await 이전) →
// resyncSessionRouting의 채널 재가입 → registerGameHandlers가 배선한 조회 리스너. 세 가지가
// 실제로 그 순서로 이어지는지, 그리고 같은 범위의 재가입 요구가 **한 번의 join으로 합쳐지는지**를
// 생산 코드 그대로 확인한다(join이 두 벌이면 한쪽의 늦은 되돌리기가 다른 쪽의 정당한 가입을 지운다).
// ---------------------------------------------------------------------------

/** 인증·presence·대기방 재동기화 같은 외부 경계만 대역으로 둔다(DB를 건드리지 않는다). */
function stubExternalConnectionBoundaries(t) {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }))
    t.mock.method(presenceService, 'setPresence', async () => {})
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    t.mock.method(matchmaking, 'resyncRoomChannelOnReconnect', async () => {})
}

/** 참가자 2명의 실제 GameSession을 커밋한다(routing·channelId가 정상 경로로 채워진다). */
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

/** 등록된 get_session_snapshot 리스너로 조회한다(세션 가드를 지나므로 응답은 비동기다). */
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

    // canonical 등록은 handleConnection의 **첫 await 이전 동기 구간**에서 끝난다 — 그래서 이
    // 시점에 이미 registry가 이 소켓을 가리키고, 뒤따르는 조회·행동 권한 판정이 성립한다.
    assert.equal(socket.__getOnlineUsersForTests().get('f26o-a'), fakeSocket.id)
    // 같은 동기 구간에서 게임 리스너가 배선됐다(조회가 이 연결로 들어올 수 있다).
    assert.equal(fakeSocket.listenerCount('get_session_snapshot'), 1)
    assert.equal(fakeSocket.listenerCount('acknowledge_night_action_success'), 1)

    // 채널 재가입이 시작됐고 아직 끝나지 않았다.
    await fakeSocket.joinCalled
    assert.equal(fakeSocket.rooms.has(session.channelId), false, '전제: join이 아직 보류 중이어야 한다')

    // 그 사이 같은 범위의 재동기화를 다시 요구해도(조회 경로의 보류 처리가 하는 일이다) 새 join을
    // 만들지 않고 진행 중인 작업을 공유한다.
    const shared = gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26o-a')
    releaseJoin()
    await shared

    assert.deepEqual(fakeSocket.joined, [session.channelId], '같은 범위의 재가입이 두 번 join했다')
    assert.equal(fakeSocket.rooms.has(session.channelId), true)
    assert.deepEqual(fakeSocket.left, [], '정상 재가입이 스스로 되돌려졌다')
    assert.equal(fakeSocket.data.activeGameId, session.id)

    // 재가입이 끝난 뒤의 조회는 정상 snapshot이다(복원할 사건이 없으므로 그 키는 없다).
    const response = await requestSnapshotThroughListener(fakeSocket, { gameId: session.id })
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.equal(response.gameId, session.id)
    assert.equal(Object.hasOwn(response, 'nightSuccessRecovery'), false)
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
    // 첫 join은 거부된다(비동기 거부는 resyncSessionRouting 밖으로 새지 않는다).
    await gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26r-a').catch(() => {})
    assert.equal(fakeSocket.rooms.has(session.channelId), false)

    // 이제 adapter가 정상으로 돌아왔다 — 다음 요구가 새 join을 시작해 실제로 들어간다.
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
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(oldSocket, 'f26p-a')
    await oldSocket.joinCalled

    // 그 사이 새로고침으로 같은 계정의 새 연결이 canonical이 된다(registry·namespace 모두 교체).
    const newSocket = createFakeSocket('f26p-a')
    io.sockets.sockets.set(newSocket.id, newSocket)
    socket.__testables.registerConnectionHandlers(io, newSocket)
    await newSocket.joinCalled
    await gameSessionSocketLayer.resyncSessionRouting(newSocket, 'f26p-a')
    assert.equal(newSocket.rooms.has(session.channelId), true, '전제: 새 연결이 정상 재가입해야 한다')

    // 이제서야 옛 join이 끝난다 — 그 작업은 자기 가입만 되돌리고 새 연결은 건드리지 않는다.
    releaseJoin()
    await resyncing

    assert.equal(oldSocket.rooms.has(session.channelId), false, '남이 된 연결이 경기 채널에 남았다')
    assert.deepEqual(oldSocket.left, [session.channelId])
    assert.equal(newSocket.rooms.has(session.channelId), true, '옛 정리가 새 연결의 채널 가입을 지웠다')
    assert.equal(newSocket.data.activeGameId, session.id, '옛 정리가 새 연결의 activeGameId를 지웠다')
    assert.equal(socket.__getOnlineUsersForTests().get('f26p-a'), newSocket.id)
})
