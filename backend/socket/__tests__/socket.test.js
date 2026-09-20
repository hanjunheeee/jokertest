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

    // 재가입이 끝난 뒤의 조회는 정상 snapshot이다. 복원할 사건이 없어도 **빈 배열이 실린다** —
    // 키를 생략하면 "복원할 것이 없다"와 "이 응답은 복원을 말하지 않는다"가 같은 모양이 된다.
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

    // 이 계정에는 복원할 성공 사건이 **하나도 없다**. 그래도 준비 검사는 같아야 한다 — 준비되지
    // 않은 순간의 0건은 "없다"가 아니라 "아직 알 수 없다"이고, ok:true로 답하면 클라이언트는
    // 그것을 확정으로 읽고 다시 묻지 않는다.
    const pending = await requestSnapshotThroughListener(fakeSocket, { gameId: session.id })
    assert.equal(pending.ok, false, JSON.stringify(pending))
    assert.equal(pending.code, 'SESSION_ROUTING_PENDING')
    assert.equal(Object.hasOwn(pending, 'self'), false, '보류 응답이 snapshot 본문을 실었다')
    // 보류 응답이 새 join을 따로 만들지 않는다(같은 범위의 진행 중 작업을 공유한다).
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
    // F-26(AC-03): 재동기화는 **canonical 검사를 통과한 연결만** 유예 취소·join을 시작한다.
    // 이 시험이 보려는 것은 "그 순간에는 정당했던 연결이 join 도중에 교체되는" 창이므로,
    // 시작 시점의 canonical 등록을 실제 등록부에 그대로 심어 둔다(새로고침 직전의 사실이다).
    socket.__getOnlineUsersForTests().set('f26p-a', oldSocket.id)
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

// ---------------------------------------------------------------------------
// F-26(AC-03) · 재동기화의 **세 경합 경계**
//
// 아래 세 시험은 각각 하나의 경계만 고정한다:
//   (1) 진입 canonical 검사가 유예 취소·join **보다 먼저**인가
//   (2) socket.id를 **토큰 생성 시점의 값**과 비교하는가(같은 객체의 현재 id가 아니라)
//   (3) 비동기 구간 뒤에 "이 호출이 여전히 이 소켓의 최신 작업인가"를 다시 묻는가
// ---------------------------------------------------------------------------

test('F-26(AC-03): canonical이 아닌 옛 연결의 재동기화는 유예 취소도 채널 가입도 시작하지 않는다', async (t) => {
    resetConnectionTestState()
    stubExternalConnectionBoundaries(t)
    t.after(resetConnectionTestState)

    const session = commitSessionForConnection('room-f26-entry', ['f26c-a', 'f26c-b'])

    // 그 계정의 연결이 끊겨 재접속 유예가 돌기 시작한다(이 유예의 주인은 **다음 연결**이다).
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

    // 같은 계정의 새 연결이 canonical이 된다.
    const currentSocket = createFakeSocket('f26c-a')
    io.sockets.sockets.set(currentSocket.id, currentSocket)
    socket.__getOnlineUsersForTests().set('f26c-a', currentSocket.id)

    // 이제서야 **남이 된** 옛 연결의 재동기화가 도착한다(늦은 connect 처리·중복 호출의 모양이다).
    staleSocket.connected = true
    io.sockets.sockets.set(staleSocket.id, staleSocket)
    await gameSessionSocketLayer.resyncSessionRouting(staleSocket, 'f26c-a')

    assert.deepEqual(staleSocket.joined, [], '남이 된 연결이 경기 채널 가입을 시작했다')
    assert.equal(staleSocket.rooms.has(session.channelId), false)
    assert.notEqual(
        gameSessionSocketLayer.__testables.getDisconnectGraceRun(session.id, 'f26c-a'), undefined,
        '남이 된 연결의 재동기화가 남의 재접속 유예를 취소했다',
    )

    // 양성 대조 — 현재 canonical 연결의 재동기화는 그 둘을 모두 수행한다.
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

    // **같은 객체 위에서 sid만 재발급된다.** 토큰이 socket.id를 값으로 붙잡지 않으면(=token.socket.id와
    // 비교하면) 이 교체는 비교에 전혀 드러나지 않는다 — 언제나 자기 자신과 같기 때문이다.
    // 새 sid는 정상 canonical이므로 다른 축(registry·namespace)은 모두 통과한다.
    io.sockets.sockets.delete(fakeSocket.id)
    fakeSocket.id = 'sock-f26i-a-reissued'
    io.sockets.sockets.set(fakeSocket.id, fakeSocket)
    socket.__getOnlineUsersForTests().set('f26i-a', fakeSocket.id)

    releaseJoin()
    await resyncing

    // 옛 작업은 자기 가입을 확정하지 않고 놓는다(leave를 실제로 시도했다).
    assert.deepEqual(fakeSocket.left, [session.channelId],
        'sid 재발급이 옛 작업의 재검사에 전혀 드러나지 않았다')
    // 그러면서도 **지금 정당한 소속**은 지운 채로 두지 않는다(채널 소유 재확인이 되돌려 놓는다).
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

    // 그 사이 같은 판에서 **소속이 교체된다**(이탈→재입장의 모양이다). 범위가 달라졌으므로 다음
    // 재동기화는 옛 작업을 공유하지 않고 자기 토큰으로 새로 시작한다.
    session.players.get('f26t-a').membershipId = 'mem-f26t-a-2'
    // 새 작업의 join은 기다리지 않는다(gate를 공유하지 않도록 즉시 끝나는 join으로 바꾼다).
    fakeSocket.join = async (roomId) => {
        fakeSocket.joined.push(roomId)
        fakeSocket.rooms.add(roomId)
    }
    await gameSessionSocketLayer.resyncSessionRouting(fakeSocket, 'f26t-a')
    assert.equal(fakeSocket.rooms.has(session.channelId), true, '전제: 새 작업이 재가입을 끝내야 한다')

    // 이제서야 옛 join이 끝난다 — 그 시점의 판정·정리는 전부 **남의 작업**에 대한 것이다.
    releaseJoin()
    await resyncing

    assert.deepEqual(fakeSocket.left, [],
        '최신 작업이 아닌 옛 호출이 새 작업이 만든 채널 가입을 되돌렸다')
    assert.equal(fakeSocket.rooms.has(session.channelId), true)
    assert.equal(fakeSocket.data.activeGameId, session.id,
        '최신 작업이 아닌 옛 호출이 activeGameId를 되돌렸다')
})
