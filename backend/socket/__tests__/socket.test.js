const test = require('node:test')
const assert = require('node:assert/strict')

const socket = require('../socket')
const matchmaking = require('../matchmaking')
const gameSessionSocketLayer = require('../gameSession')

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
    assert.equal(onDisconnectMock.mock.calls[0].arguments[1], 'uuid-1')
})
