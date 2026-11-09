// 빈칸 채우기 시험: leave_matchmaking 받기 (자동 매칭 줄에서 빠지기) — 빈칸찾기 하 4
// 자동 매칭은 꺼진 기능이지만 사건은 붙어 있음 → 붙은 처리기가 줄에서 나만 빼고, 줄에 없어도 안 터지는지만 봄
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../../socket/matchmaking')
const { registerLobbyEvents } = require('../../socket/matchmaking/registerEvents')

// 소켓 흉내: on으로 붙은 처리기를 이름별로 모음
function socketWithHandlers(uuid) {
    const handlers = new Map()
    return {
        id: `sock-${uuid}`,
        data: { user: { uuid } },
        emitted: [],
        on(event, handler) { handlers.set(event, handler) },
        emit(event, payload) { this.emitted.push({ event, payload }) },
        fire(event, ...args) { return handlers.get(event)(...args) },
    }
}

const queuedUuids = () => matchmaking.__getStateSnapshotForTests().matchmakingQueue.map(([uuid]) => uuid)

test.beforeEach(() => matchmaking.__resetStateForTests())
test.after(() => matchmaking.__resetStateForTests())

test('줄에 선 사람이 leave_matchmaking을 보내면 → 그 사람만 줄에서 빠짐', () => {
    const socket = socketWithHandlers('leaver')
    registerLobbyEvents({}, socket, 'leaver')
    matchmaking.__seedMatchmakingQueueForTests('leaver', { uuid: 'leaver', nickname: 'a', socketId: socket.id })
    matchmaking.__seedMatchmakingQueueForTests('stayer', { uuid: 'stayer', nickname: 'b', socketId: 'sock-stayer' })
    socket.fire('leave_matchmaking')
    assert.deepEqual(queuedUuids(), ['stayer'])
    assert.deepEqual(socket.emitted, [])
})

test('줄에 없는 사람이 보내도 → 오류 없이 끝나고 남의 줄은 그대로', () => {
    const socket = socketWithHandlers('nobody')
    registerLobbyEvents({}, socket, 'nobody')
    matchmaking.__seedMatchmakingQueueForTests('stayer', { uuid: 'stayer', nickname: 'b', socketId: 'sock-stayer' })
    assert.doesNotThrow(() => socket.fire('leave_matchmaking'))
    assert.doesNotThrow(() => socket.fire('leave_matchmaking', { junk: true }))
    assert.deepEqual(queuedUuids(), ['stayer'])
})
